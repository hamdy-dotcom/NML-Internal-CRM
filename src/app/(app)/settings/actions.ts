"use server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// ── Auth guard ─────────────────────────────────────────────────────────────
async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!["admin", "acq_manager"].includes(data?.role ?? "")) throw new Error("Forbidden");
  return { supabase, userId: user.id };
}

// ── Users ──────────────────────────────────────────────────────────────────
const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1).optional(),
  role: z.enum(["admin", "acq_manager", "acq_specialist", "account_manager", "catalog_ops", "viewer"]).optional(),
  team_id: z.string().uuid().nullable().optional(),
  max_open_merchants: z.coerce.number().int().min(1).max(200).optional(),
  is_active: z.boolean().optional(),
});

export async function updateUser(formData: FormData) {
  const { supabase } = await requireAdmin();
  const raw = Object.fromEntries(formData);
  const parsed = updateUserSchema.safeParse({
    ...raw,
    is_active: raw.is_active === "true",
    max_open_merchants: raw.max_open_merchants ? Number(raw.max_open_merchants) : undefined,
    team_id: raw.team_id || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation error" };

  const { id, ...update } = parsed.data;
  const { error } = await supabase.from("profiles").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Teams ──────────────────────────────────────────────────────────────────
const teamSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["acquisition", "account_management", "catalog"]),
  manager_id: z.string().uuid().nullable().optional(),
});

export async function createTeam(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = teamSchema.safeParse({
    ...Object.fromEntries(formData),
    manager_id: formData.get("manager_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation error" };
  const { error } = await supabase.from("teams").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateTeam(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = formData.get("id") as string;
  const parsed = teamSchema.safeParse({
    ...Object.fromEntries(formData),
    manager_id: formData.get("manager_id") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation error" };
  const { error } = await supabase.from("teams").update(parsed.data).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Lookups ────────────────────────────────────────────────────────────────
const lookupSchema = z.object({
  kind: z.string().min(1).max(40),
  value: z.string().min(1).max(80),
  value_ar: z.string().max(80).nullable().optional(),
  sort_order: z.coerce.number().int().default(0),
});

export async function createLookup(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = lookupSchema.safeParse({
    ...Object.fromEntries(formData),
    value_ar: formData.get("value_ar") || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation error" };
  const { error } = await supabase.from("lookups").insert({ ...parsed.data, is_active: true });
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function toggleLookup(id: string, is_active: boolean) {
  "use server";
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("lookups").update({ is_active }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Onboarding templates ───────────────────────────────────────────────────
export async function setDefaultTemplate(id: string) {
  "use server";
  const { supabase } = await requireAdmin();
  await supabase.from("onboarding_templates").update({ is_default: false }).neq("id", id);
  const { error } = await supabase.from("onboarding_templates").update({ is_default: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

// ── Create user (admin only) ───────────────────────────────────────────────
const createUserSchema = z.object({
  email:     z.string().email(),
  full_name: z.string().min(1).max(120),
  role:      z.enum(["admin", "acq_manager", "acq_specialist", "account_manager", "catalog_ops", "viewer"]),
  password:  z.string().min(8).max(72),
});

export async function createUser(formData: FormData) {
  await requireAdmin();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Validation error" };

  const { email, full_name, role, password } = parsed.data;

  // Create the auth user with a confirmed email and a temporary password
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return { error: authErr.message };

  // Insert / upsert the profile row (the DB trigger may create it, but set fields explicitly)
  const userId = authData.user.id;
  await adminClient
    .from("profiles")
    .upsert({ id: userId, email, full_name, role, must_change_password: true } as never);

  revalidatePath("/settings");
  return { ok: true };
}

// ── Send password reset ────────────────────────────────────────────────────
export async function sendPasswordReset(email: string) {
  "use server";
  await requireAdmin();
  const { error } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4630"}/auth/callback?next=/auth/update-password`,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
