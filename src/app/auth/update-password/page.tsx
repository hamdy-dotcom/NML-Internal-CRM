"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirm) { setError("Passwords don't match"); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setLoading(false); setError(err.message); return; }

    // Clear the must_change_password flag
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("profiles").update({ must_change_password: false } as never).eq("id", user.id);
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--wallpaper)", backgroundAttachment: "fixed", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 380, padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>Set a new password</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Choose a password you'll use to sign in to NML CRM.</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label className="field-label">New password</label>
            <input
              className={`field ${error ? "err" : ""}`}
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(null); }}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="field-label">Confirm password</label>
            <input
              className={`field ${error ? "err" : ""}`}
              type="password"
              placeholder="Same password again"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError(null); }}
              autoComplete="new-password"
            />
            {error && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 5 }}>{error}</div>}
          </div>
          <button
            type="submit"
            className="pill dark"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center", fontSize: 13, padding: "9px 16px" }}
          >
            {loading ? "Saving…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
