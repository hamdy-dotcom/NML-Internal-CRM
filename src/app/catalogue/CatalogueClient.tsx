"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 100;

interface Product {
  id: string;
  name: string;
  image_url: string | null;
  category_mapped: string | null;
  price: number | null;
}

interface CategoryOption {
  mapped_category: string;
  product_count: number;
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const from = page * PAGE_SIZE + 1;
  const to   = Math.min((page + 1) * PAGE_SIZE, total);

  const pages: (number | "…")[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 32, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--ink-3)", marginRight: 8 }}>
        {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ fontSize: 13, color: "var(--ink-3)", padding: "0 4px" }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            style={{
              width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
              background: p === page ? "rgba(255,255,255,.85)" : "transparent",
              color: p === page ? "var(--ink)" : "var(--ink-3)",
              boxShadow: p === page ? "0 2px 8px rgba(40,60,110,.10)" : "none",
              fontWeight: p === page ? 500 : 400,
            }}
          >
            {(p as number) + 1}
          </button>
        )
      )}
    </div>
  );
}

export default function CatalogueClient() {
  const [products,   setProducts]   = useState<Product[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [category,   setCategory]   = useState("");
  const [catOptions, setCatOptions] = useState<CategoryOption[]>([]);
  const [catOpen,    setCatOpen]    = useState(false);
  const [searchDraft, setSearchDraft] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load category options once
  useEffect(() => {
    fetch("/api/catalogue?type=categories")
      .then(r => r.json())
      .then(d => setCatOptions(d.categories ?? []))
      .catch(() => {});
  }, []);

  const fetchProducts = useCallback(async (s: string, cat: string, pg: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(pg) });
    if (s)   params.set("search", s);
    if (cat) params.set("category", cat);

    try {
      const resp = await fetch(`/api/catalogue?${params}`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const json = await resp.json();
      if (json.error) { setError(json.error); setLoading(false); return; }
      setProducts(json.products ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(search, category, page);
  }, [search, category, page, fetchProducts]);

  const handleSearch = (val: string) => {
    setSearchDraft(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(0);
      setSearch(val);
    }, 350);
  };

  const selectCategory = (val: string) => {
    setCategory(val);
    setPage(0);
    setCatOpen(false);
  };

  const visibleCats = catOptions
    .filter(o => !category || o.mapped_category.toLowerCase().includes(category.toLowerCase()))
    .slice(0, 30);

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* Search */}
        <div style={{ flex: "1 1 220px", minWidth: 180 }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Search
          </label>
          <input
            type="search"
            placeholder="Product name…"
            value={searchDraft}
            onChange={e => handleSearch(e.target.value)}
            style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1px solid var(--g-line)", background: "rgba(255,255,255,.7)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        {/* Category combobox */}
        <div style={{ flex: "1 1 220px", minWidth: 180, position: "relative" }}>
          <label style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".06em" }}>
            Category
          </label>
          <input
            type="text"
            placeholder="All categories"
            value={category}
            dir="rtl"
            onChange={e => { setCategory(e.target.value); setCatOpen(true); setPage(0); }}
            onFocus={() => setCatOpen(true)}
            onBlur={() => setTimeout(() => setCatOpen(false), 150)}
            style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1px solid var(--g-line)", background: "rgba(255,255,255,.7)", color: "var(--ink)", fontSize: 13, boxSizing: "border-box" }}
          />
          {category && (
            <button
              onClick={() => { setCategory(""); setPage(0); }}
              style={{ position: "absolute", right: 10, top: "calc(50% + 10px)", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 16, lineHeight: 1, padding: 2 }}
            >
              ×
            </button>
          )}
          {catOpen && visibleCats.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4,
              background: "rgba(255,255,255,.98)", border: "1px solid var(--g-line)",
              borderRadius: 12, boxShadow: "0 12px 32px rgba(40,60,110,.14)",
              maxHeight: 240, overflowY: "auto",
            }}>
              <div
                style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, color: "var(--ink-3)" }}
                onMouseDown={() => selectCategory("")}
              >
                All categories
              </div>
              {visibleCats.map(o => (
                <div
                  key={o.mapped_category}
                  style={{
                    padding: "9px 14px", cursor: "pointer", fontSize: 13,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    borderTop: "1px solid rgba(0,0,0,.04)",
                    background: category === o.mapped_category ? "rgba(220,38,38,.06)" : "transparent",
                  }}
                  onMouseDown={() => selectCategory(o.mapped_category)}
                >
                  <span dir="rtl">{o.mapped_category}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-3)", flexShrink: 0, marginLeft: 8 }}>
                    {o.product_count.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <div style={{ alignSelf: "flex-end", paddingBottom: 10, fontSize: 13, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
          {loading ? "…" : `${total.toLocaleString("en-US")} products`}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <div style={{ fontSize: 13, color: "var(--red, #dc2626)", marginBottom: 12 }}>{error}</div>
          <button
            onClick={() => fetchProducts(search, category, page)}
            style={{ padding: "8px 18px", borderRadius: 10, border: "1px solid var(--g-line)", background: "rgba(255,255,255,.7)", cursor: "pointer", fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Grid */}
      {!error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {loading
            ? Array.from({ length: 20 }).map((_, i) => (
                <div key={i} style={{ borderRadius: 14, background: "rgba(255,255,255,.55)", border: "1px solid rgba(255,255,255,.8)", padding: 14, animation: "pulse 1.5s ease-in-out infinite" }}>
                  <div style={{ aspectRatio: "1", borderRadius: 10, background: "rgba(120,135,160,.12)", marginBottom: 12 }} />
                  <div style={{ height: 13, borderRadius: 6, background: "rgba(120,135,160,.12)", marginBottom: 8 }} />
                  <div style={{ height: 11, borderRadius: 6, background: "rgba(120,135,160,.08)", width: "60%", marginBottom: 8 }} />
                  <div style={{ height: 13, borderRadius: 6, background: "rgba(120,135,160,.10)", width: "45%" }} />
                </div>
              ))
            : products.length === 0
            ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "64px 0", color: "var(--ink-3)", fontSize: 14 }}>
                  No products found
                </div>
              )
            : products.map(p => (
                <div key={p.id} style={{
                  borderRadius: 14,
                  background: "rgba(255,255,255,.6)",
                  border: "1px solid rgba(255,255,255,.85)",
                  boxShadow: "0 4px 16px rgba(40,60,110,.07)",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}>
                  {p.image_url
                    ? <img src={p.image_url} alt={p.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, marginBottom: 12, display: "block" }} />
                    : <div style={{ width: "100%", aspectRatio: "1", borderRadius: 10, background: "rgba(120,135,160,.1)", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: "rgba(120,135,160,.3)" }}>□</div>
                  }
                  <div style={{ fontWeight: 500, fontSize: 13.5, color: "var(--ink)", marginBottom: 5, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p.name}
                  </div>
                  {p.category_mapped && (
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginBottom: 6, direction: "rtl", textAlign: "right" }}>
                      {p.category_mapped}
                    </div>
                  )}
                  {p.price && (
                    <div style={{ marginTop: "auto", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                      SAR {Number(p.price).toLocaleString("en-US")}
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}

      <Pagination page={page} total={total} onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />

      <style>{`@keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}`}</style>
    </div>
  );
}
