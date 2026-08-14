"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address"); return; }
    if (!password) { setError("Enter your password"); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message === "Invalid login credentials"
        ? "Incorrect email or password"
        : err.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 14 }}>
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
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="field-label">Password</label>
        <input
          className={`field ${error ? "err" : ""}`}
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(null); }}
          autoComplete="current-password"
        />
        {error && <div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 5 }}>{error}</div>}
      </div>
      <button
        type="submit"
        className="pill dark"
        disabled={loading}
        style={{ width: "100%", justifyContent: "center", fontSize: 13, padding: "9px 16px" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <div style={{ textAlign: "center", marginTop: 14 }}>
        <a href="/auth/reset" style={{ fontSize: 12, color: "var(--ink-3)", textDecoration: "none" }}>
          Forgot password?
        </a>
      </div>
    </form>
  );
}
