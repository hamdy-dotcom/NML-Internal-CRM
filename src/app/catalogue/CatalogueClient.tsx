"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CatalogueProductModal from "./CatalogueProductModal";
import CategoryFilter, { type CategoryCount } from "@/components/ui/CategoryFilter";

const PAGE_SIZE = 100;

interface Product {
  id: string;
  name: string;
  image_url: string | null;
  images: string[] | null;
  nml_category: string | null;
  nml_subcategory: string | null;
  price: number | null;
  description: string | null;
  url: string | null;
  merchant_id: string | null;
  merchant_name: string | null;
}

interface MerchantOption {
  id: string;
  name: string;
}

// ── Multi-select merchant dropdown ───────────────────────────────────────────
function MerchantMultiSelect({
  options,
  selected,
  onChange,
}: {
  options: MerchantOption[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef   = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Measure trigger on open
  useLayoutEffect(() => {
    if (open && buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [open]);

  // Close on outside click — composedPath covers the portalled panel correctly
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (wrapRef.current  && path.includes(wrapRef.current  as EventTarget)) return;
      if (panelRef.current && path.includes(panelRef.current as EventTarget)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on page scroll (but NOT when scrolling the options list inside the panel)
  // and on Escape key
  useEffect(() => {
    if (!open) return;
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = options.filter(o =>
    !search || o.name.toLowerCase().includes(search.toLowerCase())
  );
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };
  const displayLabel = selected.size === 0
    ? "All merchants"
    : selected.size === 1
    ? (options.find(o => o.id === [...selected][0])?.name ?? "1 merchant")
    : `${selected.size} merchants`;

  const panel = open && pos ? createPortal(
    <div ref={panelRef} style={{
      position: "fixed", top: pos.top, left: pos.left, width: Math.max(pos.width, 220),
      zIndex: 9999, background: "rgba(255,255,255,.99)", border: "1px solid var(--g-line)",
      borderRadius: 12, boxShadow: "0 12px 32px rgba(40,60,110,.16)",
      display: "flex", flexDirection: "column", maxHeight: 300,
    }}>
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid rgba(0,0,0,.06)", flexShrink: 0 }}>
        <input autoFocus type="text" placeholder="Filter merchants…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: "1px solid var(--g-line)", background: "#f5f6f8", fontSize: 12.5, boxSizing: "border-box", outline: "none" }} />
      </div>
      {selected.size > 0 && (
        <div style={{ padding: "8px 14px", fontSize: 12.5, color: "#b91c1c", cursor: "pointer", fontWeight: 500, flexShrink: 0, borderBottom: "1px solid rgba(0,0,0,.04)" }}
          onMouseDown={e => { e.preventDefault(); onChange(new Set()); setOpen(false); }}>
          Clear all ({selected.size} selected)
        </div>
      )}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0
          ? <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--ink-3)" }}>No matches</div>
          : filtered.map(o => {
              const checked = selected.has(o.id);
              return (
                <div key={o.id} onMouseDown={e => { e.preventDefault(); toggle(o.id); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid rgba(0,0,0,.03)", background: checked ? "rgba(220,38,38,.05)" : "transparent" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: checked ? "none" : "1.5px solid #c5cdd8", background: checked ? "#dc2626" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checked && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                  </div>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                </div>
              );
            })
        }
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div ref={wrapRef} style={{ flex: "1 1 150px", minWidth: 130, position: "relative" }}>
      <label style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>
        Merchant
      </label>
      <div style={{ position: "relative" }}>
        <button
          ref={buttonRef}
          onClick={() => setOpen(o => !o)}
          style={{
            width: "100%", padding: "8px 32px 8px 12px", borderRadius: 8,
            border: "1px solid var(--g-line)",
            background: selected.size > 0 ? "rgba(220,38,38,.06)" : "rgba(255,255,255,.7)",
            color: selected.size > 0 ? "#b91c1c" : "var(--ink-3)",
            fontSize: 13, textAlign: "left", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayLabel}</span>
          <span style={{ fontSize: 10, opacity: .6, flexShrink: 0, marginLeft: 6 }}>{open ? "▲" : "▼"}</span>
        </button>
        {selected.size > 0 && (
          <button onClick={() => onChange(new Set())}
            style={{ position: "absolute", right: 28, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 16, lineHeight: 1, padding: 2 }}>
            ×
          </button>
        )}
      </div>
      {panel}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  const pages: (number | "…")[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ fontSize: 13, color: "var(--ink-3)", padding: "0 4px" }}>…</span>
        ) : (
          <button key={p} onClick={() => onChange(p as number)}
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, background: p === page ? "rgba(255,255,255,.85)" : "transparent", color: p === page ? "var(--ink)" : "var(--ink-3)", boxShadow: p === page ? "0 2px 8px rgba(40,60,110,.10)" : "none", fontWeight: p === page ? 500 : 400 }}>
            {(p as number) + 1}
          </button>
        )
      )}
    </div>
  );
}

// ── Main client ──────────────────────────────────────────────────────────────
export default function CatalogueClient() {
  const [products,          setProducts]          = useState<Product[]>([]);
  const [total,             setTotal]             = useState(0);
  const [page,              setPage]              = useState(0);
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState<string | null>(null);
  const [search,            setSearch]            = useState("");
  const [searchDraft,       setSearchDraft]       = useState("");
  const [nmlCategory,       setNmlCategory]       = useState("");
  const [nmlSubcategory,    setNmlSubcategory]    = useState("");
  const [selectedMerchants, setSelectedMerchants] = useState<Set<string>>(new Set());
  const [merchantOpts,      setMerchantOpts]      = useState<MerchantOption[]>([]);
  const [activeProduct,     setActiveProduct]     = useState<Product | null>(null);

  const abortRef    = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/catalogue?type=merchants")
      .then(r => r.json())
      .then(d => setMerchantOpts((d.merchants ?? []) as MerchantOption[]))
      .catch(() => {});
  }, []);

  // CategoryFilter callbacks — use public API endpoints so no auth needed
  const loadCategories = useCallback(async (): Promise<CategoryCount[]> => {
    const resp = await fetch("/api/catalogue?type=nml-categories");
    const json = await resp.json();
    return (json.categories ?? []) as CategoryCount[];
  }, []);

  const loadSubcategories = useCallback(async (cat: string): Promise<CategoryCount[]> => {
    const resp = await fetch(`/api/catalogue?type=nml-subcategories&category=${encodeURIComponent(cat)}`);
    const json = await resp.json();
    return (json.subcategories ?? []) as CategoryCount[];
  }, []);

  const fetchProducts = useCallback(async (s: string, cat: string, sub: string, merchants: Set<string>, pg: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(pg) });
    if (s)               params.set("search", s);
    if (cat)             params.set("nml_category", cat);
    if (sub)             params.set("nml_subcategory", sub);
    if (merchants.size)  params.set("merchant_ids", [...merchants].join(","));

    try {
      const resp = await fetch(`/api/catalogue?${params}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const json = await resp.json();
      if (json.error) { setError(json.error); setLoading(false); return; }
      setProducts(json.products ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(search, nmlCategory, nmlSubcategory, selectedMerchants, page);
  }, [search, nmlCategory, nmlSubcategory, selectedMerchants, page, fetchProducts]);

  const handleSearch = (val: string) => {
    setSearchDraft(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(0); setSearch(val); }, 350);
  };

  return (
    <div>
      {/* Filter bar — all 4 controls on one row */}
      <div style={{
        background: "rgba(255,255,255,.72)",
        border: "1px solid rgba(255,255,255,.88)",
        borderRadius: 14,
        padding: "14px 16px",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        boxShadow: "0 2px 10px rgba(40,60,110,.06)",
        marginBottom: 20,
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "flex-end",
      }}>
        {/* Search — flex 2 */}
        <div style={{ flex: "2 1 180px", minWidth: 140 }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Search
          </label>
          <input type="search" placeholder="Product name…" value={searchDraft}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--g-line)", background: "rgba(255,255,255,.7)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
        </div>

        {/* Merchant — flex 1 */}
        <MerchantMultiSelect
          options={merchantOpts}
          selected={selectedMerchants}
          onChange={next => { setSelectedMerchants(next); setPage(0); }}
        />

        {/* Category + Subcategory — each flex 1 within the 2-unit slot */}
        <CategoryFilter
          nmlCategory={nmlCategory}
          nmlSubcategory={nmlSubcategory}
          onChange={(cat, sub) => { setNmlCategory(cat); setNmlSubcategory(sub); setPage(0); }}
          loadCategories={loadCategories}
          loadSubcategories={loadSubcategories}
          style={{ flex: "2 1 280px" }}
          showChips={false}
        />
      </div>

      {/* Active category chips below bar */}
      {(nmlCategory || nmlSubcategory) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {nmlCategory && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px 3px 12px", borderRadius: 99, background: "rgba(220,38,38,.1)", color: "#b91c1c", fontSize: 12, fontWeight: 500, direction: "rtl" }}>
              {nmlCategory}
              <button onClick={() => { setNmlCategory(""); setNmlSubcategory(""); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: 0, display: "flex" }}>×</button>
            </span>
          )}
          {nmlSubcategory && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px 3px 12px", borderRadius: 99, background: "rgba(0,0,0,.06)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, direction: "rtl" }}>
              {nmlSubcategory}
              <button onClick={() => { setNmlSubcategory(""); setPage(0); }} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 14, lineHeight: 1, padding: 0, display: "flex" }}>×</button>
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 13, color: "var(--red, #dc2626)", marginBottom: 12 }}>{error}</div>
          <button onClick={() => fetchProducts(search, nmlCategory, nmlSubcategory, selectedMerchants, page)}
            style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid var(--g-line)", background: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 13 }}>
            Retry
          </button>
        </div>
      )}

      {/* Responsive grid */}
      <style>{`
        .cat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:16px; }
        .cat-card { border-radius:14px; background:rgba(255,255,255,.6); border:1px solid rgba(255,255,255,.85); box-shadow:0 4px 16px rgba(40,60,110,.07); padding:14px; display:flex; flex-direction:column; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); cursor:pointer; transition:box-shadow .15s,transform .15s; }
        .cat-card:hover { box-shadow:0 8px 28px rgba(40,60,110,.14); transform:translateY(-2px); }
        .cat-card-img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; margin-bottom:12px; display:block; }
        .cat-card-img-ph { width:100%; aspect-ratio:1; border-radius:10px; background:rgba(120,135,160,.1); margin-bottom:12px; display:flex; align-items:center; justify-content:center; font-size:36px; color:rgba(120,135,160,.3); }
        .cat-card-name { font-weight:500; font-size:13.5px; color:var(--ink); margin-bottom:5px; line-height:1.35; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .cat-card-cat  { font-size:11.5px; color:var(--ink-3); margin-bottom:6px; direction:rtl; text-align:right; }
        .cat-card-price { margin-top:auto; font-size:14px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
        @keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:1} }
        @media (max-width:640px) {
          .cat-grid { grid-template-columns:repeat(auto-fill,minmax(90px,1fr)); gap:8px; }
          .cat-card { padding:8px; border-radius:10px; box-shadow:none; }
          .cat-card:hover { transform:none; box-shadow:none; }
          .cat-card-img { border-radius:7px; margin-bottom:7px; }
          .cat-card-img-ph { border-radius:7px; margin-bottom:7px; font-size:22px; }
          .cat-card-name { font-size:11px; margin-bottom:3px; }
          .cat-card-cat  { font-size:10px; margin-bottom:3px; }
          .cat-card-price { font-size:11.5px; }
        }
      `}</style>

      {!error && (
        <div className="cat-grid">
          {loading
            ? Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="cat-card" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
                  <div className="cat-card-img" style={{ background: "rgba(120,135,160,.12)" }} />
                  <div style={{ height: 13, borderRadius: 6, background: "rgba(120,135,160,.12)", marginBottom: 8 }} />
                  <div style={{ height: 11, borderRadius: 6, background: "rgba(120,135,160,.08)", width: "60%", marginBottom: 8 }} />
                  <div style={{ height: 13, borderRadius: 6, background: "rgba(120,135,160,.10)", width: "45%" }} />
                </div>
              ))
            : products.length === 0
            ? <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0", color: "var(--ink-3)", fontSize: 14 }}>No products found</div>
            : products.map(p => (
                <div key={p.id} className="cat-card" onClick={() => setActiveProduct(p)}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} className="cat-card-img" />
                    : <div className="cat-card-img-ph">□</div>
                  }
                  <div className="cat-card-name">{p.name}</div>
                  {p.nml_category && <div className="cat-card-cat">{p.nml_category}</div>}
                  {p.price != null && <div className="cat-card-price">SAR {Number(p.price).toLocaleString("en-US")}</div>}
                </div>
              ))
          }
        </div>
      )}

      <Pagination page={page} total={total} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />

      {activeProduct && (
        <CatalogueProductModal product={activeProduct} onClose={() => setActiveProduct(null)} />
      )}
    </div>
  );
}
