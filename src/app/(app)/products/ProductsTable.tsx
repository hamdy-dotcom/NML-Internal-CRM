"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { fmtDate, STAGE_LABELS } from "@/lib/utils";
import type { MerchantStage } from "@/lib/database.types";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
import Pagination, { PAGE_SIZE } from "@/components/ui/Pagination";
import ProductDrawer from "./ProductDrawer";
import { exportProductsCSV } from "./actions";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  category: string | null;
  brand: string | null;
  price: number | null;
  sale_price: number | null;
  nml_cost: number | null;
  stock: number | null;
  status: string;
  source: string | null;
  created_at: string;
  merchant_id: string;
  merchants: { store_name: string; stage: string };
}

const PRODUCT_STAGES: MerchantStage[] = [
  "new", "assigned", "contacted", "interested",
  "form_sent", "cta_completed", "onboarding", "active", "on_hold", "lost", "not_interested",
];

const MERCHANT_STAGE_COLOR: Record<string, string> = {
  active:        "var(--green)",
  onboarding:    "var(--blue)",
  cta_completed: "var(--blue)",
  on_hold:       "var(--amber)",
  lost:          "var(--red)",
};

function MerchantStageBadge({ stage }: { stage: string }) {
  const label = STAGE_LABELS[stage as MerchantStage] ?? stage;
  const color = MERCHANT_STAGE_COLOR[stage] ?? "var(--ink-3)";
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 500, color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

interface Filters {
  merchant: string;
  stage:    string;
  brand:    string;
  priceMin: string;
  priceMax: string;
}

const DEFAULT_FILTERS: Filters = {
  merchant: "", stage: "", brand: "", priceMin: "", priceMax: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase     = createClient() as any;
  const router       = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("productId");

  const [viewMode,         setViewMode]         = useState<"table" | "grid">("table");
  const [filters,          setFilters]          = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen,      setFiltersOpen]      = useState(false);
  const [products,         setProducts]         = useState<ProductRow[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [working,          setWorking]          = useState(false);
  const [page,             setPage]             = useState(0);
  const [total,            setTotal]            = useState(0);
  const [fetchError,       setFetchError]       = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [merchantOptions,  setMerchantOptions]  = useState<string[]>([]);
  const [merchantDropdown, setMerchantDropdown] = useState(false);
  const [brandOptions,     setBrandOptions]     = useState<string[]>([]);
  const [brandDropdown,    setBrandDropdown]    = useState(false);

  // Persist view mode
  useEffect(() => {
    const saved = localStorage.getItem("products-view");
    if (saved === "grid" || saved === "table") setViewMode(saved);
  }, []);

  // Load merchant + brand options for comboboxes
  useEffect(() => {
    supabase.from("merchants").select("store_name").order("store_name").then(
      ({ data }: { data: Array<{ store_name: string }> | null }) => {
        if (data) setMerchantOptions([...new Set(data.map(m => m.store_name).filter(Boolean) as string[])]);
      }
    );
    supabase.from("products").select("brand").not("brand", "is", null).order("brand").limit(500).then(
      ({ data }: { data: Array<{ brand: string }> | null }) => {
        if (data) setBrandOptions([...new Set(data.map(p => p.brand).filter(Boolean) as string[])]);
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setView = (v: "table" | "grid") => {
    setViewMode(v); localStorage.setItem("products-view", v);
  };

  const filterCount = Object.values(filters).filter(v => v !== "").length;

  // Reset to page 0 whenever any filter changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, [filters]);

  const fetchProducts = useCallback(async () => {
    // Cancel any in-flight request from a previous render cycle
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setFetchError(null);
    setSelected(new Set());
    const t0 = performance.now();

    try {
      // Resolve merchant IDs first when filtering by merchant name or stage —
      // avoids a full products scan for the count (RLS calls can_see_merchant per row).
      let merchantIdFilter: string[] | null = null;
      if (filters.merchant || filters.stage) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let mq = (supabase.from("merchants") as any).select("id");
        if (filters.merchant) mq = mq.ilike("store_name", `%${filters.merchant}%`);
        if (filters.stage)    mq = mq.eq("stage", filters.stage);
        const { data: mRows } = await mq;
        merchantIdFilter = ((mRows ?? []) as { id: string }[]).map(m => m.id);
        console.log(`[products] merchant filter → ${merchantIdFilter.length} merchant IDs`);
        if (merchantIdFilter.length === 0) {
          setProducts([]); setTotal(0); return;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("products") as any)
        .select("id, name, sku, image_url, category, brand, price, sale_price, nml_cost, stock, status, source, created_at, merchant_id", { count: "exact" });

      if (merchantIdFilter) q = q.in("merchant_id", merchantIdFilter);
      if (filters.brand)    q = q.ilike("brand", `%${filters.brand}%`);
      if (filters.priceMin) q = q.gte("price", filters.priceMin);
      if (filters.priceMax) q = q.lte("price", filters.priceMax);

      const from = page * PAGE_SIZE;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error, count } = await (q.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1) as any);

      if (ctrl.signal.aborted) return;
      console.log(`[products] ${Math.round(performance.now() - t0)}ms — rows:${(data ?? []).length} count:${count} error:${error?.message ?? 'none'}`);

      if (error) { setFetchError(error.message); return; }

      // Fetch merchant names only for the ≤100 rows we loaded
      const mids = [...new Set(((data ?? []) as { merchant_id: string }[]).map(p => p.merchant_id))];
      const merchantMap: Record<string, { store_name: string; stage: string }> = {};
      if (mids.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: mData } = await (supabase.from("merchants") as any)
          .select("id, store_name, stage")
          .in("id", mids);
        for (const m of (mData ?? []) as { id: string; store_name: string; stage: string }[]) {
          merchantMap[m.id] = { store_name: m.store_name, stage: m.stage };
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = ((data ?? []) as any[]).map(p => ({
        ...p,
        merchants: merchantMap[p.merchant_id] ?? { store_name: "—", stage: "" },
      }));

      setProducts(rows as ProductRow[]);
      setTotal(count ?? 0);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const msg = (e as Error).message ?? String(e);
      console.error(`[products] fetch error after ${Math.round(performance.now() - t0)}ms:`, msg);
      setFetchError(msg);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // URL helpers
  const openProduct = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("productId", id);
    router.push(`?${p.toString()}`);
  };
  const closeDrawer = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("productId");
    router.push(`?${p.toString()}`, { scroll: false } as Parameters<typeof router.push>[1]);
  };

  // Selection
  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(selected.size === products.length && products.length > 0 ? new Set() : new Set(products.map(p => p.id)));

  const handleBulkArchive = async () => {
    setWorking(true);
    try {
      const { bulkUpdateProductStatus } = await import("./actions");
      await bulkUpdateProductStatus(Array.from(selected), "archived");
      toast.success(`${selected.size} products archived`);
      fetchProducts();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  const handleExport = async () => {
    try {
      const csv = await exportProductsCSV({
        merchant: filters.merchant || undefined,
        brand:    filters.brand    || undefined,
      });
      if (!csv) { toast.info("No data to export"); return; }
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = "products.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error((e as Error).message); }
  };

  // ── Combobox helper ───────────────────────────────────────────────────────
  function Combobox({
    label, value, options, open, placeholder,
    onChange, onOpen, onClose, onSelect,
  }: {
    label: string; value: string; options: string[]; open: boolean; placeholder: string;
    onChange: (v: string) => void;
    onOpen: () => void; onClose: () => void; onSelect: (v: string) => void;
  }) {
    const visible = options.filter(n => !value || n.toLowerCase().includes(value.toLowerCase())).slice(0, 25);
    return (
      <div style={{ position: "relative" }}>
        <label className="field-label">{label}</label>
        <input
          className="field"
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => { onChange(e.target.value); onOpen(); }}
          onFocus={onOpen}
          onBlur={() => setTimeout(onClose, 150)}
        />
        {open && visible.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
            background: "rgba(255,255,255,.97)", border: "1px solid var(--g-line)",
            borderRadius: 10, boxShadow: "0 8px 24px rgba(40,60,110,.12)",
            maxHeight: 200, overflowY: "auto",
          }}>
            {visible.map(name => (
              <div
                key={name}
                style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12.5 }}
                onMouseDown={() => onSelect(name)}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingTop: 16 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>
          Products
          <span style={{ fontSize: 12.5, fontWeight: 400, color: "var(--ink-4)", marginLeft: 8 }}>
            {loading ? "…" : `${total.toLocaleString("en-US")} products`}
          </span>
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
            {(["table", "grid"] as const).map(v => (
              <button key={v} className={`pill${viewMode === v ? " active" : ""}`} onClick={() => setView(v)} style={{ padding: "4px 10px", fontSize: 12 }}>
                {v === "table" ? "Table" : "Grid"}
              </button>
            ))}
          </div>
          <button className={`pill${filtersOpen ? " active" : " outline"}`} onClick={() => setFiltersOpen(o => !o)}>
            {filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
          {/* Merchant combobox */}
          <Combobox
            label="Merchant"
            value={filters.merchant}
            options={merchantOptions}
            open={merchantDropdown}
            placeholder="Search merchant…"
            onChange={v => setFilters(f => ({ ...f, merchant: v }))}
            onOpen={() => setMerchantDropdown(true)}
            onClose={() => setMerchantDropdown(false)}
            onSelect={v => { setFilters(f => ({ ...f, merchant: v })); setMerchantDropdown(false); }}
          />

          {/* Merchant stage */}
          <div>
            <label className="field-label">Merchant stage</label>
            <select className="field" value={filters.stage} onChange={e => setFilters(f => ({ ...f, stage: e.target.value }))}>
              <option value="">Any stage</option>
              {PRODUCT_STAGES.map(s => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {/* Brand combobox */}
          <Combobox
            label="Brand"
            value={filters.brand}
            options={brandOptions}
            open={brandDropdown}
            placeholder="Search brand…"
            onChange={v => setFilters(f => ({ ...f, brand: v }))}
            onOpen={() => setBrandDropdown(true)}
            onClose={() => setBrandDropdown(false)}
            onSelect={v => { setFilters(f => ({ ...f, brand: v })); setBrandDropdown(false); }}
          />

          {/* Price range */}
          <div>
            <label className="field-label">Price min</label>
            <input className="field" type="number" placeholder="0"
              value={filters.priceMin} onChange={e => setFilters(f => ({ ...f, priceMin: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Price max</label>
            <input className="field" type="number" placeholder="∞"
              value={filters.priceMax} onChange={e => setFilters(f => ({ ...f, priceMax: e.target.value }))} />
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="pill ghost" style={{ width: "100%" }} onClick={() => setFilters(DEFAULT_FILTERS)}>
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="count">{selected.size} selected</span>
          <button onClick={handleBulkArchive} disabled={working}>Archive</button>
          <button onClick={handleExport}>Export CSV</button>
          <button className="close" onClick={() => setSelected(new Set())}>Clear ×</button>
        </div>
      )}

      {/* Error state — one failed request shows this; user must click Retry */}
      {fetchError && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 12, maxWidth: 480, margin: "0 auto 12px" }}>
            {fetchError}
          </div>
          <button className="pill outline" onClick={() => fetchProducts()}>Retry</button>
        </div>
      )}

      {/* Table view */}
      {!fetchError && viewMode === "table" ? (
        <div style={{ overflowX: "auto" }}>
          <table className="nml-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={toggleAll} />
                </th>
                <th style={{ width: 44 }}>Image</th>
                <th>Name</th>
                <th>Merchant</th>
                <th>Merchant stage</th>
                <th>Category</th>
                <th>Price</th>
                <th>Sale price</th>
                <th>Stock</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={10} rows={12} />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title="No products" description="No products match your filters." />
                  </td>
                </tr>
              ) : products.map(p => (
                <tr key={p.id}
                  className={selected.has(p.id) ? "sel" : undefined}
                  style={{ cursor: "pointer" }}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                    openProduct(p.id);
                  }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td>
                    {p.image_url ? (
                      <img src={p.image_url} alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: 6, display: "block" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--g-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "var(--ink-5)" }}>□</div>
                    )}
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <div className="ellipsis">{p.name}</div>
                    {p.sku && <div className="sub mono">{p.sku}</div>}
                  </td>
                  <td>
                    <a href={`/merchants/${p.merchant_id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                      style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12.5 }}>
                      {p.merchants.store_name}
                    </a>
                  </td>
                  <td><MerchantStageBadge stage={p.merchants.stage} /></td>
                  <td><span className="sub">{p.category || "—"}</span></td>
                  <td><span className="num">{p.price ? `SAR ${Number(p.price).toLocaleString()}` : "—"}</span></td>
                  <td><span className="num">{p.sale_price ? `SAR ${Number(p.sale_price).toLocaleString()}` : "—"}</span></td>
                  <td><span className="num">{p.stock ?? "—"}</span></td>
                  <td><span className="sub">{fmtDate(p.created_at)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !fetchError && (
        /* Grid view */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 12 }}>
          {loading ? (
            Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="glass-card" style={{ padding: 12, animation: "pulse 1.5s ease-in-out infinite" }}>
                <div style={{ aspectRatio: "1", borderRadius: 8, background: "rgba(120,135,160,.1)", marginBottom: 10 }} />
                <div style={{ height: 12, borderRadius: 6, background: "rgba(120,135,160,.1)", marginBottom: 6 }} />
                <div style={{ height: 10, borderRadius: 6, background: "rgba(120,135,160,.07)", width: "60%" }} />
              </div>
            ))
          ) : products.length === 0 ? (
            <div style={{ gridColumn: "1/-1" }}>
              <EmptyState title="No products" description="No products match your filters." />
            </div>
          ) : products.map(p => (
            <div key={p.id} className="glass-card"
              style={{ cursor: "pointer", padding: 12, position: "relative" }}
              onClick={() => openProduct(p.id)}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)}
                onClick={e => e.stopPropagation()}
                style={{ position: "absolute", top: 10, left: 10 }} />
              {p.image_url ? (
                <img src={p.image_url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block", marginBottom: 10 }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: "var(--g-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--ink-5)", marginBottom: 10 }}>□</div>
              )}
              <div className="ellipsis" style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>{p.merchants.store_name}</div>
              {p.price && <div className="num" style={{ fontSize: 12 }}>SAR {Number(p.price).toLocaleString()}</div>}
              <div style={{ marginTop: 8 }}>
                <MerchantStageBadge stage={p.merchants.stage} />
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} onChange={setPage} />

      {/* Product drawer */}
      {productId && (
        <ProductDrawer
          productId={productId}
          productIds={products.map(p => p.id)}
          rejectReasons={[]}
          onClose={closeDrawer}
          onNavigate={openProduct}
          onAction={() => { closeDrawer(); fetchProducts(); }}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
    </div>
  );
}
