"use client";
import { useEffect, useRef, useState } from "react";

interface CatalogueProduct {
  id: string;
  name: string;
  image_url: string | null;
  images: string[] | null;
  category_mapped: string | null;
  price: number | null;
  description: string | null;
  url: string | null;
  merchant_name: string | null;
}

interface Props {
  product: CatalogueProduct;
  onClose: () => void;
}

export default function CatalogueProductModal({ product, onClose }: Props) {
  const allImages = [
    ...(product.image_url ? [product.image_url] : []),
    ...(product.images ?? []).filter(img => img !== product.image_url),
  ].filter(Boolean) as string[];

  const [imgIdx, setImgIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft"  && imgIdx > 0)                    setImgIdx(i => i - 1);
      if (e.key === "ArrowRight" && imgIdx < allImages.length - 1) setImgIdx(i => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [imgIdx, allImages.length, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const hasPrev = imgIdx > 0;
  const hasNext = imgIdx < allImages.length - 1;

  return (
    <>
      <style>{`
        .cat-modal-panel {
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: 1fr;
          width: 100%;
          max-width: min(900px, 90vw);
          max-height: 85vh;
          border-radius: 20px;
          overflow: hidden;
          background: rgba(255,255,255,.92);
          border: 1px solid rgba(255,255,255,.95);
          box-shadow: 0 40px 100px rgba(20,28,45,.35), 0 1px 0 rgba(255,255,255,1) inset;
          backdrop-filter: blur(32px);
          -webkit-backdrop-filter: blur(32px);
        }
        .cat-modal-left {
          background: #f4f5f8;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .cat-modal-right {
          overflow-y: auto;
          padding: 36px 32px 36px;
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        @media (max-width: 640px) {
          .cat-modal-panel {
            grid-template-columns: 1fr;
            grid-template-rows: auto 1fr;
            max-width: 95vw;
            max-height: 92vh;
          }
          .cat-modal-left {
            max-height: 52vw;
            min-height: 200px;
          }
          .cat-modal-right {
            padding: 20px 18px 24px;
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed", inset: 0, zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 16px",
          background: "rgba(18,24,40,.6)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div ref={panelRef} className="cat-modal-panel">

          {/* LEFT — image gallery */}
          <div className="cat-modal-left">
            {/* Main image */}
            <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
              {allImages.length > 0 ? (
                <img
                  key={allImages[imgIdx]}
                  src={allImages[imgIdx]}
                  alt={product.name}
                  style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", padding: 8, boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(120,135,160,.3)", fontSize: 64 }}>
                  □
                </div>
              )}

              {/* Nav arrows */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                    disabled={!hasPrev}
                    aria-label="Previous"
                    style={{
                      position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                      width: 38, height: 38, borderRadius: "50%",
                      background: "rgba(255,255,255,.88)", border: "1px solid rgba(0,0,0,.08)",
                      cursor: hasPrev ? "pointer" : "default",
                      fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: hasPrev ? 1 : 0.25, transition: "opacity .15s",
                      color: "#1c2536",
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setImgIdx(i => Math.min(allImages.length - 1, i + 1))}
                    disabled={!hasNext}
                    aria-label="Next"
                    style={{
                      position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                      width: 38, height: 38, borderRadius: "50%",
                      background: "rgba(255,255,255,.88)", border: "1px solid rgba(0,0,0,.08)",
                      cursor: hasNext ? "pointer" : "default",
                      fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: hasNext ? 1 : 0.25, transition: "opacity .15s",
                      color: "#1c2536",
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div style={{
                display: "flex", gap: 6, padding: "10px 12px 12px",
                overflowX: "auto", flexShrink: 0,
                scrollbarWidth: "none",
              }}>
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    style={{
                      width: 52, height: 52, flexShrink: 0, padding: 0, border: "none",
                      borderRadius: 8, cursor: "pointer", overflow: "hidden",
                      outline: i === imgIdx ? "2.5px solid #dc2626" : "2.5px solid transparent",
                      outlineOffset: 1,
                      opacity: i === imgIdx ? 1 : 0.5,
                      transition: "opacity .15s, outline-color .15s",
                      background: "#e8eaf0",
                    }}
                  >
                    <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT — details */}
          <div className="cat-modal-right">
            {/* Close button */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, flexShrink: 0 }}>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(0,0,0,.06)", border: "none",
                  cursor: "pointer", fontSize: 20, lineHeight: "33px", textAlign: "center",
                  color: "#8896aa",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>

            {/* Category pill */}
            {product.category_mapped && (
              <div style={{ marginBottom: 12, flexShrink: 0 }}>
                <span style={{
                  display: "inline-block", padding: "4px 12px",
                  borderRadius: 20, background: "rgba(220,38,38,.08)",
                  color: "#b91c1c", fontSize: 12, fontWeight: 500,
                  direction: "rtl",
                }}>
                  {product.category_mapped}
                </span>
              </div>
            )}

            {/* Product name */}
            <h2 style={{
              margin: "0 0 20px", fontSize: 22, fontWeight: 700,
              color: "#1c2536", lineHeight: 1.4,
              direction: "rtl", textAlign: "right", flexShrink: 0,
            }}>
              {product.name}
            </h2>

            {/* Price */}
            {product.price != null && (
              <div style={{ marginBottom: 24, flexShrink: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: "#8896aa", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                  Price
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#1c2536", fontVariantNumeric: "tabular-nums", letterSpacing: "-.01em" }}>
                  SAR {Number(product.price).toLocaleString("en-US")}
                </div>
              </div>
            )}

            {/* Merchant + source link */}
            {(product.merchant_name || product.url) && (
              <div style={{ marginBottom: 24, flexShrink: 0 }}>
                {product.merchant_name && (
                  <div style={{ marginBottom: product.url ? 10 : 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: "#8896aa", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                      Merchant
                    </div>
                    <div style={{ fontSize: 14, color: "#1c2536" }}>{product.merchant_name}</div>
                  </div>
                )}
                {product.url && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 16px", borderRadius: 10,
                      background: "rgba(220,38,38,.07)", border: "1px solid rgba(220,38,38,.18)",
                      color: "#b91c1c", fontSize: 13, fontWeight: 500,
                      textDecoration: "none", marginTop: product.merchant_name ? 10 : 0,
                    }}
                  >
                    <span style={{ fontSize: 15 }}>↗</span> View on Salla
                  </a>
                )}
              </div>
            )}

            {/* Description */}
            {product.description && (
              <div style={{ borderTop: "1px solid rgba(0,0,0,.07)", paddingTop: 20, flexShrink: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 500, color: "#8896aa", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>
                  Description
                </div>
                <p style={{
                  margin: 0, fontSize: 14, color: "#3d4e6a",
                  lineHeight: 1.8, whiteSpace: "pre-wrap",
                  direction: "rtl", textAlign: "right",
                }}>
                  {product.description}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
