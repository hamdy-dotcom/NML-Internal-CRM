import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

// ── In-memory rate limit (use Redis in production) ─────────────────────────
// Tracks attempt timestamps per key; allows up to MAX_ATTEMPTS within WINDOW_MS.
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const attempts = (rateLimitMap.get(key) ?? []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (attempts.length >= MAX_ATTEMPTS) return true;
  attempts.push(now);
  rateLimitMap.set(key, attempts);
  return false;
}

// Fields that the form pre-populates from merchant data — never block on these
// being absent even if the form template schema marks them required, since the
// merchant can't fill them without entering edit mode.
const SCHEMA_OPTIONAL_OVERRIDE = new Set(["owner_name"]);

// ── Merchant fields we allow the form to update ────────────────────────────
const ALLOWED_MERCHANT_FIELDS = [
  "cr_number",
  "vat_number",
  "iban",
  "pickup_address",
  "owner_name",
  "phone",
  "email",
  "city",
] as const;

interface SubmitBody {
  token: string;
  data: Record<string, unknown>;
  files: Record<string, string>;
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    return await handleSubmit(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[form-submit] unhandled:", msg);
    return Response.json({ error: `Server error: ${msg}` }, { status: 500 });
  }
}

async function handleSubmit(req: NextRequest) {
  // ── Rate limit ─────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";

  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { token, data, files } = body;

  if (!token) {
    return Response.json({ error: "Token is required" }, { status: 400 });
  }

  const rateLimitKey = `${ip}:${token}`;
  if (isRateLimited(rateLimitKey)) {
    return Response.json(
      { error: "حدث خطأ في الإرسال، يرجى الانتظار لحظة وإعادة المحاولة" },
      { status: 429 },
    );
  }

  // ── Validate token ─────────────────────────────────────────────────────
  type LinkRow = {
    id: string;
    merchant_id: string;
    template_id: string;
    status: string;
    expires_at: string;
    form_templates: { schema: Json } | null;
  };

  const { data: link, error: linkError } = await adminClient
    .from("form_links")
    .select("id, merchant_id, template_id, status, expires_at, form_templates(schema)")
    .eq("token", token)
    .single<LinkRow>();

  if (linkError || !link) {
    return Response.json({ error: "الرابط غير صالح" }, { status: 400 });
  }

  if (new Date(link.expires_at) < new Date()) {
    return Response.json({ error: "انتهت صلاحية هذا الرابط" }, { status: 400 });
  }

  if (link.status === "revoked") {
    return Response.json({ error: "تم إلغاء تفعيل هذا الرابط" }, { status: 400 });
  }

  if (link.status === "submitted") {
    return Response.json({ error: "تم إرسال هذا النموذج مسبقاً، شكراً لك!" }, { status: 400 });
  }

  // ── Validate required fields from schema ────────────────────────────────
  interface SchemaField {
    key: string;
    label: string;
    type: string;
    required: boolean;
  }

  const schema = Array.isArray(link.form_templates?.schema)
    ? (link.form_templates!.schema as unknown as SchemaField[])
    : [];

  const missingFields: string[] = [];
  for (const field of schema) {
    if (!field.required) continue;
    if (SCHEMA_OPTIONAL_OVERRIDE.has(field.key)) continue;
    const value = data[field.key];
    const isEmpty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0) ||
      (field.type === "checkbox" && value !== true) ||
      (field.type === "file" && !files[field.key]);
    if (isEmpty) missingFields.push(field.label);
  }

  if (missingFields.length > 0) {
    return Response.json(
      { error: `يرجى تعبئة الحقول المطلوبة: ${missingFields.join("، ")}` },
      { status: 400 },
    );
  }

  // ── Insert form submission ──────────────────────────────────────────────
  const userAgent = req.headers.get("user-agent") ?? null;

  const { error: submissionError } = await adminClient
    .from("form_submissions")
    .insert({
      form_link_id: link.id,
      merchant_id: link.merchant_id,
      template_id: link.template_id,
      data: data as Json,
      files: files as Json,
      submitted_ip: ip,
      user_agent: userAgent,
    });

  if (submissionError) {
    return Response.json({ error: submissionError.message }, { status: 500 });
  }

  // ── Update form_links ──────────────────────────────────────────────────
  const { error: linkUpdateError } = await adminClient
    .from("form_links")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", link.id);

  if (linkUpdateError) {
    return Response.json({ error: linkUpdateError.message }, { status: 500 });
  }

  // ── Update merchant fields ─────────────────────────────────────────────
  // Non-fatal: form_submission and form_links are already committed.
  // If this fails, the submission is still captured; we log for manual recovery.
  const merchantUpdate: Record<string, unknown> = {};
  for (const field of ALLOWED_MERCHANT_FIELDS) {
    if (data[field] !== undefined && data[field] !== "") {
      merchantUpdate[field] = data[field];
    }
  }
  merchantUpdate.stage = "cta_completed";
  merchantUpdate.cta_completed_at = new Date().toISOString();

  const { error: merchantError } = await adminClient
    .from("merchants")
    .update(merchantUpdate as Parameters<typeof adminClient.from>[0] extends never ? never : Record<string, unknown>)
    .eq("id", link.merchant_id);

  if (merchantError) {
    console.error(
      `[form-submit] merchant stage update failed for merchant_id=${link.merchant_id} form_link_id=${link.id}: ${merchantError.message}`,
    );
  }

  return Response.json({ success: true });
}
