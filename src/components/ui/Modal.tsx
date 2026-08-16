"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  // Delay portal mount until client-side hydration
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into modal on open
  useEffect(() => {
    if (!open) return;
    // Small delay so the portal has committed to the DOM
    const t = requestAnimationFrame(() => { dialogRef.current?.focus(); });
    return () => cancelAnimationFrame(t);
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(28,37,54,.35)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Dialog card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="glass-drawer"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: wide ? 640 : 440,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          outline: "none",
          padding: 0,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500, color: danger ? "var(--red)" : "var(--ink)" }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ink-3)", lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 20px" }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: "16px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
