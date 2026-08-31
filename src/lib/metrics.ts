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
// Optional cohort filter: restrict to merchants whose created_at >= dateStart.
// Dashboard funnel uses this metric.

export const FUNNEL_SELECT =
  "assigned_at, first_contact_at, interested_at, form_sent_at, cta_completed_at, onboarding_started_at, activated_at";

export type FunnelRow = {
  assigned_at:           string | null;
  first_contact_at:      string | null;
  interested_at:         string | null;
  form_sent_at:          string | null;
  cta_completed_at:      string | null;
  onboarding_started_at: string | null;
  activated_at:          string | null;
};

export function buildFunnelCounts(rows: FunnelRow[]): Partial<Record<MerchantStage, number>> {
  return {
    new:           rows.length,
    assigned:      rows.filter(r => r.assigned_at            != null).length,
    contacted:     rows.filter(r => r.first_contact_at       != null).length,
    interested:    rows.filter(r => r.interested_at          != null).length,
    form_sent:     rows.filter(r => r.form_sent_at           != null).length,
    cta_completed: rows.filter(r => r.cta_completed_at       != null).length,
    onboarding:    rows.filter(r => r.onboarding_started_at  != null).length,
    active:        rows.filter(r => r.activated_at           != null).length,
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
