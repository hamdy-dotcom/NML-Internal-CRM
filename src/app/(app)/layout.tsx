import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/shell/Sidebar";
import TopBar from "@/components/shell/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");

  // Force password change on first login
  if ((profile as Record<string, unknown>).must_change_password) redirect("/auth/update-password");

  // Badge counts
  const [{ count: leadCount }, { count: taskCount }, { count: productCount }] = await Promise.all([
    supabase.from("merchants").select("*", { count: "exact", head: true }).eq("stage", "new"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("assignee_id", user.id).eq("status", "open").lt("due_at", new Date().toISOString()),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "ready_for_shelf"),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--wallpaper)", backgroundAttachment: "fixed", display: "flex" }}>
      {/* Blobs behind everything */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -120, right: -80, width: 440, height: 440, borderRadius: "50%", background: "#ff9a5b", opacity: 0.28, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -80, width: 480, height: 480, borderRadius: "50%", background: "#5b9bf5", opacity: 0.22, filter: "blur(90px)" }} />
      </div>

      {/* Glass window */}
      <div className="glass-win" style={{ position: "relative", zIndex: 1, margin: 12, flex: 1, display: "flex", minHeight: "calc(100vh - 24px)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)" }}>
        <Sidebar
          role={profile.role}
          leadCount={leadCount ?? 0}
          taskCount={taskCount ?? 0}
          productCount={productCount ?? 0}
        />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, borderInlineStart: "1px solid var(--g-line)" }}>
          <TopBar profile={profile} />
          <div style={{ flex: 1, overflowY: "auto", padding: "0 20px 20px" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
