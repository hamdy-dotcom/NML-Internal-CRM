"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { StepStatus, MerchantStage } from "@/lib/database.types";

// Assign an account manager and atomically move the merchant from
// cta_completed → onboarding in one UPDATE. The stage guard trigger allows
// the transition because account_manager_id is already set in `new`.
//
// Defensive: if no merchant_onboarding row exists (e.g. merchant was seeded
// directly at cta_completed and the instantiation trigger never fired),
// we create it here rather than leaving the AM with em-dash step columns.
export async function assignAccountManager(merchantId: string, amId: string) {
  const supabase = await createClient();

  // 1. Assign AM + move to onboarding
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("merchants") as any)
    .update({ account_manager_id: amId, stage: "onboarding" as MerchantStage })
    .eq("id", merchantId);
  if (error) return { error: error.message as string };

  // 2. If no onboarding record exists yet, create it from the default template
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from("merchant_onboarding") as any)
    .select("id")
    .eq("merchant_id", merchantId)
    .maybeSingle();

  if (!existing) {
    // Read the merchant's cta_completed_at for due dates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: merchant } = await (supabase.from("merchants") as any)
      .select("cta_completed_at")
      .eq("id", merchantId)
      .single();

    // Resolve the default template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tpl } = await (supabase.from("onboarding_templates") as any)
      .select("id")
      .eq("is_default", true)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (tpl) {
      // Insert onboarding header
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: ob, error: obErr } = await (supabase.from("merchant_onboarding") as any)
        .insert({ merchant_id: merchantId, template_id: tpl.id })
        .select("id")
        .single();

      if (!obErr && ob) {
        // Read template steps
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tplSteps } = await (supabase.from("onboarding_template_steps") as any)
          .select("order_index, title, description, is_required")
          .eq("template_id", tpl.id)
          .order("order_index", { ascending: true });

        if ((tplSteps ?? []).length > 0) {
          const stepRows = (tplSteps as Array<{
            order_index: number; title: string;
            description: string | null; is_required: boolean;
          }>).map(s => ({
            onboarding_id: ob.id,
            merchant_id:   merchantId,
            order_index:   s.order_index,
            title:         s.title,
            description:   s.description,
            is_required:   s.is_required,
            owner_id:      amId,
            due_at:        (merchant as { cta_completed_at: string | null } | null)?.cta_completed_at ?? null,
          }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("merchant_onboarding_steps") as any).insert(stepRows);
        }
      }
    }
  }

  revalidatePath("/onboarding");
  revalidatePath(`/merchants/${merchantId}`);
  return {};
}

// Toggle a step between done ↔ pending. Surfaces any trigger exception verbatim.
export async function toggleStep(stepId: string, currentStatus: StepStatus) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isDone = currentStatus === "done";
  const patch = isDone
    ? { status: "pending" as StepStatus, completed_at: null as null, completed_by: null as null }
    : { status: "done" as StepStatus, completed_at: new Date().toISOString(), completed_by: user?.id ?? null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("merchant_onboarding_steps") as any)
    .update(patch).eq("id", stepId);
  if (error) return { error: error.message as string };
  revalidatePath("/onboarding");
  return {};
}

// Move merchant to active. The stage guard checks all required steps are done.
export async function activateMerchant(merchantId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("merchants") as any)
    .update({ stage: "active" as MerchantStage })
    .eq("id", merchantId);
  if (error) return { error: error.message as string };
  revalidatePath("/onboarding");
  revalidatePath("/");
  return {};
}

// Kept for OnboardingTab.tsx compatibility
export async function updateStepStatus(
  stepId: string,
  status: StepStatus,
  blockedReason?: string,
) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder = supabase.from("merchant_onboarding_steps") as any;
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.completed_at = new Date().toISOString();
  if (status === "blocked" && blockedReason) patch.blocked_reason = blockedReason;
  const { error } = await builder.update(patch).eq("id", stepId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
}

export async function completeStep(stepId: string) {
  const res = await toggleStep(stepId, "pending");
  if (res.error) throw new Error(res.error);
}

export async function reassignStepOwner(stepId: string, ownerId: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("merchant_onboarding_steps") as any)
    .update({ owner_id: ownerId }).eq("id", stepId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/onboarding");
}
