"use client";
import { useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import NotificationBell from "./NotificationBell";

interface Props {
  profile: Profile;
  title?: string;
}

export default function TopBar({ profile, title }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = (profile.full_name ?? profile.email ?? "?")
    .split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const colors = ["#3f7fd6","#2f6b48","#8a5a10","#a3302f","#6d28d9","#0891b2"];
  const color = colors[(profile.full_name ?? "").charCodeAt(0) % colors.length] ?? "#3f7fd6";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px 10px 0", justifyContent: "flex-end" }}>
      <NotificationBell userId={profile.id} />

      {/* Avatar / menu */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 12px 4px 4px", borderRadius: "999px", background: "rgba(255,255,255,.6)", border: "1px solid var(--g-line)", fontSize: 12.5, cursor: "pointer" }}
        >
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: color, color: "#fff", fontSize: 10.5, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600 }}>
            {initials}
          </div>
          {profile.full_name ?? profile.email}
        </button>

        {menuOpen && (
          <div
            style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 6px)", background: "rgba(255,255,255,.95)", border: "1px solid var(--g-line)", borderRadius: 12, boxShadow: "var(--shadow)", minWidth: 160, zIndex: 50, overflow: "hidden" }}
          >
            <Link href="/profile" onClick={() => setMenuOpen(false)} style={{ display: "block", padding: "9px 14px", fontSize: 13, color: "var(--ink)", textDecoration: "none" }}>
              My profile
            </Link>
            <div style={{ height: 1, background: "var(--g-line)", margin: "4px 0" }} />
            <button onClick={signOut} style={{ display: "block", width: "100%", padding: "9px 14px", fontSize: 13, color: "var(--red)", textAlign: "start", background: "none", border: "none", cursor: "pointer" }}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {menuOpen && <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
