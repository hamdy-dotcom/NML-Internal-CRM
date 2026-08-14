import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

// ── In-memory rate limit (use Redis in production) ─────────────────────────
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(key: string): boolean {
  const last = rateLimitMap.get(key);
  const now = Date.now();
  if (last && now - last < RATE_LIMIT_WINDOW_MS) return true;
  rateLimitMap.set(key, now);
  return false;
}

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

export async function POST(req: NextRequest) {
  // ── Rate limit ─────────────────────────────────────────────────────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const body = (await req.json()) as SubmitBody;
  const { token, data, files } = body;

  if (!token) {
    return Response.json({ error: "Token is required" }, { status: 400 });
  }

  const rateLimitKey = `${ip}:${token}`;
  if (isRateLimited(rateLimitKey)) {
    return Response.json(
      { error: "Too many submissions — please wait a moment and try again" },
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
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }

  if (new Date(link.expires_at) < new Date()) {
    return Response.json({ error: "This link has expired" }, { status: 400 });
  }

  if (link.status === "revoked") {
    return Response.json({ error: "This link has been deactivated" }, { status: 400 });
  }

  if (link.status === "submitted") {
    return Response.json({ error: "This form has already been submitted" }, { status: 400 });
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
      { error: `Missing required fields: ${missingFields.join(", ")}` },
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
    return Response.json({ error: merchantError.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
