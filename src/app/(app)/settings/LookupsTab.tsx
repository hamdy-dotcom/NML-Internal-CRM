import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";
import EmptyState from "@/components/ui/EmptyState";
import LookupsClient from "./LookupsClient";

export default async function LookupsTab({ currentRole }: { currentRole: UserRole }) {
  const supabase = await createClient();
  const { data: lookups } = await supabase.from("lookups").select("*").order("kind").order("sort_order");

  const grouped: Record<string, typeof lookups> = {};
  for (const l of lookups ?? []) {
    if (!grouped[l.kind]) grouped[l.kind] = [];
    grouped[l.kind]!.push(l);
  }

  return <LookupsClient grouped={grouped} currentRole={currentRole} />;
}
