"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import type { VProductMargin, Lookup, ProductStatus } from "@/lib/database.types";
import { PRODUCT_STATUS_LABELS, fmtCurrency, fmtDate, fmtDateTime } from "@/lib/utils";
import Drawer from "@/components/ui/Drawer";
import ProductStatusBadge from "@/components/ui/ProductStatusBadge";
import Modal from "@/components/ui/Modal";
import { updateProductStatus, updateProductReviewNotes } from "./actions";

interface Props {
  productId: string;
  productIds: string[];
  rejectReasons: Lookup[];
  onClose: () => void;
  onNavigate: (id: string) => void;
  onAction: () => void;
}

export default function ProductDrawer({
  productId, productIds, rejectReasons, onClose, onNavigate, onAction,
}: Props) {
  const supabase = createClient();

  const [product,      setProduct]      = useState<VProductMargin | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [notes,        setNotes]        = useState("");
  const [savedNotes,   setSavedNotes]   = useState("");
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [working,      setWorking]      = useState(false);
  const [rejectOpen,   setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNotes,  setRejectNotes]  = useState("");
  const [rawOpen,      setRawOpen]      = useState(false);
  const [imgIdx,       setImgIdx]       = useState(0);

  const currentIdx = productIds.indexOf(productId);

  const fetchProduct = useCallback(async () => {
    setLoading(true);
    setImgIdx(0);
    setRawOpen(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: raw, error } = await (supabase.from("v_product_margin") as any)
        .select("*")
        .eq("id", productId)
        .single();
      if (error) { toast.error((error as { message: string }).message); return; }
      const data = raw as VProductMargin;
      setProduct(data);
      setNotes(data.review_notes ?? "");
      setSavedNotes(data.review_notes ?? "");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft"  && currentIdx > 0)                      onNavigate(productIds[currentIdx - 1]);
      if (e.key === "ArrowRight" && currentIdx < productIds.length - 1)  onNavigate(productIds[currentIdx + 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIdx, productIds, onNavigate]);

  const handleStatus = async (status: ProductStatus) => {
    if (status === "rejected") { setRejectOpen(true); return; }
    setWorking(true);
    try {
      await updateProductStatus(productId, status);
      toast.success(`Product ${PRODUCT_STATUS_LABELS[status].toLowerCase()}`);
      onAction();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  const handleReject = async () => {
    setWorking(true);
    try {
      await updateProductStatus(productId, "rejected", rejectReason || undefined);
      if (rejectNotes) await updateProductReviewNotes(productId, rejectNotes);
      toast.success("Product rejected");
      setRejectOpen(false);
      onAction();
    } catch (e) { toast.error((e as Error).message); }
    finally { setWorking(false); }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateProductReviewNotes(productId, notes);
      setSavedNotes(notes);
      toast.success("Notes saved");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSavingNotes(false); }
  };

  const images = product
    ? [product.image_url, ...(product.images ?? [])].filter(Boolean) as string[]
    : [];

  const margin      = product?.margin_pct      != null ? Number(product.margin_pct)      : null;
  const effectiveCost = product?.effective_cost != null ? Number(product.effective_cost) : null;

  const marginColor = margin == null
    ? "var(--ink-3)"
    : margin >= 20 ? "var(--green)" : margin >= 10 ? "var(--amber)" : "var(--red)";

  return (
    <>
      <Drawer open title={product?.name ?? "Product"} onClose={onClose} side="right" width={580}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>Loading…</div>
        ) : !product ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>Product not found</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Prev / Next navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                className="pill outline"
                onClick={() => currentIdx > 0 && onNavigate(productIds[currentIdx - 1])}
                disabled={currentIdx <= 0}
                style={{ padding: "4px 10px", opacity: currentIdx <= 0 ? 0.4 : 1 }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                {currentIdx + 1} / {productIds.length}
              </span>
              <button
                className="pill outline"
                onClick={() => currentIdx < productIds.length - 1 && onNavigate(productIds[currentIdx + 1])}
                disabled={currentIdx >= productIds.length - 1}
                style={{ padding: "4px 10px", opacity: currentIdx >= productIds.length - 1 ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>

            {/* Image carousel */}
            {images.length > 0 && (
              <div>
                <div style={{ borderRadius: 12, overflow: "hidden", background: "var(--g-panel)", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img
                    src={images[imgIdx]} alt=""
                    style={{ width: "100%", maxHeight: 280, objectFit: "contain", display: "block" }}
                  />
                </div>
                {images.length > 1 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {images.map((img, i) => (
                      <img
                        key={i} src={img} alt=""
                        onClick={() => setImgIdx(i)}
                        style={{
                          width: 48, height: 48, objectFit: "cover", borderRadius: 6,
                          cursor: "pointer",
                          border: `2px solid ${i === imgIdx ? "var(--blue)" : "transparent"}`,
                          opacity: i === imgIdx ? 1 : 0.6,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Name & status */}
            <div>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{product.name}</h2>
                  {product.name_ar && (
                    <div style={{ fontSize: 13, color: "var(--ink-2)", direction: "rtl" }}>{product.name_ar}</div>
                  )}
                </div>
                <ProductStatusBadge status={product.status} />
              </div>
              {product.sku && <div className="sub mono">SKU: {product.sku}</div>}
              {product.url && (
                <a href={product.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none" }}>
                  View source ↗
                </a>
              )}
            </div>

            {/* Pricing & margin */}
            <div className="glass-panel" style={{ padding: "12px 14px" }}>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>Pricing &amp; margin</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                <div className="kv"><span className="k">Price</span><span className="num">{fmtCurrency(product.price, product.currency)}</span></div>
                <div className="kv"><span className="k">Sale price</span><span className="num">{product.sale_price ? fmtCurrency(product.sale_price, product.currency) : "—"}</span></div>
                <div className="kv"><span className="k">Effective cost</span><span className="num">{effectiveCost != null ? fmtCurrency(effectiveCost, product.currency) : "—"}</span></div>
                <div className="kv">
                  <span className="k">Margin</span>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 13, color: marginColor }}>
                    {margin != null ? `${margin.toFixed(1)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Product details */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }}>
              <div className="kv"><span className="k">Merchant</span>
                <a href={`/merchants/${product.merchant_id}`} style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12.5 }}>{product.store_name}</a>
              </div>
              <div className="kv"><span className="k">Category</span><span>{product.category || "—"}</span></div>
              <div className="kv"><span className="k">Brand</span><span>{product.brand || "—"}</span></div>
              <div className="kv"><span className="k">Stock</span><span className="num">{product.stock ?? "—"}</span></div>
              <div className="kv"><span className="k">Weight</span><span>{product.weight_g != null ? `${product.weight_g} g` : "—"}</span></div>
              <div className="kv"><span className="k">Source</span><span className="sub">{product.source}</span></div>
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <div className="field-label">Description</div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.7 }}>{product.description}</p>
              </div>
            )}

            {/* Reject reason */}
            {product.status === "rejected" && product.reject_reason && (
              <div style={{ background: "var(--red-bg)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 11.5, color: "var(--red)", fontWeight: 500, marginBottom: 4 }}>Reject reason</div>
                <div style={{ fontSize: 13, color: "var(--red-d)" }}>{product.reject_reason}</div>
              </div>
            )}

            {/* Status history */}
            <div>
              <div className="field-label" style={{ marginBottom: 6 }}>Status history</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <div className="kv"><span className="k">Added</span><span className="sub">{fmtDateTime(product.created_at)}</span></div>
                {product.ready_at     && <div className="kv"><span className="k">Ready for shelf</span><span className="sub">{fmtDateTime(product.ready_at)}</span></div>}
                {product.reviewed_at  && <div className="kv"><span className="k">Reviewed</span><span className="sub">{fmtDateTime(product.reviewed_at)}</span></div>}
                {product.shelved_at   && <div className="kv"><span className="k">Shelved</span><span className="sub">{fmtDateTime(product.shelved_at)}</span></div>}
              </div>
            </div>

            {/* Review notes */}
            <div>
              <label className="field-label">Review notes</label>
              <textarea
                className="field"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add review notes…"
                rows={3}
              />
              <button
                className="pill dark"
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === savedNotes}
                style={{ marginTop: 6, padding: "6px 14px" }}
              >
                {savingNotes ? "Saving…" : "Save notes"}
              </button>
            </div>

            {/* Raw payload */}
            {product.raw != null && (
              <div>
                <button
                  className="pill outline"
                  onClick={() => setRawOpen((o) => !o)}
                  style={{ fontSize: 12, padding: "4px 12px" }}
                >
                  {rawOpen ? "Hide" : "Show"} raw payload
                </button>
                {rawOpen && (
                  <pre style={{
                    marginTop: 8, padding: "10px 12px", borderRadius: 10,
                    background: "rgba(28,37,54,.05)", fontSize: 11, overflowX: "auto",
                    maxHeight: 300, color: "var(--ink-2)", lineHeight: 1.5,
                  }}>
                    {JSON.stringify(product.raw, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--g-line)" }}>
              {!["in_review", "shelved", "rejected", "archived"].includes(product.status) && (
                <button className="pill outline" onClick={() => handleStatus("in_review")} disabled={working}>
                  Move to review
                </button>
              )}
              {!["shelved", "archived"].includes(product.status) && (
                <button
                  className="pill dark"
                  onClick={() => handleStatus("shelved")}
                  disabled={working}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}
                >
                  Shelve
                  {margin != null && (
                    <span style={{
                      fontSize: 11, fontFamily: "JetBrains Mono, monospace",
                      background: "rgba(255,255,255,.15)", padding: "1px 6px", borderRadius: 999,
                      color: margin >= 20 ? "#86efac" : margin >= 10 ? "#fde68a" : "#fca5a5",
                    }}>
                      {margin.toFixed(1)}%
                    </span>
                  )}
                </button>
              )}
              {!["rejected", "archived"].includes(product.status) && (
                <button className="pill danger" onClick={() => handleStatus("rejected")} disabled={working}>
                  Reject
                </button>
              )}
              {product.status !== "archived" && (
                <button
                  className="pill outline"
                  onClick={() => handleStatus("archived")}
                  disabled={working}
                  style={{ marginLeft: "auto", color: "var(--ink-3)" }}
                >
                  Archive
                </button>
              )}
            </div>

          </div>
        )}
      </Drawer>

      {/* Reject modal */}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject product" danger footer={<>
        <button className="pill outline" onClick={() => setRejectOpen(false)}>Cancel</button>
        <button className="pill danger" onClick={handleReject} disabled={working}>
          {working ? "Working…" : "Reject"}
        </button>
      </>}>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Reason</label>
          <select className="field" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}>
            <option value="">Select reason…</option>
            {rejectReasons.map((r) => <option key={r.id} value={r.value}>{r.value_ar ?? r.value}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Notes (optional)</label>
          <textarea className="field" rows={3} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} placeholder="Add notes…" />
        </div>
      </Modal>
    </>
  );
}
