export const dynamic = "force-dynamic";

import { adminClient } from "@/lib/supabase/admin";
import type { FormLink, FormTemplate, Merchant, Lookup } from "@/lib/database.types";
import PublicForm, { WallScreen } from "./PublicForm";

interface PageProps {
  params: Promise<{ token: string }>;
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function PublicFormPage({ params }: PageProps) {
  const { token } = await params;

  type FormLinkRow = FormLink & {
    form_templates: FormTemplate;
    merchants: Merchant;
  };

  const { data: link, error: linkError } = await adminClient
    .from("form_links")
    .select("*, form_templates(*), merchants(*)")
    .eq("token", token)
    .single<FormLinkRow>();

  if (linkError || !link) {
    return (
      <WallScreen
        dir="rtl"
        icon={<span style={{ fontSize: 24 }}>⚠</span>}
        iconBg="rgba(250,214,214,.65)"
        title="الرابط غير صالح"
        body="هذا الرابط لم يعد صالحاً — تواصل مع ممثل NML الخاص بك. This link is no longer valid — contact your NML representative."
      />
    );
  }

  // Expired
  if (new Date(link.expires_at) < new Date()) {
    return (
      <WallScreen
        dir="rtl"
        icon={<span style={{ fontSize: 24, color: "#8a5a10" }}>⏱</span>}
        iconBg="rgba(253,234,204,.72)"
        title="انتهت صلاحية الرابط"
        body="هذا الرابط صالح لمدة ٣٠ يوماً وقد انتهت مدته. اطلب رابطاً جديداً من مسؤول الحساب."
      />
    );
  }

  // Revoked
  if (link.status === "revoked") {
    return (
      <WallScreen
        dir="rtl"
        icon={<span style={{ fontSize: 24, color: "#8c2322" }}>✕</span>}
        iconBg="rgba(250,214,214,.65)"
        title="تم إلغاء الرابط"
        body="تم إلغاء تفعيل هذا الرابط. This link has been deactivated."
      />
    );
  }

  // Already submitted
  if (link.status === "submitted") {
    return (
      <WallScreen
        dir="rtl"
        icon={<span style={{ fontSize: 24, color: "#1d5637" }}>✓</span>}
        iconBg="rgba(217,240,226,.7)"
        title="تم الإرسال مسبقاً"
        body="شكراً! تم استلام نموذجك بنجاح. Thank you! Your form has already been submitted."
      />
    );
  }

  // First open → mark as opened
  if (link.status === "sent") {
    await adminClient
      .from("form_links")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("token", token);
  }

  // Lookups
  const { data: rawLookups } = await adminClient
    .from("lookups")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  const lookups: Record<string, { value: string; value_ar: string | null }[]> = {};
  for (const row of (rawLookups ?? []) as Lookup[]) {
    if (!lookups[row.kind]) lookups[row.kind] = [];
    lookups[row.kind].push({ value: row.value, value_ar: row.value_ar });
  }

  return (
    <PublicForm
      token={token}
      schema={link.form_templates.schema}
      merchant={link.merchants}
      lookups={lookups}
    />
  );
}
