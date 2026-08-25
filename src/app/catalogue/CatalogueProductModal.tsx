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
}

interface Props {
  product: CatalogueProduct;
  onClose: () => void;
}

export default function CatalogueProductModal({ product, onClose }: Props) {
  const allImages = [
    ...(product.image_url ? [product.image_url] : []),
    ...(product.images ?? []),
  ].filter(Boolean) as string[];

  const [imgIdx, setImgIdx] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keyboard: Escape closes, ← → navigate images
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowLeft"  && imgIdx > 0)                  setImgIdx(i => i - 1);
      if (e.key === "ArrowRight" && imgIdx < allImages.length - 1) setImgIdx(i => i + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [imgIdx, allImages.length, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        background: "rgba(20,28,45,.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "92vh",
          overflowY: "auto",
          borderRadius: 20,
          background: "rgba(255,255,255,.88)",
          border: "1px solid rgba(255,255,255,.9)",
          boxShadow: "0 32px 80px rgba(20,28,45,.28), 0 1px 0 rgba(255,255,255,1) inset",
          backdropFilter: "blur(32px)",
          WebkitBackdropFilter: "blur(32px)",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "sticky", top: 12, float: "right", marginRight: 12,
            width: 32, height: 32, borderRadius: "50%",
            background: "rgba(255,255,255,.8)", border: "1px solid rgba(0,0,0,.08)",
            cursor: "pointer", fontSize: 18, lineHeight: "30px", textAlign: "center",
            color: "var(--ink-3)", zIndex: 10,
          }}
        >
          ×
        </button>

        <div style={{ padding: "24px 24px 32px", clearfix: "both" } as React.CSSProperties}>

          {/* Image gallery */}
          {allImages.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              {/* Main image with arrows */}
              <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "var(--g-panel, rgba(120,135,160,.08))", marginBottom: 10 }}>
                <img
                  src={allImages[imgIdx]}
                  alt={product.name}
                  style={{ width: "100%", maxHeight: 360, objectFit: "contain", display: "block" }}
                />
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setImgIdx(i => Math.max(0, i - 1))}
                      disabled={imgIdx === 0}
                      aria-label="Previous image"
                      style={{
                        position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                        width: 36, height: 36, borderRadius: "50%",
                        background: "rgba(255,255,255,.85)", border: "1px solid rgba(0,0,0,.08)",
                        cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: imgIdx === 0 ? 0.3 : 1, transition: "opacity .15s",
                      }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setImgIdx(i => Math.min(allImages.length - 1, i + 1))}
                      disabled={imgIdx === allImages.length - 1}
                      aria-label="Next image"
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        width: 36, height: 36, borderRadius: "50%",
                        background: "rgba(255,255,255,.85)", border: "1px solid rgba(0,0,0,.08)",
                        cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                        opacity: imgIdx === allImages.length - 1 ? 0.3 : 1, transition: "opacity .15s",
                      }}
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      style={{
                        width: 52, height: 52, padding: 0, border: "none", borderRadius: 8, cursor: "pointer",
                        outline: i === imgIdx ? "2px solid var(--nml-red, #dc2626)" : "2px solid transparent",
                        outlineOffset: 1, overflow: "hidden", background: "none",
                        opacity: i === imgIdx ? 1 : 0.55, transition: "opacity .15s, outline-color .15s",
                      }}
                    >
                      <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Name */}
          <h2 style={{
            margin: "0 0 8px", fontSize: 18, fontWeight: 600,
            color: "var(--ink, #1c2536)", lineHeight: 1.35,
            direction: "rtl", textAlign: "right",
          }}>
            {product.name}
          </h2>

          {/* Category */}
          {product.category_mapped && (
            <div style={{ fontSize: 12.5, color: "var(--ink-3, #8896aa)", marginBottom: 14, direction: "rtl", textAlign: "right" }}>
              {product.category_mapped}
            </div>
          )}

          {/* Price */}
          {product.price && (
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink, #1c2536)", marginBottom: 16, fontVariantNumeric: "tabular-nums" }}>
              SAR {Number(product.price).toLocaleString("en-US")}
            </div>
          )}

          {/* Description */}
          {product.description && (
            <div style={{ borderTop: "1px solid rgba(0,0,0,.06)", paddingTop: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 500, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                Description
              </div>
              <p style={{
                margin: 0, fontSize: 13.5, color: "var(--ink-2, #3d4e6a)",
                lineHeight: 1.75, whiteSpace: "pre-wrap",
                direction: "rtl", textAlign: "right",
              }}>
                {product.description}
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
