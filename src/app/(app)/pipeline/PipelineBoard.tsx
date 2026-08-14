"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { moveMerchantStage, setNextAction } from "./actions";
import type { VMerchantList, MerchantStage } from "@/lib/database.types";
import { STAGE_LABELS, fmtDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// ── Constants ─────────────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  "assigned",
  "contacted",
  "interested",
  "form_sent",
  "cta_completed",
] as const;
type PipelineStage = (typeof PIPELINE_STAGES)[number];

const COLUMN_LABELS: Record<PipelineStage, string> = {
  assigned:      "Assigned",
  contacted:     "Contacted",
  interested:    "Interested",
  form_sent:     "Form sent",
  cta_completed: "CTA done",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function stageEntryDate(m: VMerchantList): string | null {
  switch (m.stage as PipelineStage) {
    case "assigned":      return m.assigned_at;
    case "contacted":     return m.first_contact_at;
    case "interested":    return m.interested_at;
    case "form_sent":     return m.form_sent_at;
    case "cta_completed": return m.cta_completed_at;
    default:              return null;
  }
}

function daysInStage(m: VMerchantList): number {
  const d = stageEntryDate(m);
  if (!d) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// ── Days-in-stage chip ────────────────────────────────────────────────────────
function DaysChip({ days }: { days: number }) {
  const color =
    days > 7
      ? { bg: "var(--red-bg)", text: "var(--red-d)" }
      : days > 3
        ? { bg: "var(--amber-bg)", text: "var(--amber)" }
        : { bg: "rgba(120,135,160,.12)", text: "var(--ink-3)" };
  return (
    <span
      style={{
        fontSize: 10.5,
        padding: "2px 7px",
        borderRadius: 99,
        background: color.bg,
        color: color.text,
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: 500,
      }}
    >
      {days}d
    </span>
  );
}

// ── Merchant card ─────────────────────────────────────────────────────────────
interface CardProps {
  merchant: VMerchantList;
  overlay?: boolean;
  onSetNextAction?: (m: VMerchantList) => void;
  onAssignAM?: (m: VMerchantList) => void;
  onLogActivity?: (m: VMerchantList) => void;
}

function MerchantCard({
  merchant: m,
  overlay = false,
  onSetNextAction,
  onAssignAM,
  onLogActivity,
}: CardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const days = daysInStage(m);
  const isCta = m.stage === "cta_completed";

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: m.id,
    disabled: isCta || overlay,
    data: { stage: m.stage },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        background: overlay
          ? "rgba(255,255,255,.97)"
          : isDragging
            ? "rgba(255,255,255,.5)"
            : "rgba(255,255,255,.88)",
        border: "1px solid rgba(255,255,255,.9)",
        borderRadius: 12,
        padding: "10px 12px",
        cursor: isCta ? "default" : overlay ? "grabbing" : "grab",
        opacity: isDragging ? 0.4 : 1,
        boxShadow: overlay
          ? "0 12px 32px rgba(40,60,110,.18)"
          : "0 1px 4px rgba(40,60,110,.07)",
        transition: "opacity 0.1s",
        position: "relative",
        userSelect: "none",
      }}
      {...(isCta ? {} : { ...listeners, ...attributes })}
    >
      {/* Top row: store name + days + menu */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 6,
          marginBottom: 6,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: 500,
            color: "var(--ink)",
            lineHeight: 1.35,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {m.store_name}
        </span>
        <DaysChip days={days} />
        {!overlay && (
          <div style={{ position: "relative" }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-3)",
                padding: "0 2px",
                fontSize: 14,
                lineHeight: 1,
                borderRadius: 6,
              }}
              title="Actions"
            >
              ···
            </button>
            {menuOpen && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 4px)",
                  background: "rgba(255,255,255,.97)",
                  border: "1px solid rgba(255,255,255,.9)",
                  borderRadius: 10,
                  boxShadow: "0 6px 20px rgba(40,60,110,.14)",
                  zIndex: 10,
                  minWidth: 150,
                  overflow: "hidden",
                }}
              >
                {[
                  { label: "Log activity", action: () => onLogActivity?.(m) },
                  { label: "Send form", action: () => {} },
                  { label: "Set next action", action: () => onSetNextAction?.(m) },
                  ...(isCta ? [{ label: "Assign AM", action: () => onAssignAM?.(m) }] : []),
                ].map(({ label, action }) => (
                  <button
                    key={label}
                    onClick={() => { action(); setMenuOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "start",
                      padding: "9px 14px",
                      fontSize: 12.5,
                      color: "var(--ink-2)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      borderBottom: "1px solid rgba(120,135,160,.1)",
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(63,127,214,.06)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLButtonElement).style.background = "none")
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* City + SKUs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: m.next_action_at ? 6 : 0,
        }}
      >
        {m.city && (
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.city}</span>
        )}
        {m.products_count != null && (
          <span
            style={{
              fontSize: 11,
              color: "var(--ink-4)",
              fontFamily: "JetBrains Mono, monospace",
            }}
          >
            {m.products_count} SKUs
          </span>
        )}
      </div>

      {/* Next action */}
      {m.next_action_at && (
        <div style={{ fontSize: 11, color: "var(--blue)", marginBottom: 6 }}>
          ⏰ {fmtDate(m.next_action_at)}
        </div>
      )}

      {/* Owner avatar */}
      {m.acquisition_owner_name && (
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 12,
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "var(--blue)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
          title={m.acquisition_owner_name}
        >
          {initials(m.acquisition_owner_name)}
        </div>
      )}
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────
interface ColumnProps {
  stage: PipelineStage;
  merchants: VMerchantList[];
  totalCount: number;
  onSetNextAction: (m: VMerchantList) => void;
  onAssignAM: (m: VMerchantList) => void;
  onLogActivity: (m: VMerchantList) => void;
}

function KanbanColumn({
  stage,
  merchants,
  totalCount,
  onSetNextAction,
  onAssignAM,
  onLogActivity,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const overflow = totalCount - merchants.length;

  return (
    <div
      style={{
        width: 264,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 12px",
          marginBottom: 6,
        }}
      >
        <span
          style={{ fontSize: 12.5, fontWeight: 500, color: "var(--ink-2)" }}
        >
          {COLUMN_LABELS[stage]}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
            background: "rgba(120,135,160,.15)",
            color: "var(--ink-3)",
            borderRadius: 99,
            padding: "1px 7px",
            fontWeight: 500,
          }}
        >
          {totalCount}
        </span>
      </div>

      {/* Drop area */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          minHeight: 120,
          display: "flex",
          flexDirection: "column",
          gap: 7,
          padding: "8px",
          borderRadius: 14,
          background: isOver
            ? "rgba(63,127,214,.07)"
            : "rgba(120,135,160,.06)",
          border: `1px solid ${isOver ? "rgba(63,127,214,.2)" : "transparent"}`,
          transition: "background 0.12s, border-color 0.12s",
          overflowY: "auto",
          maxHeight: "calc(100vh - 200px)",
        }}
      >
        {merchants.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "24px 12px",
              color: "var(--ink-4)",
              fontSize: 12,
            }}
          >
            No merchants here
          </div>
        )}
        {merchants.map((m) => (
          <MerchantCard
            key={m.id}
            merchant={m}
            onSetNextAction={onSetNextAction}
            onAssignAM={onAssignAM}
            onLogActivity={onLogActivity}
          />
        ))}
        {overflow > 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "10px 0",
              fontSize: 12,
              color: "var(--ink-4)",
            }}
          >
            +{overflow.toLocaleString("en-US")} more
          </div>
        )}
      </div>
    </div>
  );
}

// ── Set next action modal ─────────────────────────────────────────────────────
function NextActionModal({
  merchant,
  onClose,
}: {
  merchant: VMerchantList;
  onClose: () => void;
}) {
  const [date, setDate] = useState(
    merchant.next_action_at
      ? merchant.next_action_at.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await setNextAction(merchant.id, new Date(date).toISOString());
    if (error) toast.error(error);
    else {
      toast.success("Next action set");
      onClose();
    }
    setSaving(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(28,37,54,.35)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        className="glass-drawer"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 360,
          padding: 24,
        }}
      >
        <h2
          style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500 }}
        >
          Set next action for {merchant.store_name}
        </h2>
        <label className="field-label">Date</label>
        <input
          type="date"
          className="field"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ marginBottom: 18 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="pill outline" onClick={onClose}>
            Cancel
          </button>
          <button className="pill dark" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign AM modal ───────────────────────────────────────────────────────────
function AssignAMModal({
  merchant,
  onClose,
}: {
  merchant: VMerchantList;
  onClose: () => void;
}) {
  const [specialists, setSpecialists] = useState<{ id: string; full_name: string | null }[]>([]);
  const [amId, setAmId] = useState("");
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["account_manager", "admin"])
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) => setSpecialists(data ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!amId) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("merchants")
      .update({ account_manager_id: amId })
      .eq("id", merchant.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Account manager assigned");
      onClose();
    }
    setSaving(false);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(28,37,54,.35)",
          backdropFilter: "blur(4px)",
        }}
        onClick={onClose}
      />
      <div
        className="glass-drawer"
        style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 360, padding: 24 }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 500 }}>
          Assign account manager — {merchant.store_name}
        </h2>
        <label className="field-label">Account manager</label>
        <select
          className="field"
          value={amId}
          onChange={(e) => setAmId(e.target.value)}
          style={{ marginBottom: 18 }}
        >
          <option value="">Select…</option>
          {specialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name ?? s.id}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="pill outline" onClick={onClose}>Cancel</button>
          <button className="pill dark" disabled={!amId || saving} onClick={save}>
            {saving ? "Saving…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main board ────────────────────────────────────────────────────────────────
interface Props {
  columnData: Record<PipelineStage, VMerchantList[]>;
  columnCounts: Record<PipelineStage, number>;
  isManager: boolean;
  viewMode: "my" | "team";
  selectedSpecialist?: string;
  specialists: { id: string; full_name: string | null }[];
  currentUserId: string;
}

export default function PipelineBoard({
  columnData,
  columnCounts,
  isManager,
  viewMode,
  selectedSpecialist,
  specialists,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(columnData);
  const [counts, setCounts] = useState(columnCounts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nextActionFor, setNextActionFor] = useState<VMerchantList | null>(null);
  const [assignAMFor, setAssignAMFor] = useState<VMerchantList | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // Find which column a merchant is in
  function findColumn(merchantId: string): PipelineStage | null {
    for (const stage of PIPELINE_STAGES) {
      if (columns[stage].find((m) => m.id === merchantId)) return stage;
    }
    return null;
  }

  // Find the active merchant (for DragOverlay)
  const activeMerchant = activeId
    ? PIPELINE_STAGES.flatMap((s) => columns[s]).find((m) => m.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const merchantId = active.id as string;
    const targetStage = over.id as PipelineStage;
    const sourceStage = findColumn(merchantId);

    if (!sourceStage || sourceStage === targetStage) return;

    const sourceIdx = PIPELINE_STAGES.indexOf(sourceStage);
    const targetIdx = PIPELINE_STAGES.indexOf(targetStage);

    // Forward moves: only one stage at a time
    if (targetIdx > sourceIdx && targetIdx - sourceIdx > 1) {
      toast.error("You can only advance one stage at a time");
      return;
    }

    const merchant = columns[sourceStage].find((m) => m.id === merchantId)!;

    // Optimistic update
    setColumns((prev) => {
      const next = { ...prev };
      next[sourceStage] = prev[sourceStage].filter((m) => m.id !== merchantId);
      next[targetStage] = [
        { ...merchant, stage: targetStage as MerchantStage },
        ...prev[targetStage],
      ];
      return next;
    });
    setCounts((prev) => ({
      ...prev,
      [sourceStage]: Math.max(0, prev[sourceStage] - 1),
      [targetStage]: prev[targetStage] + 1,
    }));

    const { error } = await moveMerchantStage(merchantId, targetStage as MerchantStage);

    if (error) {
      // Revert
      setColumns((prev) => {
        const next = { ...prev };
        next[targetStage] = prev[targetStage].filter((m) => m.id !== merchantId);
        next[sourceStage] = [merchant, ...prev[sourceStage]];
        return next;
      });
      setCounts((prev) => ({
        ...prev,
        [sourceStage]: prev[sourceStage] + 1,
        [targetStage]: Math.max(0, prev[targetStage] - 1),
      }));
      toast.error(error);
    }
  }

  function toggleView(mode: "my" | "team") {
    const sp = new URLSearchParams();
    if (mode === "team") sp.set("view", "team");
    router.push(`/pipeline?${sp.toString()}`);
  }

  function setSpecialistFilter(id: string) {
    const sp = new URLSearchParams();
    sp.set("view", "team");
    if (id) sp.set("specialist", id);
    router.push(`/pipeline?${sp.toString()}`);
  }

  return (
    <>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "20px 0 16px",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Pipeline</h1>

        {/* My / Team toggle */}
        <div
          style={{
            display: "flex",
            gap: 3,
            background: "rgba(255,255,255,.55)",
            borderRadius: 99,
            padding: 3,
            border: "1px solid var(--g-line)",
          }}
        >
          {(isManager ? (["my", "team"] as const) : (["my"] as const)).map((mode) => (
            <button
              key={mode}
              onClick={() => toggleView(mode)}
              style={{
                border: "none",
                cursor: "pointer",
                padding: "5px 14px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 500,
                background:
                  viewMode === mode ? "#fff" : "transparent",
                color: viewMode === mode ? "var(--ink)" : "var(--ink-3)",
                boxShadow:
                  viewMode === mode ? "0 1px 4px rgba(40,60,110,.1)" : "none",
                transition: "all 0.12s",
              }}
            >
              {mode === "my" ? "My pipeline" : "Team pipeline"}
            </button>
          ))}
        </div>

        {/* Specialist filter (team view only) */}
        {viewMode === "team" && isManager && specialists.length > 0 && (
          <select
            className="field"
            style={{ width: 180 }}
            value={selectedSpecialist ?? ""}
            onChange={(e) => setSpecialistFilter(e.target.value)}
          >
            <option value="">All specialists</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Board ── */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 16,
            alignItems: "flex-start",
          }}
        >
          {PIPELINE_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              merchants={columns[stage]}
              totalCount={counts[stage]}
              onSetNextAction={(m) => setNextActionFor(m)}
              onAssignAM={(m) => setAssignAMFor(m)}
              onLogActivity={() => {
                toast.info("Activity logging coming soon");
              }}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeMerchant && (
            <MerchantCard merchant={activeMerchant} overlay />
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Next action modal ── */}
      {nextActionFor && (
        <NextActionModal
          merchant={nextActionFor}
          onClose={() => setNextActionFor(null)}
        />
      )}

      {/* ── Assign AM modal ── */}
      {assignAMFor && (
        <AssignAMModal
          merchant={assignAMFor}
          onClose={() => setAssignAMFor(null)}
        />
      )}
    </>
  );
}
