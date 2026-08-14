"use client";
import { useState, useTransition } from "react";
import type { Lookup, UserRole } from "@/lib/database.types";
import { createLookup, toggleLookup } from "./actions";
import { toast } from "sonner";
import EmptyState from "@/components/ui/EmptyState";

interface Props {
  grouped: Record<string, Lookup[] | null | undefined>;
  currentRole: UserRole;
}

export default function LookupsClient({ grouped, currentRole }: Props) {
  const [activeKind, setActiveKind] = useState(Object.keys(grouped)[0] ?? "");
  const [showAdd, setShowAdd] = useState(false);
  const [pending, startTransition] = useTransition();
  const canEdit = currentRole === "admin";
  const kinds = Object.keys(grouped);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createLookup(fd);
      if (res?.error) toast.error(res.error);
      else { toast.success("Lookup added"); setShowAdd(false); window.location.reload(); }
    });
  }

  const rows = grouped[activeKind] ?? [];

  return (
    <div style={{ display: "flex", gap: 12 }}>
      {/* Kind list */}
      <div className="glass-panel" style={{ padding: 8, width: 180, flexShrink: 0 }}>
        {kinds.map(k => (
          <button
            key={k}
            onClick={() => setActiveKind(k)}
            className={activeKind === k ? "pill dark" : "pill ghost"}
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 2, fontSize: 12.5 }}
          >
            {k}
          </button>
        ))}
        {canEdit && (
          <button
            className="pill outline"
            style={{ width: "100%", marginTop: 8, fontSize: 12 }}
            onClick={() => setShowAdd(true)}
          >
            + New lookup
          </button>
        )}
      </div>

      {/* Values */}
      <div className="glass-panel" style={{ padding: 16, flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{activeKind}</div>
        {rows.length === 0 ? (
          <EmptyState icon="🔍" title="No values" />
        ) : (
          <table className="nml-table">
            <thead><tr><th>Value</th><th>Arabic</th><th>Order</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {rows.map(l => (
                <tr key={l.id}>
                  <td>{l.value}</td>
                  <td>{l.value_ar ?? "—"}</td>
                  <td className="num">{l.sort_order}</td>
                  <td><span className={`badge ${l.is_active ? "badge-green" : "badge-ghost"}`}>{l.is_active ? "Active" : "Off"}</span></td>
                  <td>
                    {canEdit && (
                      <button
                        className="pill ghost"
                        style={{ fontSize: 11 }}
                        onClick={() => startTransition(async () => {
                          const res = await toggleLookup(l.id, !l.is_active);
                          if (res?.error) toast.error(res.error);
                          else window.location.reload();
                        })}
                      >
                        {l.is_active ? "Disable" : "Enable"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showAdd && (
          <form onSubmit={handleCreate} style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: "var(--g-card)", borderRadius: 8 }}>
            <label className="field-label" style={{ minWidth: 140 }}>
              Kind
              <input name="kind" className="field" defaultValue={activeKind} required />
            </label>
            <label className="field-label" style={{ minWidth: 140 }}>
              Value (EN)
              <input name="value" className="field" required />
            </label>
            <label className="field-label" style={{ minWidth: 140 }}>
              Value (AR)
              <input name="value_ar" className="field" />
            </label>
            <label className="field-label" style={{ width: 80 }}>
              Order
              <input name="sort_order" type="number" className="field" defaultValue="0" />
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
              <button type="submit" disabled={pending} className="pill dark" style={{ fontSize: 12 }}>Add</button>
              <button type="button" onClick={() => setShowAdd(false)} className="pill ghost" style={{ fontSize: 12 }}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
