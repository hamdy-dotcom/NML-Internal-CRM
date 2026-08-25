import type { Metadata } from "next";
import CatalogueClient from "./CatalogueClient";

export const metadata: Metadata = {
  title: "NML Ready to Shelf Catalogue",
  description: "Browse NML-curated products ready for shelf listing",
};

export default function CataloguePage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--wallpaper, #f0f2f8)",
      backgroundAttachment: "fixed",
      position: "relative",
    }}>
      {/* Background blobs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -120, right: -80, width: 440, height: 440, borderRadius: "50%", background: "#ff9a5b", opacity: 0.28, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -80, width: 480, height: 480, borderRadius: "50%", background: "#5b9bf5", opacity: 0.22, filter: "blur(90px)" }} />
      </div>

      {/* Glass window */}
      <div style={{
        position: "relative", zIndex: 1,
        margin: "0 auto",
        maxWidth: 1400,
        padding: "24px 24px 48px",
        minHeight: "100vh",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 32, paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--nml-red, #dc2626)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700 }}>
              N
            </div>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-3, #8896aa)", letterSpacing: ".05em", textTransform: "uppercase" }}>NML</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "var(--ink, #1c2536)", margin: 0, letterSpacing: "-.01em" }}>
            Ready to Shelf Catalogue
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-3, #8896aa)", margin: "6px 0 0" }}>
            Products curated and ready for shelf listing
          </p>
        </div>

        {/* Content card */}
        <div style={{
          background: "rgba(255,255,255,.55)",
          border: "1px solid rgba(255,255,255,.8)",
          borderRadius: 20,
          boxShadow: "0 8px 32px rgba(40,60,110,.08), 0 1px 0 rgba(255,255,255,.9) inset",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "24px 24px 32px",
        }}>
          <CatalogueClient />
        </div>
      </div>
    </div>
  );
}
