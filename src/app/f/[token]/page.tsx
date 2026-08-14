export const dynamic = "force-dynamic";

import { adminClient } from "@/lib/supabase/admin";
import type { FormLink, FormTemplate, Merchant, Lookup } from "@/lib/database.types";
import PublicForm from "./PublicForm";

interface PageProps {
  params: Promise<{ token: string }>;
}

// ── Error screen ────────────────────────────────────────────────────────────
function ErrorScreen({ message }: { message: string }) {
  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f9fafb",
        padding: "2rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "1rem",
          padding: "2.5rem",
          maxWidth: "28rem",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
        <p style={{ color: "#374151", fontSize: "1rem", lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function PublicFormPage({ params }: PageProps) {
  const { token } = await params;

  // 1. Resolve form link with joined template + merchant
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
      <ErrorScreen message="هذا الرابط لم يعد صالحاً — تواصل مع ممثل NML الخاص بك. This link is no longer valid — contact your NML representative." />
    );
  }

  // 2. Expired
  if (new Date(link.expires_at) < new Date()) {
    return (
      <ErrorScreen message="انتهت صلاحية هذا الرابط. يرجى التواصل مع ممثل NML للحصول على رابط جديد. This link has expired — please contact your NML representative for a new one." />
    );
  }

  // 3. Revoked
  if (link.status === "revoked") {
    return <ErrorScreen message="تم إلغاء تفعيل هذا الرابط. This link has been deactivated." />;
  }

  // 4. Already submitted
  if (link.status === "submitted") {
    return (
      <ErrorScreen message="شكراً! تم استلام نموذجك بنجاح. Thank you! Your form has already been submitted." />
    );
  }

  // 5. First open → mark as opened
  if (link.status === "sent") {
    await adminClient
      .from("form_links")
      .update({ status: "opened", opened_at: new Date().toISOString() })
      .eq("token", token);
  }

  // 6. Lookups
  const { data: rawLookups } = await adminClient
    .from("lookups")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");

  // Group lookups by kind
  const lookups: Record<string, { value: string; value_ar: string | null }[]> = {};
  for (const row of rawLookups ?? []) {
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
