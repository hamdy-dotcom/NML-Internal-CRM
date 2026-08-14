"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, UserRole } from "@/lib/database.types";
import { updateUser, createUser, sendPasswordReset } from "./actions";
import { toast } from "sonner";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "admin",            label: "Admin" },
  { value: "acq_manager",      label: "Acquisition manager" },
  { value: "acq_specialist",   label: "Acquisition specialist" },
  { value: "account_manager",  label: "Account manager" },
  { value: "catalog_ops",      label: "Catalog ops" },
  { value: "viewer",           label: "Viewer" },
];

interface Props {
  currentUserId: string;
  currentRole: UserRole;
}

export default function UsersTab({ currentUserId, currentRole }: Props) {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  const canAdmin = currentRole === "admin";

  function reload() {
    createClient().from("profiles").select("*").order("full_name").then(({ data }) => {
      if (data) setUsers(data as unknown as Profile[]);
    });
  }

  if (!loaded) {
    reload();
    setLoaded(true);
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("is_active", String((e.currentTarget.querySelector('[name="is_active"]') as HTMLInputElement)?.checked ?? true));
    startTransition(async () => {
      const res = await updateUser(fd);
      if (res?.error) toast.error(res.error);
      else { toast.success("User updated"); setEditing(null); reload(); }
    });
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createUser(fd);
      if (res?.error) toast.error(res.error);
      else { toast.success("User created — they must set a new password on first login"); setShowCreate(false); reload(); }
    });
  }

  async function handleReset(email: string) {
    startTransition(async () => {
      const res = await sendPasswordReset(email);
      if (res?.error) toast.error(res.error);
      else toast.success(`Password reset email sent to ${email}`);
    });
  }

  if (!loaded) return <div className="sub" style={{ padding: 20 }}>Loading…</div>;

  return (
    <div className="glass-panel" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>All users ({users.length})</div>
        {canAdmin && (
          <button className="pill dark" style={{ fontSize: 12 }} onClick={() => setShowCreate(true)}>
            + New user
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState icon="👤" title="No users yet" description="Users appear after first sign-in." />
      ) : (
        <table className="nml-table">
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Role</th><th>Max open</th><th>Active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              editing === u.id ? (
                <tr key={u.id}>
                  <td colSpan={6}>
                    <form onSubmit={handleUpdate} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "4px 0" }}>
                      <input name="id" type="hidden" value={u.id} />
                      <input name="full_name" defaultValue={u.full_name ?? ""} placeholder="Name" className="field" style={{ width: 180 }} />
                      <select name="role" defaultValue={u.role} className="field" style={{ width: 180 }}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <input name="max_open_merchants" type="number" defaultValue={u.max_open_merchants} className="field" style={{ width: 80 }} min={1} max={200} />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input name="is_active" type="checkbox" defaultChecked={u.is_active} />
                        Active
                      </label>
                      <button type="submit" disabled={pending} className="pill dark" style={{ fontSize: 12 }}>Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="pill ghost" style={{ fontSize: 12 }}>Cancel</button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr key={u.id}>
                  <td>
                    {u.full_name ?? "—"}
                    {u.must_change_password && (
                      <span className="badge badge-amber" style={{ marginInlineStart: 6, fontSize: 10 }}>Temp password</span>
                    )}
                  </td>
                  <td className="sub">{u.email}</td>
                  <td><span className="badge badge-ghost">{ROLES.find(r => r.value === u.role)?.label ?? u.role}</span></td>
                  <td className="num">{u.max_open_merchants}</td>
                  <td><span className={`badge ${u.is_active ? "badge-green" : "badge-red"}`}>{u.is_active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {canAdmin && u.id !== currentUserId && (
                        <button onClick={() => setEditing(u.id)} className="pill ghost" style={{ fontSize: 12 }}>Edit</button>
                      )}
                      {canAdmin && u.email && (
                        <button
                          onClick={() => handleReset(u.email!)}
                          disabled={pending}
                          className="pill ghost"
                          style={{ fontSize: 12 }}
                        >
                          Reset pw
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      )}

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create user">
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="field-label">
            Full name
            <input name="full_name" className="field" required placeholder="Ahmed Al Rashid" />
          </label>
          <label className="field-label">
            Work email
            <input name="email" type="email" className="field" required placeholder="ahmed@nml.sa" />
          </label>
          <label className="field-label">
            Role
            <select name="role" className="field" required>
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="field-label">
            Temporary password
            <input
              name="password"
              type="password"
              className="field"
              required
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <p className="sub" style={{ fontSize: 12, margin: 0 }}>
            The user will be prompted to set a new password on first sign-in.
          </p>
          <button type="submit" disabled={pending} className="pill dark" style={{ alignSelf: "flex-end" }}>
            Create user
          </button>
        </form>
      </Modal>
    </div>
  );
}
