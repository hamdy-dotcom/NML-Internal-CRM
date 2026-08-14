"use client";
import { useState, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import AssignDrawer from "../AssignDrawer";
import { undoBatch } from "./actions";
import type { LeadSource } from "@/lib/database.types";

// ── CRM target fields ──────────────────────────────────────────────────────────
const CRM_FIELDS: { value: string; label: string }[] = [
  { value: "store_name", label: "Store name" },
  { value: "store_url", label: "Store URL" },
  { value: "salla_store_id", label: "Salla store ID" },
  { value: "owner_name", label: "Owner name" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "city", label: "City" },
  { value: "region", label: "Region" },
  { value: "category", label: "Category" },
  { value: "products_count", label: "Products count" },
  { value: "rating", label: "Rating" },
  { value: "followers", label: "Followers" },
];

const SOURCES: { value: LeadSource; label: string }[] = [
  { value: "salla_export", label: "Salla export" },
  { value: "manual", label: "Manual" },
  { value: "referral", label: "Referral" },
  { value: "inbound", label: "Inbound" },
];

function guessField(header: string): string {
  const h = header.toLowerCase().replace(/[\s\-./]+/g, "_");
  for (const { value } of CRM_FIELDS) {
    const f = value.toLowerCase();
    if (h === f || h.includes(f) || f.includes(h)) return value;
  }
  return "";
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = ["Upload", "Map columns", "Clean & dedupe", "Done"];

function Stepper({ current }: { current: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: 28,
        gap: 0,
      }}
    >
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              flex: i < STEPS.length - 1 ? 1 : "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                  background: done
                    ? "var(--blue)"
                    : active
                      ? "var(--ink)"
                      : "rgba(120,135,160,.18)",
                  color: done || active ? "#fff" : "var(--ink-3)",
                  flexShrink: 0,
                  transition: "background 0.2s",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                style={{
                  fontSize: 11,
                  marginTop: 5,
                  color: active ? "var(--ink)" : done ? "var(--blue)" : "var(--ink-4)",
                  fontWeight: active ? 500 : 400,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: 2,
                  background: done ? "var(--blue)" : "rgba(120,135,160,.18)",
                  margin: "0 6px",
                  marginBottom: 18,
                  transition: "background 0.2s",
                }}
              />
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
  imported: number;
  skipped: number;
  errors: number;
  batchId: string;
}

// ── Main wizard ───────────────────────────────────────────────────────────────
export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const dropRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  // Step 1
  const [file, setFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState("");
  const [source, setSource] = useState<LeadSource>("salla_export");
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileRows, setFileRows] = useState<Record<string, string>[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);

  // Step 2
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});

  // Step 3
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "enrich">("skip");
  const [previewing, setPreviewing] = useState(false);

  // Step 4
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  // Assign drawer (step 4)
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
      if (raw.length < 2) {
        toast.error("File appears empty or has no data rows");
        return;
      }
      const headers = raw[0].map((h) => String(h).trim());
      const rows = raw.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = String(row[i] ?? "").trim();
        });
        return obj;
      });
      setFileHeaders(headers);
      setFileRows(rows);
      // Auto-guess mapping
      const guessed: Record<string, string> = {};
      headers.forEach((h) => {
        const g = guessField(h);
        if (g) guessed[h] = g;
      });
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

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) parseFile(f);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) parseFile(f);
  }

  // ── Step 2 → 3: fetch preview ─────────────────────────────────────────────
  async function fetchPreview() {
    setPreviewing(true);
    try {
      const resp = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: fileRows, columnMap }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as PreviewResult;
      setPreviewResult(data);
      setStep(2);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  // ── Step 3 → 4: run import ────────────────────────────────────────────────
  async function runImport() {
    setImporting(true);
    setProgress(0);
    setStep(3);
    try {
      const resp = await fetch("/api/import/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchName,
          source,
          rows: fileRows,
          columnMap,
          duplicateHandling,
        }),
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
            const msg = JSON.parse(line) as {
              progress?: number;
              total?: number;
              result?: ImportResult;
              error?: string;
            };
            if (msg.error) {
              toast.error(msg.error);
            }
            if (msg.progress !== undefined && msg.total) {
              setProgress(Math.round((msg.progress / msg.total) * 100));
            }
            if (msg.result) {
              setImportResult(msg.result);
              setProgress(100);
            }
          } catch {
            // malformed line, skip
          }
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Open assign drawer for this batch ─────────────────────────────────────
  async function openAssignForBatch() {
    if (!importResult) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("merchants")
      .select("id, city")
      .eq("batch_id", importResult.batchId)
      .eq("stage", "new");
    const ids = (data ?? []).map((m) => m.id);
    const cs = Array.from(new Set((data ?? []).map((m) => m.city).filter(Boolean) as string[]));
    setBatchMerchantIds(ids);
    setAssignCities(cs);
    setAssignOpen(true);
  }

  // ── Undo batch ────────────────────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 0", maxWidth: 720, margin: "0 auto" }}>
      {/* Back link */}
      <Link
        href="/leads"
        style={{
          fontSize: 12.5,
          color: "var(--ink-3)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 18,
        }}
      >
        ← Back to leads
      </Link>

      <div className="glass-card" style={{ padding: "24px 28px" }}>
        <Stepper current={step} />

        {/* ── Step 0: Upload ── */}
        {step === 0 && (
          <div>
            <h2 style={{ margin: "0 0 18px", fontSize: 15, fontWeight: 500 }}>
              Upload file
            </h2>

            {/* Drop zone */}
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              style={{
                border: `2px dashed ${dragOver ? "var(--blue)" : "rgba(120,135,160,.3)"}`,
                borderRadius: 14,
                padding: "36px 24px",
                textAlign: "center",
                cursor: "pointer",
                background: dragOver
                  ? "rgba(226,237,251,.5)"
                  : "rgba(255,255,255,.5)",
                transition: "all 0.15s",
                marginBottom: 18,
              }}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                style={{ display: "none" }}
                onChange={handleFileInput}
              />
              {parsing ? (
                <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>
                  Parsing…
                </p>
              ) : file ? (
                <>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
                  <p style={{ margin: "0 0 4px", fontWeight: 500, color: "var(--ink)" }}>
                    {file.name}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)" }}>
                    {fileRows.length.toLocaleString("en-US")} rows · {fileHeaders.length} columns
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>☁</div>
                  <p style={{ margin: "0 0 6px", fontWeight: 500, color: "var(--ink-2)" }}>
                    Drag & drop a CSV or XLSX file here
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>
                    or click to browse
                  </p>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label className="field-label">Batch name</label>
                <input
                  className="field"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. Riyadh Fashion July 2025"
                />
              </div>
              <div style={{ width: 180 }}>
                <label className="field-label">Source</label>
                <select
                  className="field"
                  value={source}
                  onChange={(e) => setSource(e.target.value as LeadSource)}
                >
                  {SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="pill dark"
                disabled={!file || !batchName || parsing}
                onClick={() => setStep(1)}
              >
                Next → Map columns
              </button>
            </div>
          </div>
        )}

        {/* ── Step 1: Map columns ── */}
        {step === 1 && (
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500 }}>
              Map columns
            </h2>
            <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "var(--ink-3)" }}>
              Match your file&apos;s columns to CRM fields. Unmapped columns are preserved in raw data.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr auto",
                gap: "8px 12px",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <span className="field-label" style={{ marginBottom: 0 }}>File column</span>
              <span />
              <span className="field-label" style={{ marginBottom: 0 }}>CRM field</span>
              <span className="field-label" style={{ marginBottom: 0 }}>Sample</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {fileHeaders.map((h) => {
                const sample = fileRows[0]?.[h] ?? "";
                return (
                  <div
                    key={h}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto 1fr auto",
                      gap: "0 12px",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        color: "var(--ink)",
                        fontFamily: "JetBrains Mono, monospace",
                        background: "rgba(120,135,160,.08)",
                        padding: "5px 10px",
                        borderRadius: 8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </span>
                    <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
                    <select
                      className="field"
                      value={columnMap[h] ?? ""}
                      onChange={(e) =>
                        setColumnMap((prev) => ({ ...prev, [h]: e.target.value }))
                      }
                      style={{ fontSize: 12.5 }}
                    >
                      <option value="">Keep in raw data</option>
                      {CRM_FIELDS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--ink-3)",
                        maxWidth: 100,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={sample}
                    >
                      {sample || "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 22 }}>
              <button className="pill outline" onClick={() => setStep(0)}>
                ← Back
              </button>
              <button
                className="pill dark"
                disabled={previewing}
                onClick={fetchPreview}
              >
                {previewing ? "Checking…" : "Next → Preview"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Clean & dedupe ── */}
        {step === 2 && previewResult && (
          <div>
            <h2 style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 500 }}>
              Clean & dedupe
            </h2>

            {/* Summary cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
              <div className="stat-tile green">
                <div className="tile-key">New</div>
                <div className="tile-value">{previewResult.new.length}</div>
              </div>
              <div className="stat-tile amber">
                <div className="tile-key">Duplicates</div>
                <div className="tile-value">{previewResult.duplicates.length}</div>
              </div>
              <div className="stat-tile red">
                <div className="tile-key">Invalid</div>
                <div className="tile-value">{previewResult.invalid.length}</div>
              </div>
            </div>

            {/* Duplicate handling */}
            <div style={{ marginBottom: 20 }}>
              <label className="field-label">Handle duplicates</label>
              <div style={{ display: "flex", gap: 10 }}>
                {(["skip", "enrich"] as const).map((v) => (
                  <label
                    key={v}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      cursor: "pointer",
                      padding: "8px 14px",
                      borderRadius: 10,
                      background:
                        duplicateHandling === v
                          ? "rgba(255,255,255,.9)"
                          : "rgba(255,255,255,.5)",
                      border: `1px solid ${duplicateHandling === v ? "var(--blue)" : "transparent"}`,
                      fontSize: 13,
                      transition: "all 0.12s",
                    }}
                  >
                    <input
                      type="radio"
                      name="dup"
                      value={v}
                      checked={duplicateHandling === v}
                      onChange={() => setDuplicateHandling(v)}
                      style={{ accentColor: "var(--blue)" }}
                    />
                    {v === "skip" ? "Skip duplicates" : "Enrich existing (fill empty fields only)"}
                  </label>
                ))}
              </div>
            </div>

            {/* Duplicates table */}
            {previewResult.duplicates.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p className="field-label">Duplicates matched on</p>
                <div style={{ overflowX: "auto", maxHeight: 200 }}>
                  <table className="nml-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Store name</th>
                        <th>Matched on</th>
                        <th>Existing ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.duplicates.slice(0, 20).map((d, i) => (
                        <tr key={i}>
                          <td>{d.row.store_name || d.row[fileHeaders[0]] || "—"}</td>
                          <td>
                            <span className="badge badge-amber">{d.matched_on}</span>
                          </td>
                          <td className="mono">{d.existing_merchant_id.slice(0, 8)}…</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Invalid table */}
            {previewResult.invalid.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p className="field-label">Invalid rows (will be skipped)</p>
                <div style={{ overflowX: "auto", maxHeight: 160 }}>
                  <table className="nml-table" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewResult.invalid.slice(0, 10).map((d, i) => (
                        <tr key={i} className="warn">
                          <td>{d.row.store_name || d.row[fileHeaders[0]] || `Row ${i + 1}`}</td>
                          <td style={{ color: "var(--red)" }}>{d.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="pill outline" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className="pill dark"
                disabled={previewResult.new.length === 0 && duplicateHandling === "skip"}
                onClick={runImport}
              >
                Import{" "}
                {(duplicateHandling === "skip"
                  ? previewResult.new.length
                  : previewResult.new.length + previewResult.duplicates.length
                ).toLocaleString("en-US")}{" "}
                leads
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {step === 3 && (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 15, fontWeight: 500 }}>
              {importing ? "Importing…" : "Import complete"}
            </h2>

            {/* Progress bar */}
            <div
              style={{
                height: 8,
                borderRadius: 99,
                background: "rgba(120,135,160,.15)",
                overflow: "hidden",
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 99,
                  background: "var(--blue)",
                  width: `${progress}%`,
                  transition: "width 0.3s",
                }}
              />
            </div>

            {importResult && (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10,
                    marginBottom: 28,
                    textAlign: "left",
                  }}
                >
                  <div className="stat-tile green">
                    <div className="tile-key">Imported</div>
                    <div className="tile-value">{importResult.imported}</div>
                  </div>
                  <div className="stat-tile amber">
                    <div className="tile-key">Skipped</div>
                    <div className="tile-value">{importResult.skipped}</div>
                  </div>
                  <div className="stat-tile red">
                    <div className="tile-key">Errors</div>
                    <div className="tile-value">{importResult.errors}</div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    justifyContent: "center",
                  }}
                >
                  <button className="pill dark" onClick={openAssignForBatch}>
                    Assign these leads
                  </button>
                  <button
                    className="pill outline"
                    disabled={isPending}
                    onClick={handleUndo}
                  >
                    {isPending ? "Undoing…" : "Undo this batch"}
                  </button>
                  <Link href="/leads" className="pill ghost">
                    View in pool
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Assign drawer */}
      <AssignDrawer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        merchantIds={batchMerchantIds}
        cities={assignCities}
        onSuccess={() => {
          setAssignOpen(false);
          router.push("/leads");
        }}
      />
    </div>
  );
}
