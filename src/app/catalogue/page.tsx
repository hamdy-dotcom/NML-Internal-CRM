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
      width: "100%",
      background: "var(--wallpaper, #eef1f8)",
      backgroundAttachment: "fixed",
      position: "relative",
      boxSizing: "border-box",
    }}>
      {/* Background blobs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: -120, right: -80, width: 440, height: 440, borderRadius: "50%", background: "#ff9a5b", opacity: 0.28, filter: "blur(80px)" }} />
        <div style={{ position: "absolute", bottom: -140, left: -80, width: 480, height: 480, borderRadius: "50%", background: "#5b9bf5", opacity: 0.22, filter: "blur(90px)" }} />
      </div>

      {/* Page shell — full width, generous side padding */}
      <div style={{ position: "relative", zIndex: 1, width: "100%", boxSizing: "border-box", padding: "0 32px 56px" }}>

        {/* Header */}
        <div style={{ paddingTop: 28, paddingBottom: 24, marginBottom: 28, borderBottom: "1px solid rgba(255,255,255,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
              N
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8896aa", letterSpacing: ".08em", textTransform: "uppercase" }}>NML</span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#1c2536", margin: 0, letterSpacing: "-.02em" }}>
            Ready to Shelf Catalogue
          </h1>
          <p style={{ fontSize: 13.5, color: "#8896aa", margin: "6px 0 0" }}>
            Products curated and ready for shelf listing
          </p>
        </div>

        {/* Grid and controls — no extra wrapper, fills the padded space */}
        <CatalogueClient />
      </div>
    </div>
  );
}
