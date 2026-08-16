"use client";
import Modal from "./Modal";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
}

export default function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "Confirm", loading = false, danger = false }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} danger={danger} footer={<>
      <button className="pill outline" onClick={onClose}>Cancel</button>
      <button className={`pill ${danger ? "danger" : "dark"}`} onClick={onConfirm} disabled={loading}>
        {loading ? "Working…" : confirmLabel}
      </button>
    </>}>
      {body && <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0 }}>{body}</p>}
    </Modal>
  );
}
