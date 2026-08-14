"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { MerchantOnboardingStep, StepStatus } from "@/lib/database.types";
import { STEP_STATUS_LABELS, fmtDate, isOverdue } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
import { updateStepStatus } from "./actions";

interface StepRow extends MerchantOnboardingStep {
  merchant_name: string | null;
  owner_name:   string | null;
  owner_avatar: string | null;
}

interface Props {
  currentUserId: string;
}

const OPEN_STATUSES: StepStatus[] = ["pending", "in_progress", "blocked"];

export default function StepQueue({ currentUserId }: Props) {
  const supabase  = createClient();
  const router    = useRouter();
  const pathname  = usePathname();
  const [, startTransition] = useTransition();

  const [steps,       setSteps]       = useState<StepRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "me">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search,      setSearch]      = useState("");
  const [updatingId,  setUpdatingId]  = useState<string | null>(null);

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch open steps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stepsQ = supabase.from("merchant_onboarding_steps") as any;
      let q = stepsQ.select("id, title, status, due_at, created_at, merchant_id, owner_id, blocked_reason, onboarding_id, order_index, description, is_required, completed_at, completed_by, notes")
        .in("status", OPEN_STATUSES)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (ownerFilter === "me") q = q.eq("owner_id", currentUserId);
      const { data: rawSteps, error: se } = await q;
      if (se) { toast.error((se as { message: string }).message); return; }

      const steps = (rawSteps ?? []) as MerchantOnboardingStep[];

      if (!steps.length) { setSteps([]); return; }

      // Fetch merchant names
      const merchantIds = [...new Set(steps.map((s) => s.merchant_id))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: merchants } = await (supabase.from("merchants") as any)
        .select("id, store_name")
        .in("id", merchantIds);
      const merchantMap = Object.fromEntries(
        ((merchants ?? []) as { id: string; store_name: string }[]).map((m) => [m.id, m.store_name]),
      );

      // Fetch owner names
      const ownerIds = [...new Set(steps.map((s) => s.owner_id).filter(Boolean))] as string[];
      const ownerMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
      if (ownerIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profiles } = await (supabase.from("profiles") as any)
          .select("id, full_name, avatar_url")
          .in("id", ownerIds);
        for (const p of (profiles ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
          ownerMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url };
        }
      }

      let rows: StepRow[] = steps.map((s) => ({
        ...s,
        merchant_name: merchantMap[s.merchant_id] ?? null,
        owner_name:   s.owner_id ? (ownerMap[s.owner_id]?.full_name ?? null) : null,
        owner_avatar: s.owner_id ? (ownerMap[s.owner_id]?.avatar_url ?? null) : null,
      }));

      if (overdueOnly) rows = rows.filter((s) => isOverdue(s.due_at));
      if (search.trim()) rows = rows.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()));

      setSteps(rows);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerFilter, overdueOnly, search]);

  useEffect(() => { fetchSteps(); }, [fetchSteps]);

  const handleStatusChange = async (stepId: string, status: StepStatus) => {
    setUpdatingId(stepId);
    try {
      await updateStepStatus(stepId, status);
      toast.success(`Step marked ${STEP_STATUS_LABELS[status].toLowerCase()}`);
      fetchSteps();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUpdatingId(null);
    }
  };

  const daysOpen = (createdAt: string) => {
    const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
    return days === 1 ? "1 day" : `${days} days`;
  };

  const switchView = () => {
    startTransition(() => { router.push(`${pathname}?view=board`); });
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Onboarding</h1>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
          <button className="pill active" style={{ padding: "4px 10px", fontSize: 12 }}>Step queue</button>
          <button className="pill" onClick={switchView} style={{ padding: "4px 10px", fontSize: 12 }}>Board</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
          {(["all", "me"] as const).map((v) => (
            <button
              key={v}
              className={`pill${ownerFilter === v ? " active" : ""}`}
              onClick={() => setOwnerFilter(v)}
              style={{ padding: "4px 10px", fontSize: 12 }}
            >
              {v === "me" ? "My steps" : "All owners"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <input
          className="field"
          style={{ maxWidth: 220 }}
          placeholder="Search step title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="nml-table">
          <thead>
            <tr>
              <th>Merchant</th>
              <th>Step</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
              <th>Days open</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={6} rows={10} />
            ) : steps.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState icon="✅" title="No open onboarding steps" description="All merchants are on track." />
                </td>
              </tr>
            ) : steps.map((s) => {
              const overdue = isOverdue(s.due_at);
              return (
                <tr key={s.id} className={overdue ? "warn" : undefined}>
                  <td>
                    <a href={`/merchants/${s.merchant_id}`} style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500 }}>
                      {s.merchant_name ?? "—"}
                    </a>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <div className="ellipsis">{s.title}</div>
                  </td>
                  <td>
                    {s.owner_name ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {s.owner_avatar ? (
                          <img src={s.owner_avatar} alt="" width={22} height={22} style={{ borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--blue-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--blue-d)", fontWeight: 600 }}>
                            {s.owner_name.charAt(0)}
                          </div>
                        )}
                        <span style={{ fontSize: 12.5 }}>{s.owner_name}</span>
                      </div>
                    ) : (
                      <span className="sub awaiting">Unassigned</span>
                    )}
                  </td>
                  <td>
                    {s.due_at ? (
                      <div>
                        <span style={{ fontSize: 12.5, color: overdue ? "var(--red)" : "var(--ink-2)" }}>
                          {fmtDate(s.due_at)}
                        </span>
                        {overdue && <span className="badge badge-red" style={{ marginLeft: 6, fontSize: 10 }}>Overdue</span>}
                      </div>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td>
                    <select
                      className="field"
                      style={{ padding: "4px 10px", fontSize: 12, width: "auto", minWidth: 110 }}
                      value={s.status}
                      disabled={updatingId === s.id}
                      onChange={(e) => handleStatusChange(s.id, e.target.value as StepStatus)}
                    >
                      {(["pending", "in_progress", "blocked", "done", "skipped"] as StepStatus[]).map((st) => (
                        <option key={st} value={st}>{STEP_STATUS_LABELS[st]}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="sub">{daysOpen(s.created_at)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
