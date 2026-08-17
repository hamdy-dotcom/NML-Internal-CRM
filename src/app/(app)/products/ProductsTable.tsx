"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { fmtDate } from "@/lib/utils";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
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

type Tab = "active" | "onboarding" | "all";

// Merchant stages that count as "onboarding"
const ONBOARDING_STAGES = ["cta_completed", "onboarding"];

const TABS: { key: Tab; label: string }[] = [
  { key: "active",     label: "Active merchants" },
  { key: "onboarding", label: "Onboarding" },
  { key: "all",        label: "All" },
];

const MERCHANT_STAGE_LABELS: Record<string, string> = {
  lead:          "Lead",
  cta_sent:      "CTA sent",
  cta_completed: "CTA done",
  onboarding:    "Onboarding",
  active:        "Active",
  paused:        "Paused",
  churned:       "Churned",
};

const MERCHANT_STAGE_COLOR: Record<string, string> = {
  active:        "var(--green)",
  onboarding:    "var(--blue)",
  cta_completed: "var(--blue)",
  paused:        "var(--amber)",
  churned:       "var(--red)",
};

function MerchantStageBadge({ stage }: { stage: string }) {
  const label = MERCHANT_STAGE_LABELS[stage] ?? stage;
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
  merchant:  string;
  category:  string;
  brand:     string;
  priceMin:  string;
  priceMax:  string;
  hasImage:  "" | "yes" | "no";
  dateFrom:  string;
  dateTo:    string;
}

const DEFAULT_FILTERS: Filters = {
  merchant: "", category: "", brand: "",
  priceMin: "", priceMax: "", hasImage: "",
  dateFrom: "", dateTo: "",
};

interface Props {
  tabCounts: Record<Tab, number>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProductsTable({ tabCounts }: Props) {
  const supabase     = createClient();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("productId");

  const [tab,              setTab]              = useState<Tab>("active");
  const [viewMode,         setViewMode]         = useState<"table" | "grid">("table");
  const [filters,          setFilters]          = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen,      setFiltersOpen]      = useState(false);
  const [products,         setProducts]         = useState<ProductRow[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [selected,         setSelected]         = useState<Set<string>>(new Set());
  const [working,          setWorking]          = useState(false);
  const [merchantOptions,  setMerchantOptions]  = useState<string[]>([]);
  const [merchantDropdown, setMerchantDropdown] = useState(false);

  // Persist view mode
  useEffect(() => {
    const saved = localStorage.getItem("products-view");
    if (saved === "grid" || saved === "table") setViewMode(saved);
  }, []);

  // Load merchant names for the searchable dropdown
  useEffect(() => {
    supabase.from("merchants").select("store_name").order("store_name").then(({ data }) => {
      if (data) {
        const unique = [...new Set(data.map(m => m.store_name).filter(Boolean) as string[])];
        setMerchantOptions(unique);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setView = (v: "table" | "grid") => {
    setViewMode(v); localStorage.setItem("products-view", v);
  };

  const filterCount = Object.values(filters).filter(v => v !== "").length;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from("products") as any)
        .select("id, name, sku, image_url, category, brand, price, sale_price, nml_cost, stock, status, source, created_at, merchant_id, merchants!inner(store_name, stage)");

      if (tab === "active")     q = q.eq("merchants.stage", "active");
      if (tab === "onboarding") q = q.in("merchants.stage", ONBOARDING_STAGES);

      if (filters.merchant) q = q.ilike("merchants.store_name", `%${filters.merchant}%`);
      if (filters.category) q = q.ilike("category",   `%${filters.category}%`);
      if (filters.brand)    q = q.ilike("brand",       `%${filters.brand}%`);
      if (filters.priceMin) q = q.gte("price", filters.priceMin);
      if (filters.priceMax) q = q.lte("price", filters.priceMax);
      if (filters.hasImage === "yes") q = q.not("image_url", "is", null);
      if (filters.hasImage === "no")  q = q.is("image_url", null);
      if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
      if (filters.dateTo)   q = q.lte("created_at", filters.dateTo + "T23:59:59");

      q = q.order("created_at", { ascending: false }).limit(500);

      const { data, error } = await q;
      if (error) toast.error((error as { message: string }).message);
      else setProducts((data ?? []) as ProductRow[]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filters]);

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
        category: filters.category || undefined,
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

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Products</h1>
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} className={`pill${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
            <span style={{ fontSize: 11, background: "rgba(0,0,0,.07)", padding: "1px 6px", borderRadius: 999 }}>
              {tabCounts[t.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
          {/* Merchant combobox */}
          <div style={{ position: "relative" }}>
            <label className="field-label">Merchant</label>
            <input
              className="field"
              type="text"
              placeholder="Search merchant…"
              value={filters.merchant}
              onChange={e => { setFilters(f => ({ ...f, merchant: e.target.value })); setMerchantDropdown(true); }}
              onFocus={() => setMerchantDropdown(true)}
              onBlur={() => setTimeout(() => setMerchantDropdown(false), 150)}
            />
            {merchantDropdown && merchantOptions.filter(n => !filters.merchant || n.toLowerCase().includes(filters.merchant.toLowerCase())).length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                background: "rgba(255,255,255,.97)", border: "1px solid var(--g-line)",
                borderRadius: 10, boxShadow: "0 8px 24px rgba(40,60,110,.12)",
                maxHeight: 200, overflowY: "auto",
              }}>
                {merchantOptions
                  .filter(n => !filters.merchant || n.toLowerCase().includes(filters.merchant.toLowerCase()))
                  .slice(0, 20)
                  .map(name => (
                    <div
                      key={name}
                      style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12.5 }}
                      onMouseDown={() => { setFilters(f => ({ ...f, merchant: name })); setMerchantDropdown(false); }}
                    >
                      {name}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {[
            { key: "category" as const, label: "Category",  type: "text",   placeholder: "Category…" },
            { key: "brand"    as const, label: "Brand",     type: "text",   placeholder: "Brand…" },
            { key: "priceMin" as const, label: "Price min", type: "number", placeholder: "0" },
            { key: "priceMax" as const, label: "Price max", type: "number", placeholder: "∞" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input className="field" type={type} placeholder={placeholder}
                value={filters[key]}
                onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="field-label">Has image</label>
            <select className="field" value={filters.hasImage} onChange={e => setFilters(f => ({ ...f, hasImage: e.target.value as Filters["hasImage"] }))}>
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="field-label">Added from</label>
            <input className="field" type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Added to</label>
            <input className="field" type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="pill ghost" style={{ width: "100%" }} onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
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

      {/* Table view */}
      {viewMode === "table" ? (
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
                <th>Merchant status</th>
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
                    <EmptyState title="No products"
                      description={tab === "all" ? "No products match your filters." : `No products for ${TABS.find(t => t.key === tab)?.label ?? tab}.`} />
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
                    <a href={`/merchants/${p.merchant_id}`} onClick={e => e.stopPropagation()}
                      style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12.5 }}>
                      {p.merchants.store_name}
                    </a>
                  </td>
                  <td>
                    <MerchantStageBadge stage={p.merchants.stage} />
                  </td>
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
      ) : (
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
              <EmptyState title="No products"
                description={tab === "all" ? "No products match your filters." : `No products for ${TABS.find(t => t.key === tab)?.label ?? tab}.`} />
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
