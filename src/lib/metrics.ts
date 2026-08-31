import type { MerchantStage } from "./database.types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared metric definitions
//
// Three distinct metrics answer three distinct questions.
// Every screen that shows stage counts imports from here — no screen defines
// its own formula.
// ─────────────────────────────────────────────────────────────────────────────

// Map from pipeline stage to the timestamp column that is set (once, forever)
// when a merchant first reaches that stage.
export const STAGE_TIMESTAMP_COL: Partial<Record<MerchantStage, string>> = {
  assigned:      "assigned_at",
  contacted:     "first_contact_at",
  interested:    "interested_at",
  form_sent:     "form_sent_at",
  cta_completed: "cta_completed_at",
  onboarding:    "onboarding_started_at",
  active:        "activated_at",
};

// Full acquisition funnel, in order
export const FUNNEL_STAGES: MerchantStage[] = [
  "new", "assigned", "contacted", "interested",
  "form_sent", "cta_completed", "onboarding", "active",
];

// Pipeline board stages only (subset of the full funnel)
export const PIPELINE_FUNNEL_STAGES: MerchantStage[] = [
  "assigned", "contacted", "interested", "form_sent", "cta_completed",
];

// ── Metric 1: reachedStage ────────────────────────────────────────────────
// How many merchants EVER reached each stage (timestamp IS NOT NULL).
// Cumulative and monotonically decreasing down the funnel.
//
// Implemented as 8 parallel server-side COUNT(*) queries with head:true so
// zero rows are transferred. Never fetch rows to count them.
//
// opts.userId: restrict to a single specialist's merchants (acquisition_owner_id)

export type FunnelCounts = Partial<Record<MerchantStage, number>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchFunnelCounts(supabase: any, opts?: { userId?: string }): Promise<FunnelCounts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function base(): any {
    let q = supabase.from("merchants").select("*", { count: "exact", head: true });
    if (opts?.userId) q = q.eq("acquisition_owner_id", opts.userId);
    return q;
  }

  const [
    { count: nNew },
    { count: assigned },
    { count: contacted },
    { count: interested },
    { count: formSent },
    { count: ctaCompleted },
    { count: onboarding },
    { count: active },
  ] = (await Promise.all([
    base(),
    base().not("assigned_at",            "is", null),
    base().not("first_contact_at",       "is", null),
    base().not("interested_at",          "is", null),
    base().not("form_sent_at",           "is", null),
    base().not("cta_completed_at",       "is", null),
    base().not("onboarding_started_at",  "is", null),
    base().not("activated_at",           "is", null),
  ])) as Array<{ count: number | null }>;

  return {
    new:           nNew          ?? 0,
    assigned:      assigned      ?? 0,
    contacted:     contacted     ?? 0,
    interested:    interested    ?? 0,
    form_sent:     formSent      ?? 0,
    cta_completed: ctaCompleted  ?? 0,
    onboarding:    onboarding    ?? 0,
    active:        active        ?? 0,
  };
}

// ── Metric 2: currentlyAtStage ────────────────────────────────────────────
// How many merchants are sitting at this stage RIGHT NOW (merchants.stage = X).
// These sum to the total merchant count.
// Pipeline board column counts use this metric — shown with "· now" in headers.

// ── Metric 3: reachedStageBySpecialist ───────────────────────────────────
// Same as metric 1, grouped by acquisition_owner_id.
// Sourced from the v_specialist_performance database view.
// Specialist performance table uses this metric — all-time, no date filter.
// Column header labels for the performance table:
export const SPECIALIST_COL_LABELS: Record<string, string> = {
  assigned:  "Reached assigned",
  contacted: "Reached contacted",
  form_sent: "Reached form sent",
  cta_done:  "Reached CTA",
};
