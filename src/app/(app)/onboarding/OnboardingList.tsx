"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { StepStatus } from "@/lib/database.types";
import { fmtDate, isOverdue } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
import UserPicker from "@/components/ui/UserPicker";
import ProductImportModal from "@/components/products/ProductImportModal";
import { assignAccountManager, toggleStep, activateMerchant } from "./actions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepInfo {
  id: string;
  title: string;
  status: StepStatus;
  due_at: string | null;
  order_index: number;
  is_required: boolean;
  completed_at: string | null;
  completed_by_name: string | null;
}

interface MerchantRow {
  id: string;
  store_name: string;
  stage: string;
  account_manager_id: string | null;
  account_manager_name: string | null;
  cta_completed_at: string | null;
  steps: StepInfo[];
  product_count: number;
}

interface Props {
  currentUserId: string;
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function daysSinceCta(dateStr: string | null) {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
  return `${days}d`;
}

function allRequiredDone(steps: StepInfo[]) {
  if (!steps.length) return false;
  return steps.filter(s => s.is_required).every(s => s.status === "done" || s.status === "skipped");
}

function fmtCompletedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function sortRows(list: MerchantRow[]): MerchantRow[] {
  return [...list].sort((a, b) => {
    const ab = !a.account_manager_id ? 0 : 1;
    const bb = !b.account_manager_id ? 0 : 1;
    if (ab !== bb) return ab - bb;
    return (a.cta_completed_at ?? "") < (b.cta_completed_at ?? "") ? -1 : 1;
  });
}

// ── Step cells ────────────────────────────────────────────────────────────────

function StepCell({ label, step, blocked, toggling, onToggle, extra }: {
  label: string;
  step: StepInfo | null;
  blocked: boolean;
  toggling: boolean;
  onToggle: (id: string, status: StepStatus) => void;
  extra?: React.ReactNode;
}) {
  if (blocked || !step) return <span style={{ color: "var(--ink-4)", fontSize: 12 }}>—</span>;

  const done    = step.status === "done";
  const overdue = !done && isOverdue(step.due_at);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", userSelect: "none" }}>
        <input
          type="checkbox"
          checked={done}
          disabled={toggling}
          onChange={() => onToggle(step.id, step.status)}
          style={{ accentColor: "var(--ink)", cursor: toggling ? "wait" : "pointer", flexShrink: 0 }}
        />
        <span style={{
          fontSize: 12.5,
          color: done ? "var(--ink-4)" : "var(--ink-2)",
          textDecoration: done ? "line-through" : "none",
        }}>
          {label}
        </span>
      </label>

      <span style={{
        fontSize: 11, paddingInlineStart: 20, whiteSpace: "nowrap",
        color: done ? "var(--ink-3)" : overdue ? "var(--red)" : "var(--ink-4)",
      }}>
        {done
          ? <>{fmtCompletedAt(step.completed_at)}{step.completed_by_name ? ` · ${step.completed_by_name}` : ""}</>
          : step.due_at ? <>{overdue ? "⚠ " : ""}{fmtDate(step.due_at)}</> : null
        }
      </span>

      {extra}
    </div>
  );
}

// ── Template download (no import to avoid circular dep) ───────────────────────

function downloadTemplate() {
  const HEADERS = ["Product name","SKU","Barcode","Category","Brand","Merchant price","NML cost","Stock","Product URL","Image URL","Notes"];
  const ROWS = [
    ["عطر الورد الداهي","ATR-001","6281234567890","عطور","صحاري","349","210","85","https://store.salla.sa/products/atr-001","https://cdn.example.com/atr-001.jpg",""],
    ["بخور القمر","BKH-022","6289876543210","بخور وعود","العنبر","189","95","200","https://store.salla.sa/products/bkh-022","https://cdn.example.com/bkh-022.jpg","صنف شائع"],
  ];
  const esc = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  const csv = [HEADERS.map(esc).join(","), ...ROWS.map(r => r.map(esc).join(","))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "nml-products-template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingList({ currentUserId }: Props) {
  const supabase = createClient();

  // Profile name cache — avoids repeat fetches across optimistic updates
  const profileCache = useRef<Record<string, string>>({});

  const [rows,        setRows]        = useState<MerchantRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "mine">("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search,      setSearch]      = useState("");

  // Inline single-row assign state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [pendingAmId, setPendingAmId] = useState<string | null>(null);
  const [savingAmFor, setSavingAmFor] = useState<string | null>(null);

  // Toggling step
  const [togglingStep, setTogglingStep] = useState<string | null>(null);

  // Multi-select + bulk
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [bulkAmId,    setBulkAmId]    = useState<string | null>(null);
  const [bulkSaving,  setBulkSaving]  = useState(false);

  // Product import modal
  const [importFor, setImportFor] = useState<MerchantRow | null>(null);

  // ── Profile cache helper ─────────────────────────────────────────────────────

  const ensureProfiles = useCallback(async (ids: string[]) => {
    const missing = ids.filter(id => id && !profileCache.current[id]);
    if (!missing.length) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from("profiles") as any)
      .select("id, full_name").in("id", missing);
    for (const p of (data ?? []) as { id: string; full_name: string | null }[]) {
      profileCache.current[p.id] = p.full_name ?? p.id;
    }
  }, [supabase]);

  // ── Full fetch ───────────────────────────────────────────────────────────────

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawMerchants, error: me } = await (supabase.from("merchants") as any)
        .select("id, store_name, stage, account_manager_id, cta_completed_at")
        .in("stage", ["cta_completed", "onboarding"]);

      if (me) { toast.error((me as { message: string }).message); return; }

      const merchants = (rawMerchants ?? []) as Array<{
        id: string; store_name: string; stage: string;
        account_manager_id: string | null; cta_completed_at: string | null;
      }>;

      if (!merchants.length) { setRows([]); return; }
      const merchantIds = merchants.map(m => m.id);

      const [stepsRes, prodRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("merchant_onboarding_steps") as any)
          .select("id, merchant_id, title, status, due_at, order_index, is_required, completed_at, completed_by")
          .in("merchant_id", merchantIds).order("order_index", { ascending: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("products") as any)
          .select("merchant_id").in("merchant_id", merchantIds).eq("source", "po"),
      ]);

      const rawStepRows = (stepsRes.data ?? []) as Array<{
        id: string; merchant_id: string; title: string; status: StepStatus;
        due_at: string | null; order_index: number; is_required: boolean;
        completed_at: string | null; completed_by: string | null;
      }>;

      // Populate profile cache
      const profileIds = [
        ...merchants.map(m => m.account_manager_id),
        ...rawStepRows.map(s => s.completed_by),
      ].filter(Boolean) as string[];
      await ensureProfiles(profileIds);

      // Product count per merchant
      const prodCount: Record<string, number> = {};
      for (const p of (prodRes.data ?? []) as { merchant_id: string }[]) {
        prodCount[p.merchant_id] = (prodCount[p.merchant_id] ?? 0) + 1;
      }

      // Steps map
      const stepsMap: Record<string, StepInfo[]> = {};
      for (const s of rawStepRows) {
        if (!stepsMap[s.merchant_id]) stepsMap[s.merchant_id] = [];
        stepsMap[s.merchant_id].push({
          id: s.id, title: s.title, status: s.status, due_at: s.due_at,
          order_index: s.order_index, is_required: s.is_required,
          completed_at: s.completed_at,
          completed_by_name: s.completed_by ? (profileCache.current[s.completed_by] ?? null) : null,
        });
      }

      let result: MerchantRow[] = merchants.map(m => ({
        id: m.id, store_name: m.store_name, stage: m.stage,
        account_manager_id: m.account_manager_id,
        account_manager_name: m.account_manager_id ? (profileCache.current[m.account_manager_id] ?? null) : null,
        cta_completed_at: m.cta_completed_at,
        steps: stepsMap[m.id] ?? [],
        product_count: prodCount[m.id] ?? 0,
      }));

      if (ownerFilter === "mine") result = result.filter(r => r.account_manager_id === currentUserId);
      if (overdueOnly) result = result.filter(r =>
        r.steps.some(s => s.status !== "done" && s.status !== "skipped" && isOverdue(s.due_at))
      );
      if (search.trim()) {
        const q = search.toLowerCase();
        result = result.filter(r => r.store_name.toLowerCase().includes(q));
      }

      setRows(sortRows(result));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerFilter, overdueOnly, search, currentUserId, ensureProfiles]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  // ── Single-row background refetch ────────────────────────────────────────────

  const refreshRow = useCallback(async (merchantId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [mRes, sRes, pRes] = await Promise.all([
      (supabase.from("merchants") as any)
        .select("id, store_name, stage, account_manager_id, cta_completed_at")
        .eq("id", merchantId).maybeSingle(),
      (supabase.from("merchant_onboarding_steps") as any)
        .select("id, merchant_id, title, status, due_at, order_index, is_required, completed_at, completed_by")
        .eq("merchant_id", merchantId).order("order_index", { ascending: true }),
      (supabase.from("products") as any)
        .select("merchant_id").eq("merchant_id", merchantId).eq("source", "po"),
    ]);

    const m = mRes.data as {
      id: string; store_name: string; stage: string;
      account_manager_id: string | null; cta_completed_at: string | null;
    } | null;
    if (!m) return;

    const stepRows = (sRes.data ?? []) as Array<{
      id: string; merchant_id: string; title: string; status: StepStatus;
      due_at: string | null; order_index: number; is_required: boolean;
      completed_at: string | null; completed_by: string | null;
    }>;

    const newProfileIds = [m.account_manager_id, ...stepRows.map(s => s.completed_by)].filter(Boolean) as string[];
    await ensureProfiles(newProfileIds);

    const updated: MerchantRow = {
      id: m.id, store_name: m.store_name, stage: m.stage,
      account_manager_id: m.account_manager_id,
      account_manager_name: m.account_manager_id ? (profileCache.current[m.account_manager_id] ?? null) : null,
      cta_completed_at: m.cta_completed_at,
      steps: stepRows.map(s => ({
        id: s.id, title: s.title, status: s.status, due_at: s.due_at,
        order_index: s.order_index, is_required: s.is_required,
        completed_at: s.completed_at,
        completed_by_name: s.completed_by ? (profileCache.current[s.completed_by] ?? null) : null,
      })),
      product_count: (pRes.data ?? []).length,
    };

    // Remove from list if merchant is now active/beyond, otherwise update & re-sort
    if (!["cta_completed", "onboarding"].includes(updated.stage)) {
      setRows(prev => prev.filter(r => r.id !== merchantId));
    } else {
      setRows(prev => sortRows(prev.map(r => r.id === merchantId ? updated : r)));
    }
  }, [supabase, ensureProfiles]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleToggle = async (merchantId: string, stepId: string, currentStatus: StepStatus) => {
    const nowDone = currentStatus !== "done";
    // Optimistic
    setRows(prev => prev.map(r => r.id !== merchantId ? r : {
      ...r,
      steps: r.steps.map(s => s.id !== stepId ? s : {
        ...s,
        status: nowDone ? "done" : "pending",
        completed_at: nowDone ? new Date().toISOString() : null,
        completed_by_name: null,
      }),
    }));

    setTogglingStep(stepId);
    try {
      const res = await toggleStep(stepId, currentStatus);
      if (res.error) {
        toast.error(res.error);
        await refreshRow(merchantId); // revert
      } else {
        refreshRow(merchantId); // background confirm (don't await)
      }
    } finally {
      setTogglingStep(null);
    }
  };

  const handleActivate = async (merchantId: string) => {
    // Optimistic remove
    setRows(prev => prev.filter(r => r.id !== merchantId));
    const res = await activateMerchant(merchantId);
    if (res.error) {
      toast.error(res.error);
      refreshRow(merchantId); // restore
    } else {
      toast.success("Merchant activated");
    }
  };

  const handleAssignAM = async (merchantId: string, amId: string) => {
    await ensureProfiles([amId]);
    const amName = profileCache.current[amId] ?? null;

    // Close picker + optimistic update immediately
    setAssigningId(null);
    setPendingAmId(null);
    setRows(prev => sortRows(prev.map(r => r.id !== merchantId ? r : {
      ...r, account_manager_id: amId, account_manager_name: amName, stage: "onboarding",
    })));

    setSavingAmFor(merchantId);
    try {
      const res = await assignAccountManager(merchantId, amId);
      if (res.error) {
        toast.error(res.error);
        await refreshRow(merchantId); // revert
      } else {
        toast.success("Account manager assigned");
        refreshRow(merchantId); // background confirm
      }
    } finally {
      setSavingAmFor(null);
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAmId) return;
    const ids = [...selected].filter(id => rows.find(r => r.id === id && !r.account_manager_id));
    if (!ids.length) return;

    await ensureProfiles([bulkAmId]);
    const amName = profileCache.current[bulkAmId] ?? null;

    // Optimistic
    setSelected(new Set());
    setBulkAmId(null);
    setRows(prev => sortRows(prev.map(r => !ids.includes(r.id) ? r : {
      ...r, account_manager_id: bulkAmId, account_manager_name: amName, stage: "onboarding",
    })));

    setBulkSaving(true);
    try {
      const results = await Promise.all(ids.map(id => assignAccountManager(id, bulkAmId)));
      const failed = results.filter(r => r.error);
      if (failed.length) {
        toast.error(`${failed.length} assignment${failed.length !== 1 ? "s" : ""} failed`);
      } else {
        toast.success(`${ids.length} merchant${ids.length !== 1 ? "s" : ""} assigned`);
      }
    } finally {
      setBulkSaving(false);
      // Background confirm all rows
      await Promise.all(ids.map(id => refreshRow(id)));
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const blockedRows = rows.filter(r => !r.account_manager_id);
  const allBlockedSelected = blockedRows.length > 0 && blockedRows.every(r => selected.has(r.id));
  const someBlockedSelected = !allBlockedSelected && blockedRows.some(r => selected.has(r.id));

  // ── Render ────────────────────────────────────────────────────────────────────

  const THEAD_BG: React.CSSProperties = {
    position: "sticky", top: 0, zIndex: 2,
    background: "rgba(245,247,251,0.97)",
    backdropFilter: "blur(8px)",
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Onboarding</h1>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
          {(["all", "mine"] as const).map(v => (
            <button key={v} className={`pill${ownerFilter === v ? " active" : ""}`}
              onClick={() => setOwnerFilter(v)} style={{ padding: "4px 10px", fontSize: 12 }}>
              {v === "mine" ? "My merchants" : "All"}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <input className="field" style={{ maxWidth: 220 }} placeholder="Search merchant…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bulk-bar" style={{ marginBottom: 10 }}>
          <span className="count">{selected.size} selected</span>
          <UserPicker value={bulkAmId} onChange={setBulkAmId}
            roles={["account_manager", "admin"]} placeholder="Select AM…" />
          <button
            disabled={!bulkAmId || bulkSaving}
            onClick={handleBulkAssign}
            style={{ opacity: (!bulkAmId || bulkSaving) ? 0.45 : 1 }}
          >
            {bulkSaving ? "Assigning…" : "Assign AM"}
          </button>
          <span className="close" onClick={() => { setSelected(new Set()); setBulkAmId(null); }}>
            Clear ×
          </span>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="nml-table">
          <thead>
            <tr>
              <th style={{ width: 32, ...THEAD_BG }}>
                <input
                  type="checkbox"
                  checked={allBlockedSelected}
                  ref={el => { if (el) el.indeterminate = someBlockedSelected; }}
                  onChange={() => {
                    if (allBlockedSelected) setSelected(new Set());
                    else setSelected(new Set(blockedRows.map(r => r.id)));
                  }}
                  style={{ cursor: "pointer" }}
                  title="Select all unassigned"
                />
              </th>
              <th style={THEAD_BG}>Merchant</th>
              <th style={THEAD_BG}>Account manager</th>
              <th style={{ textAlign: "center", ...THEAD_BG }}>Days since CTA</th>
              <th style={THEAD_BG}>Welcome call</th>
              <th style={THEAD_BG}>First PO Agreement</th>
              <th style={THEAD_BG}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows cols={7} rows={8} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState icon="🎉" title="No merchants in onboarding"
                    description="All merchants are active or not yet started." />
                </td>
              </tr>
            ) : rows.map(row => {
              const blocked     = !row.account_manager_id;
              const step1       = row.steps.find(s => s.order_index === 1) ?? null;
              const step2       = row.steps.find(s => s.order_index === 2) ?? null;
              const canActivate = !blocked && allRequiredDone(row.steps);
              const isSelected  = selected.has(row.id);
              const rowOverdue  = !blocked && row.steps.some(
                s => s.status !== "done" && s.status !== "skipped" && isOverdue(s.due_at)
              );

              const rowClass = isSelected ? "sel" : rowOverdue ? "warn" : undefined;

              // Amber left border on blocked rows via first-cell border
              const firstCellStyle: React.CSSProperties = blocked
                ? { borderInlineStart: "3px solid var(--amber)", paddingInlineStart: 9 }
                : {};

              return (
                <tr key={row.id} className={rowClass}>
                  {/* Select checkbox — only for blocked rows */}
                  <td style={{ width: 32, textAlign: "center", ...firstCellStyle }}>
                    {blocked && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={e => setSelected(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(row.id); else next.delete(row.id);
                          return next;
                        })}
                        style={{ cursor: "pointer" }}
                      />
                    )}
                  </td>

                  {/* Merchant name */}
                  <td>
                    <a href={`/merchants/${row.id}`}
                      style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500, fontSize: 13 }}>
                      {row.store_name}
                    </a>
                  </td>

                  {/* Account manager / Assign AM */}
                  <td style={{ minWidth: 200 }}>
                    {blocked ? (
                      assigningId === row.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <UserPicker value={pendingAmId} onChange={setPendingAmId}
                            roles={["account_manager", "admin"]} placeholder="Select AM…" />
                          <button className="pill dark"
                            style={{ fontSize: 11.5, padding: "3px 10px", flexShrink: 0 }}
                            disabled={!pendingAmId || savingAmFor === row.id}
                            onClick={() => pendingAmId && handleAssignAM(row.id, pendingAmId)}>
                            {savingAmFor === row.id ? "…" : "Assign"}
                          </button>
                          <button className="pill outline"
                            style={{ fontSize: 11.5, padding: "3px 8px", flexShrink: 0 }}
                            onClick={() => { setAssigningId(null); setPendingAmId(null); }}>
                            ×
                          </button>
                        </div>
                      ) : (
                        <button className="pill outline"
                          style={{ fontSize: 11.5, color: "var(--amber)", borderColor: "var(--amber)", padding: "3px 10px" }}
                          onClick={() => { setAssigningId(row.id); setPendingAmId(null); }}>
                          Assign AM
                        </button>
                      )
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                        {row.account_manager_name ?? "—"}
                      </span>
                    )}
                  </td>

                  {/* Days since CTA */}
                  <td style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>
                      {daysSinceCta(row.cta_completed_at)}
                    </span>
                  </td>

                  {/* Welcome call */}
                  <td>
                    <StepCell
                      label="Welcome call"
                      step={step1}
                      blocked={blocked}
                      toggling={togglingStep === step1?.id}
                      onToggle={(id, status) => handleToggle(row.id, id, status)}
                    />
                  </td>

                  {/* Stocks & prices */}
                  <td>
                    <StepCell
                      label="First PO Agreement"
                      step={step2}
                      blocked={blocked}
                      toggling={togglingStep === step2?.id}
                      onToggle={(id, status) => handleToggle(row.id, id, status)}
                      extra={step2 && !step2.status.includes("done") && !blocked ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center", paddingInlineStart: 20, flexWrap: "wrap" }}>
                          <button type="button" onClick={downloadTemplate}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--blue)", textDecoration: "underline", padding: 0 }}>
                            ↓ Template
                          </button>
                          <button className="pill outline" style={{ fontSize: 11, padding: "2px 8px" }}
                            onClick={() => setImportFor(row)}>
                            ↑ Upload
                          </button>
                          {row.product_count > 0 && (
                            <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>
                              {row.product_count.toLocaleString("en-US")} received
                            </span>
                          )}
                        </div>
                      ) : step2?.status === "done" && row.product_count > 0 ? (
                        <span style={{ fontSize: 11, paddingInlineStart: 20, color: "var(--green)" }}>
                          {row.product_count.toLocaleString("en-US")} received
                        </span>
                      ) : null}
                    />
                  </td>

                  {/* Activate */}
                  <td>
                    {canActivate && (
                      <button className="pill dark" style={{ fontSize: 12, whiteSpace: "nowrap" }}
                        onClick={() => handleActivate(row.id)}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Product import modal */}
      {importFor && (
        <ProductImportModal
          open
          onClose={() => setImportFor(null)}
          merchantId={importFor.id}
          merchantStage={importFor.stage}
          onImportDone={(imported, updated) => {
            const total = imported + updated;
            toast.success(`${total} product${total !== 1 ? "s" : ""} received`);
            setImportFor(null);
            refreshRow(importFor.id);
          }}
        />
      )}
    </div>
  );
}
