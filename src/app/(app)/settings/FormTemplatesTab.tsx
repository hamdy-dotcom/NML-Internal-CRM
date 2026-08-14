import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";
import { fmtDate } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";

export default async function FormTemplatesTab({ currentRole }: { currentRole: UserRole }) {
  const supabase = await createClient();
  const { data: templates } = await supabase.from("form_templates").select("*").order("name");

  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Form templates ({templates?.length ?? 0})</div>
      {(!templates || templates.length === 0) ? (
        <EmptyState icon="📝" title="No form templates" description="Form templates define the fields merchants fill in. Create them via the Supabase SQL editor." />
      ) : (
        <table className="nml-table">
          <thead>
            <tr>
              <th>Name</th><th>Slug</th><th>Version</th><th>Active</th><th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td className="mono sub">{t.slug}</td>
                <td className="num">v{t.version}</td>
                <td>
                  <span className={`badge ${t.is_active ? "badge-green" : "badge-ghost"}`}>
                    {t.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="sub">{fmtDate(t.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sub" style={{ marginTop: 12, fontSize: 12 }}>
        Form schema is edited via the Supabase dashboard. The merchant-facing form at <code className="mono">/f/[token]</code> renders fields dynamically from the template schema.
      </p>
    </div>
  );
}
