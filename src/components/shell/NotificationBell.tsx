"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/lib/database.types";
import { timeAgo } from "@/lib/utils";
import Link from "next/link";

export default function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const supabase = createClient();

  const unread = notifications.filter(n => !n.read_at).length;

  useEffect(() => {
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => { if (data) setNotifications(data); });
  }, [userId]);

  async function markAllRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() } as never).eq("user_id", userId).is("read_at", null);
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ position: "relative", background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", color: "var(--ink-2)", fontSize: 18 }}
      >
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: 2, insetInlineEnd: 2, width: 8, height: 8, background: "var(--nml-red)", borderRadius: "50%", display: "block" }} />
        )}
      </button>

      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", insetInlineEnd: 0, top: "calc(100% + 6px)", width: 320, background: "rgba(255,255,255,.95)", border: "1px solid var(--g-line)", borderRadius: 14, boxShadow: "var(--shadow)", zIndex: 50, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--g-line)" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Notifications</span>
              {unread > 0 && <button onClick={markAllRead} style={{ fontSize: 11.5, color: "var(--blue)", background: "none", border: "none", cursor: "pointer" }}>Mark all read</button>}
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {notifications.length === 0 && (
                <div style={{ padding: "24px 14px", textAlign: "center", color: "var(--ink-3)", fontSize: 12.5 }}>You're all caught up</div>
              )}
              {notifications.map(n => (
                <Link key={n.id} href={n.link ?? "#"} onClick={() => setOpen(false)} style={{ display: "flex", gap: 10, padding: "10px 14px", textDecoration: "none", background: n.read_at ? "transparent" : "rgba(226,237,251,.35)", borderBottom: "1px solid rgba(255,255,255,.6)" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: n.read_at ? 400 : 500 }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2 }}>{n.body}</div>}
                    <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
