"use client";
import { useState, useTransition } from "react";
import type { Team, UserRole } from "@/lib/database.types";
import { createTeam, updateTeam } from "./actions";
import { toast } from "sonner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";

const TEAM_TYPES = [
  { value: "acquisition", label: "Acquisition" },
  { value: "account_management", label: "Account management" },
  { value: "catalog", label: "Catalog" },
];

interface Manager { id: string; full_name: string | null; }

interface Props {
  teams: Team[];
  managers: Manager[];
  currentRole: UserRole;
}

export default function TeamsClient({ teams: initial, managers, currentRole }: Props) {
  const [teams, setTeams] = useState(initial);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = currentRole === "admin";

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!fd.get("manager_id")) fd.set("manager_id", "");
    startTransition(async () => {
      const res = await createTeam(fd);
      if (res?.error) toast.error(res.error);
      else { toast.success("Team created"); setShowCreate(false); window.location.reload(); }
    });
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateTeam(fd);
      if (res?.error) toast.error(res.error);
      else { toast.success("Team updated"); setEditing(null); window.location.reload(); }
    });
  }

  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Teams ({teams.length})</div>
        {canEdit && <button className="pill dark" style={{ fontSize: 12 }} onClick={() => setShowCreate(true)}>+ New team</button>}
      </div>

      {teams.length === 0 ? (
        <EmptyState icon="👥" title="No teams yet" />
      ) : (
        <table className="nml-table">
          <thead>
            <tr><th>Name</th><th>Type</th><th>Manager</th><th></th></tr>
          </thead>
          <tbody>
            {teams.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.name}</td>
                <td><span className="badge badge-ghost">{TEAM_TYPES.find(tt => tt.value === t.type)?.label}</span></td>
                <td className="sub">{managers.find(m => m.id === t.manager_id)?.full_name ?? "—"}</td>
                <td>{canEdit && <button className="pill ghost" style={{ fontSize: 12 }} onClick={() => setEditing(t)}>Edit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New team">
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field-label">Name<input name="name" className="field" required /></label>
          <label className="field-label">Type
            <select name="type" className="field" required>
              {TEAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field-label">Manager
            <select name="manager_id" className="field">
              <option value="">None</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={pending} className="pill dark" style={{ alignSelf: "flex-end" }}>Create</button>
        </form>
      </Modal>

      {/* Edit modal */}
      {editing && (
        <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit team">
          <form onSubmit={handleUpdate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input type="hidden" name="id" value={editing.id} />
            <label className="field-label">Name<input name="name" className="field" defaultValue={editing.name} required /></label>
            <label className="field-label">Type
              <select name="type" className="field" defaultValue={editing.type} required>
                {TEAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label className="field-label">Manager
              <select name="manager_id" className="field" defaultValue={editing.manager_id ?? ""}>
                <option value="">None</option>
                {managers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </label>
            <button type="submit" disabled={pending} className="pill dark" style={{ alignSelf: "flex-end" }}>Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
