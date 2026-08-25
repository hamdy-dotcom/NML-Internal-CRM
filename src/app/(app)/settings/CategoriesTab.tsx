"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface SubcategoryRow {
  nml_category: string;
  nml_subcategory: string;
  product_count: number;
}

export default function CategoriesTab() {
  const supabase = createClient();

  const [allRows, setAllRows]     = useState<SubcategoryRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [catFilter, setCatFilter] = useState("");

  const [editingKey, setEditingKey]   = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [saving, setSaving]           = useState(false);
  const [flashKey, setFlashKey]       = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rowKey = (r: SubcategoryRow) => `${r.nml_category}||${r.nml_subcategory}`;

  const flash = (key: string) => {
    setFlashKey(key);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashKey(null), 1500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("v_nml_subcategory_counts") as any)
      .select("nml_category, nml_subcategory, product_count");
    setLoading(false);
    if (error) { console.error(error); return; }
    const sorted = ((data ?? []) as SubcategoryRow[]).sort((a, b) => {
      const catCmp = a.nml_category.localeCompare(b.nml_category, "ar");
      if (catCmp !== 0) return catCmp;
      return b.product_count - a.product_count;
    });
    setAllRows(sorted);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(allRows.map(r => r.nml_category))).sort((a, b) =>
    a.localeCompare(b, "ar")
  );

  const filtered = allRows.filter(r => {
    if (catFilter && r.nml_category !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.nml_category.toLowerCase().includes(q) || r.nml_subcategory.toLowerCase().includes(q);
    }
    return true;
  });

  const startEdit = (row: SubcategoryRow) => {
    setEditingKey(rowKey(row));
    setEditingValue(row.nml_subcategory);
  };

  const commitEdit = async (row: SubcategoryRow) => {
    const newVal = editingValue.trim();
    setEditingKey(null);
    if (!newVal || newVal === row.nml_subcategory) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("products") as any)
      .update({ nml_subcategory: newVal })
      .eq("nml_category", row.nml_category)
      .eq("nml_subcategory", row.nml_subcategory);
    setSaving(false);
    if (error) { alert(error.message); return; }
    const key = `${row.nml_category}||${newVal}`;
    setAllRows(prev => prev.map(r =>
      rowKey(r) === rowKey(row) ? { ...r, nml_subcategory: newVal } : r
    ));
    flash(key);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditingValue("");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, color: "var(--ink-2)" }}>
          {loading ? "Loading…" : `${filtered.length.toLocaleString("en-US")} subcategories`}
          {saving && <span style={{ marginLeft: 8, color: "var(--ink-3)" }}>Saving…</span>}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="search"
            placeholder="Search category or subcategory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: "6px 10px", borderRadius: 8,
              border: "1px solid var(--g-line)", background: "var(--surface)",
              color: "var(--ink)", fontSize: 13, width: 240,
            }}
          />
          <select
            value={catFilter}
            onChange={e => setCatFilter(e.target.value)}
            style={{
              padding: "6px 10px", borderRadius: 8,
              border: "1px solid var(--g-line)", background: "var(--surface)",
              color: "var(--ink)", fontSize: 13,
            }}
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--g-line)" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>Category</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>Subcategory</th>
              <th style={{ padding: "8px 10px", textAlign: "right", color: "var(--ink-2)", fontWeight: 500, whiteSpace: "nowrap" }}>Products</th>
              <th style={{ padding: "8px 10px", textAlign: "left", color: "var(--ink-2)", fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j} style={{ padding: "10px" }}>
                      <div style={{ height: 14, borderRadius: 6, background: "var(--g-line)", width: j === 0 ? "55%" : j === 1 ? "70%" : j === 2 ? "30%" : "20%" }} />
                    </td>
                  ))}
                </tr>
              ))
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
                  No subcategories found
                </td>
              </tr>
            )}
            {!loading && filtered.map(row => {
              const key = rowKey(row);
              const isEditing = editingKey === key;
              const isFlashing = flashKey === key;
              return (
                <tr
                  key={key}
                  style={{
                    borderBottom: "1px solid var(--g-line)",
                    background: isFlashing ? "rgba(34,197,94,.08)" : "transparent",
                    transition: "background 0.4s",
                  }}
                >
                  <td style={{ padding: "8px 10px", color: "var(--ink)", fontWeight: 500 }}>
                    {row.nml_category}
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--ink)" }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitEdit(row);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={() => commitEdit(row)}
                        style={{
                          padding: "3px 7px", borderRadius: 6, fontSize: 13,
                          border: "1px solid var(--g-line)", background: "var(--surface)",
                          color: "var(--ink)", width: "100%", maxWidth: 280,
                        }}
                      />
                    ) : (
                      <span
                        title="Click to rename"
                        onClick={() => startEdit(row)}
                        style={{
                          cursor: "text",
                          borderBottom: "1px dashed var(--g-line)",
                          paddingBottom: 1,
                          display: "inline-block",
                        }}
                      >
                        {row.nml_subcategory}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                    {row.product_count.toLocaleString("en-US")}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    {!isEditing && (
                      <button
                        className="pill outline"
                        onClick={() => startEdit(row)}
                        style={{ fontSize: 11, padding: "2px 9px" }}
                      >
                        Rename
                      </button>
                    )}
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
