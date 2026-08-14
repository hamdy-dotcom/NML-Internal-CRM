"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address"); return; }
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--wallpaper)", backgroundAttachment: "fixed", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="glass-card" style={{ width: "100%", maxWidth: 380, padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>Reset password</div>
          <div style={{ fontSize: 13, color: "var(--ink-2)" }}>
            {sent ? "Check your email for a reset link." : "Enter your work email and we'll send a reset link."}
          </div>
        </div>

        {sent ? (
          <a href="/login" className="pill dark" style={{ width: "100%", justifyContent: "center", fontSize: 13, padding: "9px 16px", textDecoration: "none", display: "flex" }}>
            Back to sign in
          </a>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="field-label">Work email</label>
              <input
                className={`field ${error ? "err" : ""}`}
                type="email"
                placeholder="you@nml.sa"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(null); }}
                autoComplete="email"
                autoFocus
              />
              {error && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 5 }}>{error}</div>}
            </div>
            <button
              type="submit"
              className="pill dark"
              disabled={loading}
              style={{ width: "100%", justifyContent: "center", fontSize: 13, padding: "9px 16px" }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <a href="/login" style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none" }}>
                Back to sign in
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
