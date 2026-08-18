import { fmtDate } from "@/lib/utils";
import type { Merchant, MerchantStage } from "@/lib/database.types";

const RAIL_STAGES: { key: MerchantStage; label: string; tsKey: keyof Merchant }[] = [
  { key: "new",           label: "New",        tsKey: "created_at" },
  { key: "assigned",      label: "Assigned",   tsKey: "assigned_at" },
  { key: "contacted",     label: "Contacted",  tsKey: "first_contact_at" },
  { key: "interested",    label: "Interested", tsKey: "interested_at" },
  { key: "form_sent",     label: "Form sent",  tsKey: "form_sent_at" },
  { key: "cta_completed", label: "CTA done",   tsKey: "cta_completed_at" },
  { key: "onboarding",    label: "Onboarding", tsKey: "onboarding_started_at" },
  { key: "active",        label: "Active",     tsKey: "activated_at" },
];

const STAGE_ORDER_IDX: Record<MerchantStage, number> = {
  new: 0, assigned: 1, contacted: 2, interested: 3,
  form_sent: 4, cta_completed: 5, onboarding: 6, active: 7,
  on_hold: -1, lost: -1, not_interested: -1,
};

function daysInStage(merchant: Merchant, idx: number): number | null {
  const stage = RAIL_STAGES[idx];
  if (!stage) return null;
  const entered = merchant[stage.tsKey] as string | null;
  if (!entered) return null;
  const next = RAIL_STAGES[idx + 1];
  const left = next ? (merchant[next.tsKey] as string | null) : null;
  const end = left ? new Date(left) : new Date();
  const diff = Math.floor((end.getTime() - new Date(entered).getTime()) / 86400000);
  return diff;
}

interface StageRailProps {
  merchant: Merchant;
  onStageClick?: (stage: MerchantStage) => void;
}

export default function StageRail({ merchant, onStageClick }: StageRailProps) {
  const currentIdx = STAGE_ORDER_IDX[merchant.stage] ?? -1;
  // For on_hold / lost, show where the merchant was previously
  const effectiveIdx = currentIdx === -1 ? (STAGE_ORDER_IDX[merchant.previous_stage ?? "new"] ?? 0) : currentIdx;

  const fillPct = effectiveIdx > 0 ? (effectiveIdx / (RAIL_STAGES.length - 1)) * 85 + 5 : 5;

  return (
    <div className="glass-panel stage-rail">
      <div className="rail-line" />
      <div className="rail-fill" style={{ width: `${fillPct}%` }} />
      <div className="steps">
        {RAIL_STAGES.map((s, i) => {
          const isDone = i < effectiveIdx;
          const isCurrent = i === effectiveIdx;
          const isTodo = i > effectiveIdx;
          const days = daysInStage(merchant, i);
          const date = merchant[s.tsKey] as string | null;
          const clickable = !isCurrent && !!onStageClick;

          return (
            <div
              key={s.key}
              className={`step ${isDone ? "done" : isCurrent ? "now" : "todo"}`}
              style={clickable ? { cursor: "pointer" } : undefined}
              onClick={clickable ? () => onStageClick(s.key) : undefined}
              title={clickable ? `Change stage to ${s.label}` : undefined}
            >
              <div className="dot" />
              <div className="step-name">{s.label}</div>
              <div className={`step-date ${isCurrent && days != null && days > 7 ? "late" : ""}`}>
                {isTodo ? "—" : isCurrent && days != null ? `${days}d here` : fmtDate(date)}
              </div>
            </div>
          );
        })}
      </div>
      {merchant.stage === "on_hold" && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--amber)", textAlign: "center" }}>
          On hold — {merchant.hold_reason}
        </div>
      )}
      {merchant.stage === "lost" && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--red)", textAlign: "center" }}>
          Lost — {merchant.lost_reason}
        </div>
      )}
      {merchant.stage === "not_interested" && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--red)", textAlign: "center" }}>
          Not interested — {merchant.lost_reason}
        </div>
      )}
    </div>
  );
}
