"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import Modal from "@/components/ui/Modal";
import type { ParsedProductRow } from "@/app/api/products/preview/route";

// ── Template ──────────────────────────────────────────────────────────────────

const TEMPLATE_HEADERS = [
  "Product name", "SKU", "Barcode", "Category", "Brand",
  "Merchant price", "NML cost", "Stock", "Product URL", "Image URL", "Notes",
];

const TEMPLATE_ROWS = [
  ["عطر الورد الداهي", "ATR-001", "6281234567890", "عطور", "صحاري", "349", "210", "85", "https://store.salla.sa/products/atr-001", "https://cdn.example.com/atr-001.jpg", ""],
  ["بخور القمر", "BKH-022", "6289876543210", "بخور وعود", "العنبر", "189", "95", "200", "https://store.salla.sa/products/bkh-022", "https://cdn.example.com/bkh-022.jpg", "صنف شائع"],
];

function csvEscape(v: string) {
  return v.includes(",") || v.includes('"') || v.includes("\n")
    ? `"${v.replace(/"/g, '""')}"` : v;
}

function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadTemplate() {
  const lines = [
    TEMPLATE_HEADERS.map(csvEscape).join(","),
    ...TEMPLATE_ROWS.map(r => r.map(csvEscape).join(",")),
  ];
  triggerCsvDownload("nml-po-template.csv", lines.join("\r\n"));
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewResponse {
  new: ParsedProductRow[];
  updates: ParsedProductRow[];
  invalid: { row: ParsedProductRow; reason: string }[];
}

interface ImportResult { imported: number; updated: number }

type FlatRow =
  | { kind: "new";     data: ParsedProductRow }
  | { kind: "update";  data: ParsedProductRow }
  | { kind: "invalid"; data: ParsedProductRow; reason: string };

function flattenPreview(p: PreviewResponse): FlatRow[] {
  return [
    ...p.new.map(d => ({ kind: "new" as const, data: d })),
    ...p.updates.map(d => ({ kind: "update" as const, data: d })),
    ...p.invalid.map(i => ({ kind: "invalid" as const, data: i.row, reason: i.reason })),
  ];
}

function downloadRejected(invalid: { row: ParsedProductRow; reason: string }[]) {
  if (!invalid.length) return;
  const keys = TEMPLATE_HEADERS;
  const header = [...keys, "Rejection reason"].map(csvEscape).join(",");
  const dataRows = invalid.map(({ row, reason }) => {
    const r = row._raw;
    return [...keys.map(k => csvEscape(r[k] ?? "")), csvEscape(reason)].join(",");
  });
  triggerCsvDownload("rejected-products.csv", [header, ...dataRows].join("\r\n"));
}

// ── Stepper (same look as leads import) ──────────────────────────────────────

const STEPS = ["Upload", "Preview", "Done"];

function Stepper({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11.5, fontWeight: 600, flexShrink: 0,
                background: done ? "var(--blue)" : active ? "var(--ink)" : "rgba(120,135,160,.18)",
                color: done || active ? "#fff" : "var(--ink-3)",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{
                fontSize: 11, marginTop: 4, whiteSpace: "nowrap",
                fontWeight: active ? 500 : 400,
                color: active ? "var(--ink)" : done ? "var(--blue)" : "var(--ink-4)",
              }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 6px", marginBottom: 16,
                background: done ? "var(--blue)" : "rgba(120,135,160,.18)",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  merchantId: string;
  merchantStage: string;
  onImportDone?: (imported: number, updated: number) => void;
}

export default function ProductImportModal({ open, onClose, merchantId, merchantStage, onImportDone }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);

  // Step 0
  const [file,       setFile]       = useState<File | null>(null);
  const [fileRows,   setFileRows]   = useState<Record<string, string>[]>([]);
  const [dragOver,   setDragOver]   = useState(false);
  const [parsing,    setParsing]    = useState(false);

  // Step 1
  const [preview,    setPreview]    = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Step 2
  const [progress,   setProgress]   = useState(0);
  const [result,     setResult]     = useState<ImportResult | null>(null);
  const [importing,  setImporting]  = useState(false);

  function reset() {
    setStep(0);
    setFile(null); setFileRows([]); setDragOver(false); setParsing(false);
    setPreview(null); setPreviewing(false);
    setProgress(0); setResult(null); setImporting(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  // ── File parsing ────────────────────────────────────────────────────────────

  async function parseFile(f: File) {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb  = XLSX.read(buf, { type: "array" });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
      if (raw.length < 2) { toast.error("File appears empty or has no data rows"); return; }
      const headers = raw[0].map(h => String(h).trim());
      const rows = raw.slice(1).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
        return obj;
      }).filter(r => Object.values(r).some(v => v !== ""));
      setFileRows(rows);
      setFile(f);
    } catch (e) {
      toast.error("Could not parse file. Check it is a valid CSV or XLSX.");
      console.error(e);
    } finally {
      setParsing(false);
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────────

  async function goToPreview() {
    setPreviewing(true);
    try {
      const resp = await fetch("/api/products/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, rows: fileRows }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as PreviewResponse;
      setPreview(data);
      setStep(1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function runImport() {
    setImporting(true);
    setProgress(0);
    setStep(2);
    try {
      const resp = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantId, merchantStage, rows: fileRows }),
      });
      if (!resp.body) throw new Error("No response body");
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as {
              progress?: number; total?: number;
              result?: ImportResult; error?: string;
            };
            if (msg.error) toast.error(msg.error);
            if (msg.progress !== undefined && msg.total) {
              setProgress(Math.round((msg.progress / msg.total) * 100));
            }
            if (msg.result) {
              setResult(msg.result);
              setProgress(100);
              onImportDone?.(msg.result.imported, msg.result.updated);
            }
          } catch { /* malformed line */ }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const allRows: FlatRow[] = preview ? flattenPreview(preview) : [];
  const importCount = preview ? preview.new.length + preview.updates.length : 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Modal open={open} onClose={handleClose} title="Upload PO" wide>
      <Stepper current={step} />

      {/* ── Step 0: Upload ──────────────────────────────────────────────────── */}
      {step === 0 && (
        <div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "var(--blue)" : "rgba(120,135,160,.3)"}`,
              borderRadius: 14, padding: "32px 20px", textAlign: "center", cursor: "pointer",
              background: dragOver ? "rgba(226,237,251,.5)" : "rgba(255,255,255,.5)",
              transition: "all 0.15s", marginBottom: 10,
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
            />
            {parsing ? (
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>Parsing…</p>
            ) : file ? (
              <>
                <div style={{ fontSize: 26, marginBottom: 6 }}>📄</div>
                <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--ink)", fontSize: 13 }}>{file.name}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-3)" }}>
                  {fileRows.length.toLocaleString("en-US")} rows
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: 28, marginBottom: 8 }}>☁</div>
                <p style={{ margin: "0 0 6px", fontWeight: 500, color: "var(--ink-2)", fontSize: 13 }}>Drag & drop a CSV or XLSX file here</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>or click to browse</p>
              </>
            )}
          </div>

          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <button
              type="button"
              onClick={downloadTemplate}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--blue)", textDecoration: "underline", padding: 0 }}
            >
              ↓ Download template
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="pill dark"
              disabled={!file || parsing || previewing}
              onClick={goToPreview}
            >
              {previewing ? "Loading preview…" : "Next → Preview"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Preview ─────────────────────────────────────────────────── */}
      {step === 1 && preview && (
        <div>
          {/* Count tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            <div className="stat-tile green">
              <div className="tile-key">New products</div>
              <div className="tile-value">{preview.new.length.toLocaleString("en-US")}</div>
            </div>
            <div className="stat-tile amber">
              <div className="tile-key">Updates (SKU match)</div>
              <div className="tile-value">{preview.updates.length.toLocaleString("en-US")}</div>
            </div>
            <div className="stat-tile red">
              <div className="tile-key">Rejected</div>
              <div className="tile-value">{preview.invalid.length.toLocaleString("en-US")}</div>
            </div>
          </div>

          {/* Row table */}
          <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,.6)", marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.95)", zIndex: 1 }}>
                <tr>
                  {["Name", "SKU", "Category", "Brand", "Price", "Stock", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "start", padding: "7px 10px", fontWeight: 400, fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", borderBottom: "1px solid rgba(120,135,160,.15)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((row, i) => {
                  const d = row.data;
                  const bg =
                    row.kind === "new"     ? "rgba(217,240,226,.45)" :
                    row.kind === "update"  ? "rgba(253,234,204,.55)" :
                                            "rgba(250,214,214,.45)";
                  const badge =
                    row.kind === "new" ? (
                      <span className="badge badge-green" style={{ fontSize: 10 }}>New</span>
                    ) : row.kind === "update" ? (
                      <span className="badge badge-amber" style={{ fontSize: 10 }}>Update</span>
                    ) : (
                      <span className="badge badge-red" style={{ fontSize: 10 }} title={row.reason}>{row.reason}</span>
                    );
                  return (
                    <tr key={i} style={{ background: bg }}>
                      <td style={{ padding: "5px 10px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.name}>{d.name || "—"}</td>
                      <td style={{ padding: "5px 10px", fontFamily: "var(--font-mono)", fontSize: 11, whiteSpace: "nowrap" }}>{d.sku || "—"}</td>
                      <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{d.category || "—"}</td>
                      <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{d.brand || "—"}</td>
                      <td style={{ padding: "5px 10px", textAlign: "end", fontFamily: "var(--font-mono)", fontSize: 11 }}>{d.price != null ? d.price.toLocaleString("en-US") : "—"}</td>
                      <td style={{ padding: "5px 10px", textAlign: "end", fontFamily: "var(--font-mono)", fontSize: 11 }}>{d.stock ?? "—"}</td>
                      <td style={{ padding: "5px 10px", whiteSpace: "nowrap" }}>{badge}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="pill outline" onClick={() => setStep(0)}>← Back</button>
              {preview.invalid.length > 0 && (
                <button className="pill ghost" style={{ fontSize: 12 }} onClick={() => downloadRejected(preview.invalid)}>
                  ↓ Download rejected ({preview.invalid.length})
                </button>
              )}
            </div>
            <button className="pill dark" disabled={importCount === 0} onClick={runImport}>
              Import {importCount.toLocaleString("en-US")} product{importCount !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Done ────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--ink-2)" }}>
            {importing ? "Importing products…" : "Import complete"}
          </p>
          <div style={{ height: 8, borderRadius: 99, background: "rgba(120,135,160,.15)", overflow: "hidden", marginBottom: 20 }}>
            <div style={{ height: "100%", borderRadius: 99, background: "var(--blue)", width: `${progress}%`, transition: "width 0.3s" }} />
          </div>
          {result && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24, textAlign: "left" }}>
                <div className="stat-tile green">
                  <div className="tile-key">Imported</div>
                  <div className="tile-value">{result.imported}</div>
                </div>
                <div className="stat-tile amber">
                  <div className="tile-key">Updated</div>
                  <div className="tile-value">{result.updated}</div>
                </div>
              </div>
              <button className="pill dark" onClick={handleClose}>Done</button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
