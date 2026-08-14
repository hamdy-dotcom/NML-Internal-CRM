"use client";
import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import AssignDrawer from "../AssignDrawer";
import { undoBatch } from "./actions";
import type { LeadSource } from "@/lib/database.types";

// ── CRM target fields ──────────────────────────────────────────────────────────
const CRM_FIELDS: { value: string; label: string }[] = [
  { value: "store_name",    label: "Store name" },
  { value: "store_url",     label: "Store URL" },
  { value: "salla_store_id",label: "Salla store ID" },
  { value: "owner_name",    label: "Owner name" },
  { value: "phone",         label: "Phone" },
  { value: "whatsapp",      label: "WhatsApp" },
  { value: "email",         label: "Email" },
  { value: "city",          label: "City" },
  { value: "region",        label: "Region" },
  { value: "category",      label: "Category" },
  { value: "products_count",label: "Products count" },
  { value: "rating",        label: "Rating" },
  { value: "followers",     label: "Followers" },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: "salla_export", label: "Salla export" },
  { value: "manual",       label: "Manual" },
  { value: "referral",     label: "Referral" },
  { value: "inbound",      label: "Inbound" },
];

function guessField(header: string): string {
  const h = header.toLowerCase().replace(/[\s\-./]+/g, "_");
  for (const { value } of CRM_FIELDS) {
    const f = value.toLowerCase();
    if (h === f || h.includes(f) || f.includes(h)) return value;
  }
  return "";
}

// ── Template download ─────────────────────────────────────────────────────────
const TEMPLATE_HEADERS = CRM_FIELDS.map((f) => f.label);
const TEMPLATE_ROWS = [
  ["متجر الأناقة","https://elegant.salla.sa","12345678","محمد العمري","0512345678","0512345678","info@elegant.sa","الرياض","الرياض","أزياء","320","4.8","15200"],
  ["تقنية المستقبل","https://futuretech.salla.sa","87654321","سارة الأحمدي","0598765432","0598765432","hello@futuretech.sa","جدة","مكة المكرمة","إلكترونيات","85","4.5","8900"],
];

function csvEscape(v: string) {
  return v.includes(",") || v.includes('"') || v.includes("\n")
    ? `"${v.replace(/"/g, '""')}"` : v;
}

function downloadTemplate() {
  const lines = [TEMPLATE_HEADERS.map(csvEscape).join(","), ...TEMPLATE_ROWS.map(r => r.map(csvEscape).join(","))];
  triggerCsvDownload("nml-import-template.csv", lines.join("\r\n"));
}

function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Matched-on label ──────────────────────────────────────────────────────────
function fmtMatchedOn(m: string) {
  const MAP: Record<string, string> = {
    salla_store_id: "Salla ID", phone: "phone", whatsapp: "WhatsApp",
    store_url: "store URL", email: "email",
  };
  return MAP[m] ?? m.replace(/_/g, " ");
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Upload", "Preview", "Done"];

function Stepper({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < STEPS.length - 1 ? 1 : "none" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 600, flexShrink: 0, transition: "background 0.2s",
                background: done ? "var(--blue)" : active ? "var(--ink)" : "rgba(120,135,160,.18)",
                color: done || active ? "#fff" : "var(--ink-3)",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 11, marginTop: 5, whiteSpace: "nowrap", fontWeight: active ? 500 : 400,
                color: active ? "var(--ink)" : done ? "var(--blue)" : "var(--ink-4)" }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: "0 6px", marginBottom: 18, transition: "background 0.2s",
                background: done ? "var(--blue)" : "rgba(120,135,160,.18)" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PreviewResult {
  new: Record<string, string>[];
  duplicates: { row: Record<string, string>; matched_on: string; existing_merchant_id: string }[];
  invalid: { row: Record<string, string>; reason: string }[];
}

interface ImportResult {
  imported: number; skipped: number; errors: number; batchId: string;
}

type FlatRow =
  | { kind: "new";       data: Record<string, string> }
  | { kind: "duplicate"; data: Record<string, string>; matched_on: string; existing_merchant_id: string }
  | { kind: "rejected";  data: Record<string, string>; reason: string };

function flattenRows(result: PreviewResult): FlatRow[] {
  return [
    ...result.new.map(data => ({ kind: "new" as const, data })),
    ...result.duplicates.map(d => ({ kind: "duplicate" as const, data: d.row, matched_on: d.matched_on, existing_merchant_id: d.existing_merchant_id })),
    ...result.invalid.map(i => ({ kind: "rejected" as const, data: i.row, reason: i.reason })),
  ];
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // Step 0
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [source, setSource] = useState<LeadSource>("salla_export");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  // Column mapping
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});

  // Step 1
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "enrich">("skip");
  const [previewing, setPreviewing] = useState(false);
  const [repreviewing, setRepreviewing] = useState(false);

  // Step 2
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  // Assign drawer
  const [assignOpen, setAssignOpen] = useState(false);
  const [batchMerchantIds, setBatchMerchantIds] = useState<string[]>([]);
  const [assignCities, setAssignCities] = useState<string[]>([]);

  // ── File parsing ──────────────────────────────────────────────────────────
  async function parseFile(f: File) {
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as string[][];
      if (raw.length < 2) { toast.error("File appears empty or has no data rows"); return; }
      const headers = raw[0].map(h => String(h).trim());
      const rows = raw.slice(1).map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(row[i] ?? "").trim(); });
        return obj;
      });
      setFileHeaders(headers);
      setFileRows(rows);
      const guessed: Record<string, string> = {};
      headers.forEach(h => { const g = guessField(h); if (g) guessed[h] = g; });
      setColumnMap(guessed);
      setFile(f);
      if (!batchName) setBatchName(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      toast.error("Could not parse file. Check it is a valid CSV or XLSX.");
      console.error(e);
    } finally {
      setParsing(false);
    }
  }

  // ── API helpers ───────────────────────────────────────────────────────────
  async function doFetchPreview(rows: Record<string, string>[], map: Record<string, string>): Promise<PreviewResult> {
    const resp = await fetch("/api/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows, columnMap: map }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    return resp.json() as Promise<PreviewResult>;
  }

  async function goToPreview() {
    setPreviewing(true);
    try {
      const data = await doFetchPreview(fileRows, columnMap);
      setPreviewResult(data);
      setStep(1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleMappingChange(header: string, field: string) {
    const newMap = { ...columnMap, [header]: field };
    setColumnMap(newMap);
    setRepreviewing(true);
    try {
      const data = await doFetchPreview(fileRows, newMap);
      setPreviewResult(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Re-preview failed");
    } finally {
      setRepreviewing(false);
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async function runImport() {
    setImporting(true);
    setProgress(0);
    setStep(2);
    try {
      const resp = await fetch("/api/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchName, source, rows: fileRows, columnMap, duplicateHandling }),
      });
      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { progress?: number; total?: number; result?: ImportResult; error?: string };
            if (msg.error) toast.error(msg.error);
            if (msg.progress !== undefined && msg.total) setProgress(Math.round((msg.progress / msg.total) * 100));
            if (msg.result) { setImportResult(msg.result); setProgress(100); }
          } catch { /* malformed line */ }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function openAssignForBatch() {
    if (!importResult) return;
    const supabase = createClient();
    const { data } = await supabase.from("merchants").select("id, city").eq("batch_id", importResult.batchId).eq("stage", "new");
    setBatchMerchantIds((data ?? []).map(m => m.id));
    setAssignCities(Array.from(new Set((data ?? []).map(m => m.city).filter(Boolean) as string[])));
    setAssignOpen(true);
  }

  function handleUndo() {
    if (!importResult) return;
    startTransition(async () => {
      try {
        await undoBatch(importResult.batchId);
        toast.success("Batch undone — untouched leads removed");
        router.push("/leads");
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Undo failed");
      }
    });
  }

  // ── Derived state (step 1) ────────────────────────────────────────────────
  const unmappedHeaders = fileHeaders.filter(h => !columnMap[h]);
  const allRows: FlatRow[] = previewResult ? flattenRows(previewResult) : [];
  const importCount = previewResult
    ? (duplicateHandling === "skip" ? previewResult.new.length : previewResult.new.length + previewResult.duplicates.length)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 0", maxWidth: 900, margin: "0 auto" }}>
      <Link href="/leads" style={{ fontSize: 12.5, color: "var(--ink-3)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 18 }}>
        ← Back to leads
      </Link>

      <div className="glass-card" style={{ padding: "24px 28px" }}>
        <Stepper current={step} />

        {/* ── Step 0: Upload ─────────────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <h2 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 500 }}>Upload file</h2>

            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f); }}
              onClick={() => document.getElementById("file-input")?.click()}
              style={{
                border: `2px dashed ${dragOver ? "var(--blue)" : "rgba(120,135,160,.3)"}`,
                borderRadius: 14, padding: "36px 24px", textAlign: "center", cursor: "pointer",
                background: dragOver ? "rgba(226,237,251,.5)" : "rgba(255,255,255,.5)",
                transition: "all 0.15s", marginBottom: 10,
              }}
            >
              <input id="file-input" type="file" accept=".csv,.xlsx,.xls" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
              {parsing ? (
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>Parsing…</p>
              ) : file ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--ink)" }}>{file.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>
                    {fileRows.length.toLocaleString("en-US")} rows · {fileHeaders.length} columns
                    {unmappedHeaders.length > 0 && ` · ${unmappedHeaders.length} column${unmappedHeaders.length > 1 ? "s" : ""} unrecognised`}
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>☁</div>
                  <p style={{ margin: "0 0 6px", fontWeight: 500, color: "var(--ink-2)" }}>Drag & drop a CSV or XLSX file here</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>or click to browse</p>
                </>
              )}
            </div>

            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <button type="button" onClick={downloadTemplate}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--blue)", textDecoration: "underline", padding: 0 }}>
                ↓ Download template
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Batch name</label>
                <input className="field" value={batchName} onChange={e => setBatchName(e.target.value)} placeholder="e.g. Riyadh Fashion July 2025" />
              </div>
              <div style={{ width: 180 }}>
                <label className="field-label">Source</label>
                <select className="field" value={source} onChange={e => setSource(e.target.value as LeadSource)}>
                  {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="pill dark" disabled={!file || !batchName || parsing || previewing} onClick={goToPreview}>
                {previewing ? "Loading preview…" : "Next → Preview"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Preview ────────────────────────────────────────────── */}
        {step === 1 && previewResult && (
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Preview</h2>
              {repreviewing && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Refreshing…</span>}
            </div>

            {/* Unrecognised columns */}
            {unmappedHeaders.length > 0 && (
              <div style={{ background: "rgba(253,234,204,.5)", border: "1px solid rgba(138,90,16,.2)", borderRadius: 12, padding: "12px 16px", marginBottom: 18 }}>
                <p style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 500, color: "var(--amber)" }}>
                  {unmappedHeaders.length} column{unmappedHeaders.length > 1 ? "s" : ""} not recognised — map them or leave unmapped
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {unmappedHeaders.map(h => (
                    <div key={h} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "0 10px", alignItems: "center" }}>
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, background: "rgba(255,255,255,.7)", padding: "4px 8px", borderRadius: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h}</span>
                      <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
                      <select className="field" style={{ fontSize: 12.5 }} value={columnMap[h] ?? ""} onChange={e => handleMappingChange(h, e.target.value)}>
                        <option value="">Leave unmapped</option>
                        {CRM_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Count tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
              <div className="stat-tile green">
                <div className="tile-key">Will import</div>
                <div className="tile-value">{previewResult.new.length.toLocaleString("en-US")}</div>
              </div>
              <div className="stat-tile amber">
                <div className="tile-key">Duplicates</div>
                <div className="tile-value">{previewResult.duplicates.length.toLocaleString("en-US")}</div>
              </div>
              <div className="stat-tile red">
                <div className="tile-key">Rejected</div>
                <div className="tile-value">{previewResult.invalid.length.toLocaleString("en-US")}</div>
              </div>
            </div>

            {/* Duplicate handling */}
            <div style={{ marginBottom: 18 }}>
              <label className="field-label">Handle duplicates</label>
              <div style={{ display: "flex", gap: 10 }}>
                {(["skip", "enrich"] as const).map(v => (
                  <label key={v} style={{
                    display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
                    padding: "7px 13px", borderRadius: 10, fontSize: 13, transition: "all 0.12s",
                    background: duplicateHandling === v ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.5)",
                    border: `1px solid ${duplicateHandling === v ? "var(--blue)" : "transparent"}`,
                  }}>
                    <input type="radio" name="dup" value={v} checked={duplicateHandling === v}
                      onChange={() => setDuplicateHandling(v)} style={{ accentColor: "var(--blue)" }} />
                    {v === "skip" ? "Skip duplicates" : "Fill blanks only"}
                  </label>
                ))}
              </div>
            </div>

            {/* Row preview table */}
            <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,.6)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.95)", zIndex: 1 }}>
                  <tr>
                    {["Store name","Store URL","Phone","City","Category","SKUs","Status"].map(h => (
                      <th key={h} style={{ textAlign: "start", padding: "8px 10px", fontWeight: 400, fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", borderBottom: "1px solid rgba(120,135,160,.15)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row, i) => {
                    const d = row.data;
                    const rowBg = row.kind === "new"
                      ? "rgba(217,240,226,.45)"
                      : row.kind === "duplicate"
                        ? "rgba(253,234,204,.55)"
                        : "rgba(250,214,214,.45)";
                    const statusEl = row.kind === "new"
                      ? <span className="badge badge-green" style={{ fontSize: 10 }}>New</span>
                      : row.kind === "duplicate"
                        ? <span className="badge badge-amber" style={{ fontSize: 10 }} title={`Duplicate — ${fmtMatchedOn(row.matched_on)}`}>
                            Dup · {fmtMatchedOn(row.matched_on)}
                          </span>
                        : <span className="badge badge-red" style={{ fontSize: 10 }} title={row.reason}>
                            {row.reason}
                          </span>;
                    return (
                      <tr key={i} style={{ background: rowBg }}>
                        <td style={{ padding: "6px 10px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.store_name}>{d.store_name || "—"}</td>
                        <td style={{ padding: "6px 10px", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {d.store_url ? <a href={d.store_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none", fontSize: 12 }}>{d.store_url.replace(/^https?:\/\//, "")}</a> : "—"}
                        </td>
                        <td style={{ padding: "6px 10px", fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, whiteSpace: "nowrap" }}>{d.phone || "—"}</td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{d.city || "—"}</td>
                        <td style={{ padding: "6px 10px", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.category || "—"}</td>
                        <td style={{ padding: "6px 10px", textAlign: "end", fontFamily: "JetBrains Mono, monospace", fontSize: 11.5 }}>{d.products_count || "—"}</td>
                        <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>{statusEl}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pill outline" onClick={() => setStep(0)}>← Back</button>
                {previewResult.invalid.length > 0 && (
                  <button className="pill ghost" style={{ fontSize: 12 }} onClick={() => downloadRejected(previewResult.invalid)}>
                    ↓ Download rejected ({previewResult.invalid.length})
                  </button>
                )}
              </div>
              <button
                className="pill dark"
                disabled={importCount === 0}
                onClick={runImport}
              >
                Import {importCount.toLocaleString("en-US")} lead{importCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Done ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 15, fontWeight: 500 }}>
              {importing ? "Importing…" : "Import complete"}
            </h2>
            <div style={{ height: 8, borderRadius: 99, background: "rgba(120,135,160,.15)", overflow: "hidden", marginBottom: 24 }}>
              <div style={{ height: "100%", borderRadius: 99, background: "var(--blue)", width: `${progress}%`, transition: "width 0.3s" }} />
            </div>
            {importResult && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 28, textAlign: "left" }}>
                  <div className="stat-tile green"><div className="tile-key">Imported</div><div className="tile-value">{importResult.imported}</div></div>
                  <div className="stat-tile amber"><div className="tile-key">Skipped</div><div className="tile-value">{importResult.skipped}</div></div>
                  <div className="stat-tile red"><div className="tile-key">Errors</div><div className="tile-value">{importResult.errors}</div></div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                  <button className="pill dark" onClick={openAssignForBatch}>Assign these leads</button>
                  <button className="pill outline" disabled={isPending} onClick={handleUndo}>
                    {isPending ? "Undoing…" : "Undo this batch"}
                  </button>
                  <Link href="/leads" className="pill ghost">View in pool</Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <AssignDrawer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        merchantIds={batchMerchantIds}
        cities={assignCities}
        onSuccess={() => { setAssignOpen(false); router.push("/leads"); }}
      />
    </div>
  );
}

function downloadRejected(invalid: { row: Record<string, string>; reason: string }[]) {
  if (!invalid.length) return;
  const headers = [...Object.keys(invalid[0].row), "rejection_reason"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...invalid.map(r => [...Object.values(r.row).map(v => csvEscape(String(v))), csvEscape(r.reason)].join(",")),
  ];
  triggerCsvDownload("rejected-rows.csv", lines.join("\r\n"));
}
