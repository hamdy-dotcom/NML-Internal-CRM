"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NML_CATEGORIES } from "@/lib/categories";
import Pagination, { PAGE_SIZE } from "@/components/ui/Pagination";

interface CategoryRow {
  raw_category: string;
  mapped_category: string | null;
  product_count: number;
  confidence: "high" | "medium" | "low" | "none" | null;
  reviewed: boolean;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   "var(--green, #22c55e)",
  medium: "#f59e0b",
  low:    "#f97316",
  none:   "var(--ink-3)",
};

function ConfidenceBadge({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: "var(--ink-3)", fontSize: 12 }}>—</span>;
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 7px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 500,
      background: `${CONFIDENCE_COLORS[value] ?? "#888"}22`,
      color: CONFIDENCE_COLORS[value] ?? "#888",
    }}>
      {value}
    </span>
  );
}

export default function CategoriesTab() {
  const supabase = createClient();

  const [rows, setRows]         = useState<CategoryRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(0);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [lowConfOnly, setLowConfOnly]   = useState(false);

  // Bulk reassign
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  // Inline save flash
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (raw: string) => {
    setSavedFlash(raw);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setSavedFlash(null), 1500);
  };

  const fetch = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase.from("product_categories") as any)
      .select("raw_category, mapped_category, product_count, confidence, reviewed", { count: "exact" })
      .order("product_count", { ascending: false });

    if (search)       q = q.ilike("raw_category", `%${search}%`);
    if (unmappedOnly) q = q.is("mapped_category", null);
    if (lowConfOnly)  q = q.in("confidence", ["low", "none"]);

    const from = page * PAGE_SIZE;
    const { data, error, count } = await (q.range(from, from + PAGE_SIZE - 1) as any);
    setLoading(false);
    if (error) { console.error(error); return; }
    setRows((data ?? []) as CategoryRow[]);
    setTotal(count ?? 0);
    setSelected(new Set());
  }, [search, unmappedOnly, lowConfOnly, page]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { setPage(0); }, [search, unmappedOnly, lowConfOnly]);

  const updateRow = async (raw: string, patch: Partial<CategoryRow>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("product_categories") as any)
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("raw_category", raw);
    if (error) { alert(error.message); return; }
    setRows(prev => prev.map(r => r.raw_category === raw ? { ...r, ...patch } : r));
    flash(raw);
  };

  const bulkReassign = async () => {
    if (!bulkTarget || !selected.size) return;
    setBulkSaving(true);
    const keys = [...selected];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("product_categories") as any)
      .update({ mapped_category: bulkTarget, confidence: "high", updated_at: new Date().toISOString() })
      .in("raw_category", keys);
    setBulkSaving(false);
    if (error) { alert(error.message); return; }
    setRows(prev => prev.map(r =>
      selected.has(r.raw_category)
        ? { ...r, mapped_category: bulkTarget, confidence: "high" }
        : r
    ));
    setSelected(new Set());
    setBulkTarget("");
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.raw_category)));
    }
  };

  const mappedCount = rows.filter(r => r.mapped_category).length;
  const unmappedTotal = total - mappedCount; // approx for header

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
          {total.toLocaleString("en-US")} raw categories
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="search"
            placeholder="Search raw category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--g-line)", background: "var(--surface)", color: "var(--ink)", fontSize: 13, width: 200 }}
          />
          <button
            className={`pill ${unmappedOnly ? "dark" : "outline"}`}
            onClick={() => setUnmappedOnly(v => !v)}
            style={{ fontSize: 12 }}
          >
            Unmapped only
          </button>
          <button
            className={`pill ${lowConfOnly ? "dark" : "outline"}`}
            onClick={() => setLowConfOnly(v => !v)}
            style={{ fontSize: 12 }}
          >
            Low / none confidence
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "var(--surface)", border: "1px solid var(--g-line)", borderRadius: 10, marginBottom: 12,
        }}>
          <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>
            {selected.size} selected
          </span>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>— reassign to:</span>
          <select
            value={bulkTarget}
            onChange={e => setBulkTarget(e.target.value)}
            style={{ padding: "5px 8px", borderRadius: 7, border: "1px solid var(--g-line)", background: "var(--surface)", color: "var(--ink)", fontSize: 13 }}
          >
            <option value="">Pick category…</option>
            {NML_CATEGORIES.map(c => (
              <option key={c.ar} value={c.ar}>{c.ar} — {c.en}</option>
            ))}
          </select>
          <button
            className="pill dark"
            onClick={bulkReassign}
            disabled={!bulkTarget || bulkSaving}
            style={{ fontSize: 12 }}
          >
            {bulkSaving ? "Saving…" : "Apply"}
          </button>
          <button
            className="pill outline"
            onClick={() => setSelected(new Set())}
            style={{ fontSize: 12 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--g-line)" }}>
              <th style={{ width: 36, padding: "8px 10px", textAlign: "left" }}>
                <input
                  type="checkbox"
                  checked={selected.size === rows.length && rows.length > 0}
                  onChange={toggleAll}
                />
              </th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>Raw category</th>
              <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--ink-2)", fontWeight: 500, whiteSpace: "nowrap" }}>Products</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500, minWidth: 260 }}>Mapped to</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>Confidence</th>
              <th style={{ padding: "8px 10px", textAlign: "center", color: "var(--ink-2)", fontWeight: 500 }}>Reviewed</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} style={{ padding: "10px" }}>
                      <div style={{ height: 14, borderRadius: 6, background: "var(--g-line)", width: j === 1 ? "80%" : j === 3 ? "70%" : "40%" }} />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  No categories found
                </td>
              </tr>
            )}
            {!loading && rows.map(row => {
              const isSaved = savedFlash === row.raw_category;
              const isSelected = selected.has(row.raw_category);
              return (
                <tr
                  key={row.raw_category}
                  style={{
                    borderBottom: "1px solid var(--g-line)",
                    background: isSelected ? "var(--nml-red-tint, rgba(220,38,38,.05))" : isSaved ? "rgba(34,197,94,.07)" : "transparent",
                    transition: "background 0.3s",
                  }}
                >
                  <td style={{ padding: "8px 10px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (next.has(row.raw_category)) next.delete(row.raw_category);
                          else next.add(row.raw_category);
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--ink)", direction: "rtl", textAlign: "right", maxWidth: 260 }}>
                    <span title={row.raw_category} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.raw_category}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                    {row.product_count.toLocaleString("en-US")}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <select
                      value={row.mapped_category ?? ""}
                      onChange={e => updateRow(row.raw_category, { mapped_category: e.target.value || null })}
                      style={{
                        padding: "4px 7px", borderRadius: 7, fontSize: 12,
                        border: row.mapped_category ? "1px solid var(--g-line)" : "1px solid var(--nml-red, #dc2626)",
                        background: "var(--surface)", color: row.mapped_category ? "var(--ink)" : "var(--nml-red, #dc2626)",
                        width: "100%", maxWidth: 280,
                      }}
                    >
                      <option value="">— unmapped —</option>
                      {NML_CATEGORIES.map(c => (
                        <option key={c.ar} value={c.ar}>{c.ar} — {c.en}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <ConfidenceBadge value={row.confidence} />
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.reviewed}
                      onChange={e => updateRow(row.raw_category, { reviewed: e.target.checked })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} total={total} onChange={setPage} />
    </div>
  );
}
