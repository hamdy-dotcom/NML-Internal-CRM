import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--wallpaper)", backgroundAttachment: "fixed" }}>
      {/* blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div style={{ position: "absolute", top: -120, right: -80, width: 440, height: 440, borderRadius: "50%", background: "#ff9a5b", opacity: 0.35, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -80, width: 480, height: 480, borderRadius: "50%", background: "#5b9bf5", opacity: 0.28, filter: "blur(90px)" }} />
      </div>

      <div className="glass-win relative w-full max-w-sm p-8" style={{ backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--nml-red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>N</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>NML CRM</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Merchant acquisition</div>
          </div>
        </div>

        <LoginForm />
      </div>
    </div>
  );
}
