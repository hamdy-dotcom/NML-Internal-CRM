"use client";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  side?: "right" | "left";
  width?: number;
}

export default function Drawer({ open, onClose, title, children, side = "right", width = 480 }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: "rgba(28,37,54,.25)", backdropFilter: "blur(2px)" }} onClick={onClose} />
      {/* Panel */}
      <div
        className="glass-drawer"
        style={{
          width,
          maxWidth: "100vw",
          height: "100%",
          overflowY: "auto",
          borderRadius: side === "right" ? "20px 0 0 20px" : "0 20px 20px 0",
          display: "flex",
          flexDirection: "column",
          [side === "right" ? "marginLeft" : "marginRight"]: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid var(--g-line)", flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ink-3)", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
