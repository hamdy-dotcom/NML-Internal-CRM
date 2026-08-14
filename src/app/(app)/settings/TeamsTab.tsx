import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";
import EmptyState from "@/components/ui/EmptyState";
import TeamsClient from "./TeamsClient";

export default async function TeamsTab({ currentRole }: { currentRole: UserRole }) {
  const supabase = await createClient();
  const [{ data: teams }, { data: managers }] = await Promise.all([
    supabase.from("teams").select("*").order("name"),
    supabase.from("profiles").select("id, full_name").in("role", ["admin", "acq_manager", "account_manager"]).eq("is_active", true),
  ]);

  return <TeamsClient teams={teams ?? []} managers={managers ?? []} currentRole={currentRole} />;
}
