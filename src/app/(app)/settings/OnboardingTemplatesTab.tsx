import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";
import EmptyState from "@/components/ui/EmptyState";
import SetDefaultButton from "./SetDefaultButton";

export default async function OnboardingTemplatesTab({ currentRole }: { currentRole: UserRole }) {
  const supabase = await createClient();
  const { data: templates } = await supabase.from("onboarding_templates").select("*").order("name");
  const { data: steps } = await supabase.from("onboarding_template_steps").select("*").order("order_index");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(!templates || templates.length === 0) ? (
        <div className="glass-panel" style={{ padding: 16 }}>
          <EmptyState icon="📋" title="No onboarding templates" description="Insert a template in the Supabase SQL editor." />
        </div>
      ) : templates.map(tmpl => {
        const tmplSteps = steps?.filter(s => s.template_id === tmpl.id) ?? [];
        return (
          <div key={tmpl.id} className="glass-panel" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{tmpl.name}</div>
              {tmpl.is_default && <span className="badge badge-green">Default</span>}
              {!tmpl.is_default && <span className="badge badge-ghost">{tmpl.is_active ? "Active" : "Inactive"}</span>}
              {!tmpl.is_default && currentRole === "admin" && (
                <SetDefaultButton templateId={tmpl.id} />
              )}
            </div>
            <table className="nml-table">
              <thead>
                <tr><th>#</th><th>Step</th><th>Owner role</th><th>SLA</th><th>Required</th></tr>
              </thead>
              <tbody>
                {tmplSteps.map(s => (
                  <tr key={s.id}>
                    <td className="num">{s.order_index + 1}</td>
                    <td>{s.title}</td>
                    <td><span className="badge badge-ghost">{s.owner_role}</span></td>
                    <td className="sub">{s.sla_days}d</td>
                    <td>{s.is_required ? <span className="badge badge-red">Required</span> : <span className="sub">Optional</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
