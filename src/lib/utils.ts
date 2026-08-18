import { formatDistanceToNow, format, isAfter } from "date-fns";
import type { MerchantStage, MerchantPriority, ProductStatus, StepStatus } from "./database.types";

// ── cn helper ──────────────────────────────────────────────────────────────
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(" ");
}

// ── Date helpers ───────────────────────────────────────────────────────────
export function timeAgo(date: string | null): string {
  if (!date) return "—";
  try { return formatDistanceToNow(new Date(date), { addSuffix: true }); }
  catch { return "—"; }
}

export function fmtDate(date: string | null): string {
  if (!date) return "—";
  try { return format(new Date(date), "d MMM yyyy"); }
  catch { return "—"; }
}

export function fmtDateTime(date: string | null): string {
  if (!date) return "—";
  try { return format(new Date(date), "d MMM, h:mm a"); }
  catch { return "—"; }
}

export function isOverdue(date: string | null): boolean {
  if (!date) return false;
  try { return !isAfter(new Date(date), new Date()); }
  catch { return false; }
}

// ── Stage helpers ──────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<MerchantStage, string> = {
  new:           "New",
  assigned:      "Assigned",
  contacted:     "Contacted",
  interested:    "Interested",
  form_sent:     "Form sent",
  cta_completed: "CTA done",
  onboarding:    "Onboarding",
  active:        "Active",
  on_hold:        "On hold",
  lost:           "Lost",
  not_interested: "Not interested",
};

export const STAGE_ORDER: MerchantStage[] = [
  "new", "assigned", "contacted", "interested",
  "form_sent", "cta_completed", "onboarding", "active",
];

export function stageBadgeClass(stage: MerchantStage): string {
  switch (stage) {
    case "new":
    case "assigned":
    case "contacted":
      return "badge badge-ghost";
    case "interested":
    case "form_sent":
    case "onboarding":
      return "badge badge-blue";
    case "cta_completed":
      return "badge badge-blue-s";
    case "active":
      return "badge badge-green";
    case "on_hold":
      return "badge badge-amber";
    case "lost":
    case "not_interested":
      return "badge badge-red";
  }
}

// ── Priority helpers ───────────────────────────────────────────────────────
export const PRIORITY_LABELS: Record<MerchantPriority, string> = {
  high: "High", medium: "Medium", low: "Low",
};

// ── Product status helpers ─────────────────────────────────────────────────
export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  discovered:      "Discovered",
  ready_for_shelf: "Ready for shelf",
  in_review:       "In review",
  shelved:         "Shelved",
  rejected:        "Rejected",
  archived:        "Archived",
};

export function productStatusBadgeClass(status: ProductStatus): string {
  switch (status) {
    case "discovered":      return "badge badge-ghost";
    case "ready_for_shelf": return "badge badge-blue";
    case "in_review":       return "badge badge-amber";
    case "shelved":         return "badge badge-green";
    case "rejected":        return "badge badge-red";
    case "archived":        return "badge badge-ghost";
  }
}

// ── Step status helpers ────────────────────────────────────────────────────
export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  pending:     "Pending",
  in_progress: "In progress",
  done:        "Done",
  skipped:     "Skipped",
  blocked:     "Blocked",
};

// ── Phone helpers ──────────────────────────────────────────────────────────
export function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

export function telLink(phone: string | null): string | null {
  if (!phone) return null;
  return `tel:${phone}`;
}

// ── Number formatters ──────────────────────────────────────────────────────
export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}

export function fmtCurrency(n: string | number | null | undefined, currency = "SAR"): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0 }).format(Number(n));
}

// ── Role helpers ───────────────────────────────────────────────────────────
export function isManager(role: string): boolean {
  return role === "admin" || role === "acq_manager";
}
