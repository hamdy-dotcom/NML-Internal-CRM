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

  // ── Diagnostic: total rows visible in v_merchants_list with no filter ─────
  const { count: totalVisible, error: diagErr } = await supabase
    .from("v_merchants_list")
    .select("*", { count: "exact", head: true });

  console.log(
    `[pipeline] user=${user!.id} role=${profile?.role ?? "?"} isManager=${isManager} viewMode=${viewMode}`,
  );
  console.log(
    `[pipeline] v_merchants_list total visible (no filter): ${totalVisible ?? "null"} err=${diagErr?.message ?? "none"}`,
  );

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
  const columnErrors: Partial<Record<PipelineStage, string>> = {};

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

      const { data, count, error } = await q;

      if (error) {
        console.error(`[pipeline] stage=${stage} error:`, error.message, error.code);
        columnErrors[stage] = error.message;
      } else {
        console.log(`[pipeline] stage=${stage} count=${count ?? "null"} rows=${data?.length ?? 0}`);
      }

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

  const firstError = Object.values(columnErrors)[0];

  return (
    <>
      {/* Diagnostic banner — remove once the bug is identified */}
      {(firstError || totalVisible === 0) && (
        <div
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            background: "var(--red-bg, #fff0f0)",
            border: "1px solid var(--red, #e04040)",
            borderRadius: 8,
            fontSize: 12.5,
            color: "var(--red, #c00)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          <strong>Pipeline diagnostic</strong>
          <br />
          User: {user!.id} · role: {profile?.role ?? "?"} · isManager: {String(isManager)} · viewMode: {viewMode}
          <br />
          v_merchants_list total visible (no stage filter): {totalVisible ?? "null"}
          {diagErr && <> · view error: {diagErr.message}</>}
          {firstError && (
            <>
              <br />
              Column query error: {firstError}
            </>
          )}
        </div>
      )}
      <PipelineBoard
        columnData={columnData}
        columnCounts={columnCounts}
        isManager={isManager}
        viewMode={viewMode}
        selectedSpecialist={params.specialist}
        specialists={specialists as { id: string; full_name: string | null }[]}
        currentUserId={user!.id}
      />
    </>
  );
}
