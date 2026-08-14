import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import TasksList from "./TasksList";
import type { UserRole } from "@/lib/database.types";

export default async function TasksPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const raw = await supabase.from("profiles").select("role").eq("id", user!.id).single();
  const profile = raw.data as { role: UserRole } | null;

  const isManager = profile?.role === "admin" || profile?.role === "acq_manager";

  return (
    <Suspense fallback={<div style={{ padding: "20px 0", color: "var(--ink-3)" }}>Loading…</div>}>
      <TasksList currentUserId={user!.id} isManager={isManager} />
    </Suspense>
  );
}
