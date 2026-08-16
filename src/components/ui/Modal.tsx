"use client";
import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  danger?: boolean;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, footer, danger = false, wide = false }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(28,37,54,.35)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div
        className="glass-drawer"
        role="dialog"
        aria-modal="true"
        style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: wide ? 640 : 440, maxHeight: "90vh", overflowY: "auto", padding: 20 }}
      >
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: danger ? "var(--red)" : "var(--ink)" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ink-3)", lineHeight: 1 }}>×</button>
        </div>
        {/* Body */}
        {children}
        {/* Footer — button row with guaranteed 20px gap above */}
        {footer && (
          <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
