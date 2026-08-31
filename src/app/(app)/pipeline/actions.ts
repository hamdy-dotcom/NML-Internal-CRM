"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MerchantStage } from "@/lib/database.types";
import { PIPELINE_FUNNEL_STAGES, STAGE_TIMESTAMP_COL } from "@/lib/metrics";

export async function moveMerchantStage(
  merchantId: string,
  newStage: MerchantStage,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  // Determine which timestamp columns to fill.
  // When a merchant advances to a stage, all prior funnel stages that have
  // not yet been stamped get stamped now (preserving any already-set values).
  // This prevents gaps when the team routinely skips stages like Interested.
  const newIdx = PIPELINE_FUNNEL_STAGES.indexOf(newStage as typeof PIPELINE_FUNNEL_STAGES[number]);

  if (newIdx < 0) {
    // Stage is outside the pipeline funnel (e.g. active, on_hold, lost) — just update stage
    const { error } = await supabase
      .from("merchants")
      .update({ stage: newStage })
      .eq("id", merchantId);
    if (error) return { error: error.message };
    revalidatePath("/pipeline");
    return {};
  }

  // Stages that should now be stamped (all funnel stages up to and including new stage)
  const stagesToStamp = PIPELINE_FUNNEL_STAGES.slice(0, newIdx + 1);
  const tsColumns = stagesToStamp
    .map(s => STAGE_TIMESTAMP_COL[s])
    .filter((c): c is string => Boolean(c));

  // Fetch existing timestamps so we only fill nulls (never overwrite earlier dates)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: current, error: fetchErr } = await (supabase as any)
    .from("merchants")
    .select(tsColumns.join(", "))
    .eq("id", merchantId)
    .single() as { data: Record<string, string | null> | null; error: { message: string } | null };

  if (fetchErr) return { error: fetchErr.message };

  const update: Record<string, string> = { stage: newStage };
  for (const s of stagesToStamp) {
    const col = STAGE_TIMESTAMP_COL[s];
    if (!col) continue;
    const existing = current?.[col];
    if (!existing) update[col] = now;
  }

  const { error } = await supabase
    .from("merchants")
    .update(update)
    .eq("id", merchantId);

  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return {};
}

export async function setNextAction(
  merchantId: string,
  nextActionAt: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("merchants")
    .update({ next_action_at: nextActionAt })
    .eq("id", merchantId);
  if (error) return { error: error.message };
  revalidatePath("/pipeline");
  return {};
}
