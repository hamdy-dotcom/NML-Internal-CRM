import { createClient } from "@/lib/supabase/server";
import PipelineBoard from "./PipelineBoard";
import type { VMerchantList } from "@/lib/database.types";

export const PIPELINE_STAGES = [
  "assigned",
  "contacted",
  "interested",
  "form_sent",
  "cta_completed",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

interface PageProps {
  searchParams: Promise<{ view?: string; specialist?: string }>;
}

export default async function PipelinePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  const managerRoles = ["admin", "acq_manager"];
  const isManager = managerRoles.includes(profile?.role ?? "");
  const viewMode =
    params.view === "team" && isManager ? "team" : "my";

  // Fetch merchants for each pipeline column
  const columnData: Record<PipelineStage, VMerchantList[]> = {
    assigned:      [],
    contacted:     [],
    interested:    [],
    form_sent:     [],
    cta_completed: [],
  };
  const columnCounts: Record<PipelineStage, number> = {
    assigned:      0,
    contacted:     0,
    interested:    0,
    form_sent:     0,
    cta_completed: 0,
  };

  await Promise.all(
    PIPELINE_STAGES.map(async (stage) => {
      let q = supabase
        .from("v_merchants_list")
        .select("*", { count: "exact" })
        .eq("stage", stage)
        .order("updated_at", { ascending: false })
        .limit(100);

      if (viewMode === "my") {
        q = q.eq("acquisition_owner_id", user!.id);
      } else if (params.specialist) {
        q = q.eq("acquisition_owner_id", params.specialist);
      }

      const { data, count } = await q;
      columnData[stage] = (data ?? []) as VMerchantList[];
      columnCounts[stage] = count ?? 0;
    }),
  );

  // Fetch specialist list for team view filter
  const specialists =
    isManager
      ? (
          await supabase
            .from("profiles")
            .select("id, full_name")
            .in("role", ["acq_specialist", "acq_manager"])
            .eq("is_active", true)
            .order("full_name")
        ).data ?? []
      : [];

  return (
    <PipelineBoard
      columnData={columnData}
      columnCounts={columnCounts}
      isManager={isManager}
      viewMode={viewMode}
      selectedSpecialist={params.specialist}
      specialists={specialists as { id: string; full_name: string | null }[]}
      currentUserId={user!.id}
    />
  );
}
