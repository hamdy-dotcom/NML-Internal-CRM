"use client";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { VProductMargin, ProductStatus, Lookup } from "@/lib/database.types";
import { PRODUCT_STATUS_LABELS, fmtCurrency, fmtDate } from "@/lib/utils";
import ProductStatusBadge from "@/components/ui/ProductStatusBadge";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/SkeletonRows";
import Modal from "@/components/ui/Modal";
import ProductDrawer from "./ProductDrawer";
import { bulkUpdateProductStatus, exportProductsCSV } from "./actions";

type Tab = "ready_for_shelf" | "in_review" | "shelved" | "rejected" | "all";

interface Filters {
  merchant: string;
  category: string;
  brand: string;
  priceMin: string;
  priceMax: string;
  hasImage: "" | "yes" | "no";
  dateFrom: string;
  dateTo: string;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "ready_for_shelf", label: "Ready for shelf" },
  { key: "in_review",       label: "In review" },
  { key: "shelved",         label: "Shelved" },
  { key: "rejected",        label: "Rejected" },
  { key: "all",             label: "All" },
];

const DEFAULT_FILTERS: Filters = {
  merchant: "", category: "", brand: "",
  priceMin: "", priceMax: "", hasImage: "",
  dateFrom: "", dateTo: "",
};

interface Props {
  tabCounts: Record<string, number>;
  rejectReasons: Lookup[];
}

export default function ProductsTable({ tabCounts, rejectReasons }: Props) {
  const supabase = createClient();
  const router     = useRouter();
  const searchParams = useSearchParams();
  const productId    = searchParams.get("productId");

  const [tab,          setTab]          = useState<Tab>("ready_for_shelf");
  const [viewMode,     setViewMode]     = useState<"table" | "grid">("table");
  const [filters,      setFilters]      = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen,  setFiltersOpen]  = useState(false);
  const [products,     setProducts]     = useState<VProductMargin[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [bulkReject,   setBulkReject]   = useState(false);
  const [bulkReason,   setBulkReason]   = useState("");
  const [working,      setWorking]      = useState(false);

  // Persist view mode in localStorage
  useEffect(() => {
    const saved = localStorage.getItem("products-view");
    if (saved === "grid" || saved === "table") setViewMode(saved);
  }, []);
  const setView = (v: "table" | "grid") => {
    setViewMode(v);
    localStorage.setItem("products-view", v);
  };

  const filterCount = Object.values(filters).filter((v) => v !== "").length;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      let q = supabase.from("v_product_margin").select("*");
      if (tab !== "all") q = q.eq("status", tab);
      if (filters.merchant)  q = q.ilike("store_name", `%${filters.merchant}%`);
      if (filters.category)  q = q.ilike("category",   `%${filters.category}%`);
      if (filters.brand)     q = q.ilike("brand",      `%${filters.brand}%`);
      if (filters.priceMin)  q = q.gte("price", filters.priceMin);
      if (filters.priceMax)  q = q.lte("price", filters.priceMax);
      if (filters.hasImage === "yes") q = q.not("image_url", "is", null);
      if (filters.hasImage === "no")  q = q.is("image_url", null);
      if (filters.dateFrom) q = q.gte("created_at", filters.dateFrom);
      if (filters.dateTo)   q = q.lte("created_at", filters.dateTo + "T23:59:59");
      q = (q as typeof q).order("created_at", { ascending: false }).limit(500);
      const { data, error } = await q;
      if (error) toast.error(error.message);
      else setProducts(data ?? []);
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
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected(selected.size === products.length && products.length > 0 ? new Set() : new Set(products.map((p) => p.id)));

  // Bulk actions
  const handleBulkStatus = async (status: ProductStatus) => {
    if (status === "rejected") { setBulkReject(true); return; }
    setWorking(true);
    try {
      await bulkUpdateProductStatus(Array.from(selected), status);
      toast.success(`${selected.size} products updated`);
      fetchProducts();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  const handleBulkReject = async () => {
    setWorking(true);
    try {
      await bulkUpdateProductStatus(Array.from(selected), "rejected", bulkReason || undefined);
      toast.success(`${selected.size} products rejected`);
      setBulkReject(false);
      setBulkReason("");
      fetchProducts();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  const handleExport = async () => {
    try {
      const csv = await exportProductsCSV({
        status:   tab !== "all" ? tab as ProductStatus : undefined,
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

  const tabLabel = (t: Tab) => t === "all" ? "all products" : PRODUCT_STATUS_LABELS[t as ProductStatus].toLowerCase();

  return (
    <div style={{ paddingTop: 16 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Products</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
            {(["table", "grid"] as const).map((v) => (
              <button key={v} className={`pill${viewMode === v ? " active" : ""}`} onClick={() => setView(v)} style={{ padding: "4px 10px", fontSize: 12 }}>
                {v === "table" ? "Table" : "Grid"}
              </button>
            ))}
          </div>
          <button className={`pill${filtersOpen ? " active" : " outline"}`} onClick={() => setFiltersOpen((o) => !o)}>
            {filterCount > 0 ? `Filters · ${filterCount}` : "Filters"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12, overflowX: "auto" }}>
        {TABS.map((t) => (
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
          {[
            { key: "merchant" as const, label: "Merchant",  type: "text",   placeholder: "Search merchant…" },
            { key: "category" as const, label: "Category",  type: "text",   placeholder: "Category…" },
            { key: "brand"    as const, label: "Brand",     type: "text",   placeholder: "Brand…" },
            { key: "priceMin" as const, label: "Price min", type: "number", placeholder: "0" },
            { key: "priceMax" as const, label: "Price max", type: "number", placeholder: "∞" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                className="field" type={type} placeholder={placeholder}
                value={filters[key]}
                onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="field-label">Has image</label>
            <select className="field" value={filters.hasImage} onChange={(e) => setFilters((f) => ({ ...f, hasImage: e.target.value as Filters["hasImage"] }))}>
              <option value="">Any</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="field-label">Added from</label>
            <input className="field" type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
          </div>
          <div>
            <label className="field-label">Added to</label>
            <input className="field" type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
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
          <button onClick={() => handleBulkStatus("in_review")} disabled={working}>Move to review</button>
          <button onClick={() => handleBulkStatus("shelved")}   disabled={working}>Shelve</button>
          <button onClick={() => handleBulkStatus("rejected")}  disabled={working}>Reject</button>
          <button onClick={() => handleBulkStatus("archived")}  disabled={working}>Archive</button>
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
                  <input
                    type="checkbox"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th style={{ width: 44 }}>Image</th>
                <th>Name</th>
                <th>Merchant</th>
                <th>Category</th>
                <th>Price</th>
                <th>Sale price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows cols={10} rows={12} />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState title="No products" description={`No ${tabLabel(tab)} match your filters.`} />
                  </td>
                </tr>
              ) : products.map((p) => (
                <tr
                  key={p.id}
                  className={selected.has(p.id) ? "sel" : undefined}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                    openProduct(p.id);
                  }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
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
                    <a href={`/merchants/${p.merchant_id}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12.5 }}>
                      {p.store_name}
                    </a>
                  </td>
                  <td><span className="sub">{p.category || "—"}</span></td>
                  <td><span className="num">{p.price ? `SAR ${Number(p.price).toLocaleString()}` : "—"}</span></td>
                  <td><span className="num">{p.sale_price ? `SAR ${Number(p.sale_price).toLocaleString()}` : "—"}</span></td>
                  <td><span className="num">{p.stock ?? "—"}</span></td>
                  <td><ProductStatusBadge status={p.status} /></td>
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
              <EmptyState title="No products" description={`No ${tabLabel(tab)} match your filters.`} />
            </div>
          ) : products.map((p) => (
            <div
              key={p.id}
              className="glass-card"
              style={{ cursor: "pointer", padding: 12, position: "relative" }}
              onClick={() => openProduct(p.id)}
            >
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ position: "absolute", top: 10, left: 10 }}
              />
              {p.image_url ? (
                <img src={p.image_url} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 8, display: "block", marginBottom: 10 }} />
              ) : (
                <div style={{ width: "100%", aspectRatio: "1", borderRadius: 8, background: "var(--g-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, color: "var(--ink-5)", marginBottom: 10 }}>□</div>
              )}
              <div className="ellipsis" style={{ fontWeight: 500, fontSize: 13, marginBottom: 3 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>{p.store_name}</div>
              {p.price && <div className="num" style={{ fontSize: 12 }}>SAR {Number(p.price).toLocaleString()}</div>}
              <div style={{ marginTop: 8 }}><ProductStatusBadge status={p.status} /></div>
            </div>
          ))}
        </div>
      )}

      {/* Bulk reject modal */}
      <Modal open={bulkReject} onClose={() => setBulkReject(false)} title={`Reject ${selected.size} products`} danger>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Reject reason</label>
          <select className="field" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}>
            <option value="">Select reason…</option>
            {rejectReasons.map((r) => (
              <option key={r.id} value={r.value}>{r.value_ar ?? r.value}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="pill outline" onClick={() => setBulkReject(false)}>Cancel</button>
          <button className="pill danger" onClick={handleBulkReject} disabled={working}>
            {working ? "Working…" : `Reject ${selected.size}`}
          </button>
        </div>
      </Modal>

      {/* Product drawer */}
      {productId && (
        <ProductDrawer
          productId={productId}
          productIds={products.map((p) => p.id)}
          rejectReasons={rejectReasons}
          onClose={closeDrawer}
          onNavigate={openProduct}
          onAction={() => { closeDrawer(); fetchProducts(); }}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
    </div>
  );
}
