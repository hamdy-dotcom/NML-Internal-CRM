"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Modal from "@/components/ui/Modal";
import type { NormalizedProduct, RecentProduct, WalkProgress } from "@/lib/salla/types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id:               string;
  status:           "pending" | "running" | "done" | "error";
  store_id:         string | null;
  progress:         WalkProgress;
  fetched_products: NormalizedProduct[] | null;
  error:            string | null;
}

interface Props {
  merchant: { id: string; store_name: string; store_url: string };
  onClose:  () => void;
}

// ── Phase label ───────────────────────────────────────────────────────────────

function phaseLabel(p: WalkProgress): string {
  const { phase, categories_crawled, brands_crawled, products_found } = p;
  if (phase === "idle")                return "Starting…";
  if (phase === "latest")              return `Walking latest feed · ${products_found} found`;
  if (phase === "crawling-categories") return "Crawling category pages…";
  if (phase.startsWith("category:")) {
    const catId = phase.slice(9);
    const n = categories_crawled.length;
    return `Category ${catId} · ${n} walked · ${products_found} products`;
  }
  if (phase.startsWith("brand:")) {
    const brandId = phase.slice(6);
    const n = brands_crawled.length;
    return `Brand ${brandId} · ${n} walked · ${products_found} products`;
  }
  if (phase === "gallery") return `Fetching images for ${products_found} products…`;
  if (phase === "done")    return "Complete";
  return phase;
}

// ── Indeterminate progress bar ────────────────────────────────────────────────

const BAR_KF = `
  @keyframes salla-bar {
    0%   { transform: translateX(-200%); }
    100% { transform: translateX(600%);  }
  }
`;

function ProgressBar({ done }: { done: boolean }) {
  return (
    <>
      <style>{BAR_KF}</style>
      <div style={{
        height: 5, borderRadius: 99,
        background: "rgba(63,127,214,.18)",
        overflow: "hidden", marginBottom: 12, flexShrink: 0,
      }}>
        {done ? (
          <div style={{ height: "100%", width: "100%", background: "var(--blue)", borderRadius: 99 }} />
        ) : (
          <div style={{
            height: "100%", width: "38%",
            background: "linear-gradient(90deg,rgba(63,127,214,.35),var(--blue),rgba(63,127,214,.35))",
            borderRadius: 99,
            animation: "salla-bar 1.7s ease-in-out infinite",
          }} />
        )}
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FetchPopup({ merchant, onClose }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  type State = "creating" | "waiting" | "done" | "error";
  const [state,     setState]    = useState<State>("creating");
  const [job,       setJob]      = useState<Job | null>(null);
  const [products,  setProducts] = useState<NormalizedProduct[]>([]);
  const [selected,  setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported,  setImported] = useState<{ imported: number; updated: number } | null>(null);
  const [errorMsg,  setErrorMsg] = useState<string | null>(null);

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const jobIdRef     = useRef<string | null>(null);
  const completedRef = useRef(false);

  // ── Load full job on completion (fetched_products too large for Realtime) ──

  const loadCompletedJob = useCallback(async (jobId: string) => {
    if (completedRef.current) return;
    completedRef.current = true;

    const { data } = await supabase.from("salla_fetch_jobs")
      .select("id, status, store_id, progress, fetched_products, error")
      .eq("id", jobId)
      .single();

    if (!data) return;
    setJob(data as Job);
    const prods = (data.fetched_products ?? []) as NormalizedProduct[];
    setProducts(prods);
    setSelected(new Set(prods.map((p: NormalizedProduct) => p.salla_id)));
    setState("done");
  }, [supabase]);

  // ── Realtime subscription ─────────────────────────────────────────────────

  const subscribe = useCallback((jobId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const ch = supabase
      .channel(`salla-job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event:  "UPDATE",
          schema: "public",
          table:  "salla_fetch_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload: { new: Job }) => {
          const u = payload.new;
          setJob(prev => prev
            ? { ...prev, status: u.status, store_id: u.store_id, progress: u.progress, error: u.error }
            : null
          );
          if (u.status === "done")  loadCompletedJob(jobId);
          if (u.status === "error") setState("error");
        },
      )
      .subscribe((status: string, err?: Error) => {
        console.log("[salla-realtime] status:", status, err ?? "");
      });

    channelRef.current = ch;
  }, [supabase, loadCompletedJob]);

  // ── Polling fallback — 2 s while waiting ─────────────────────────────────

  useEffect(() => {
    if (state !== "waiting") return;
    const jobId = jobIdRef.current;
    if (!jobId) return;

    const iv = setInterval(async () => {
      const { data } = await supabase.from("salla_fetch_jobs")
        .select("id, status, store_id, progress, error")
        .eq("id", jobId)
        .single();

      if (!data) return;
      const j = data as Job;
      setJob(prev => prev
        ? { ...prev, status: j.status, store_id: j.store_id, progress: j.progress, error: j.error }
        : null
      );
      if (j.status === "done")  { clearInterval(iv); loadCompletedJob(jobId); }
      if (j.status === "error") { clearInterval(iv); setState("error"); }
    }, 2_000);

    return () => clearInterval(iv);
  }, [state, supabase, loadCompletedJob]);

  // ── Create job on mount ───────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function createJob() {
      try {
        const res = await fetch(`/api/merchants/${merchant.id}/fetch-products`, { method: "POST" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const { jobId } = (await res.json()) as { jobId: string };
        if (cancelled) return;

        jobIdRef.current = jobId;
        setJob({
          id: jobId, status: "pending", store_id: null,
          progress: {
            phase: "idle", products_found: 0, images_found: 0,
            request_count: 0, categories_crawled: [], brands_crawled: [],
          },
          fetched_products: null, error: null,
        });
        setState("waiting");
        subscribe(jobId);
      } catch (e) {
        if (!cancelled) { setState("error"); setErrorMsg((e as Error).message); }
      }
    }

    createJob();
    return () => {
      cancelled = true;
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant.id]);

  // ── Import ────────────────────────────────────────────────────────────────

  async function runImport() {
    if (!jobIdRef.current) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/merchants/${merchant.id}/fetch-products/import`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jobId: jobIdRef.current, selectedSallaIds: [...selected] }),
      });
      const data = await res.json() as { imported?: number; updated?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Import failed");
      setImported({ imported: data.imported ?? 0, updated: data.updated ?? 0 });
      toast.success(`${(data.imported ?? 0) + (data.updated ?? 0)} products saved`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // ── Progress view ─────────────────────────────────────────────────────────

  const progress = job?.progress ?? {
    phase: "idle", products_found: 0, images_found: 0,
    request_count: 0, categories_crawled: [], brands_crawled: [],
  };

  function renderProgress() {
    const done    = progress.phase === "done";
    const recents = (progress.recent_products ?? []) as RecentProduct[];

    return (
      // Flex column filling the Modal body (Modal body is flex:1 minHeight:0 overflowY:auto)
      <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingBottom: 14 }}>

        {/* Progress bar */}
        <ProgressBar done={done} />

        {/* Phase label */}
        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500, color: "var(--ink-2)", flexShrink: 0 }}>
          {phaseLabel(progress)}
        </p>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14, flexShrink: 0 }}>
          {([ ["Products", progress.products_found],
              ["Images",   progress.images_found],
              ["Requests", progress.request_count],
          ] as [string, number][]).map(([k, v]) => (
            <div key={k} className="stat-tile" style={{ textAlign: "center", padding: "10px 8px" }}>
              <div className="tile-value" style={{ fontSize: 20 }}>{v}</div>
              <div className="tile-key">{k}</div>
            </div>
          ))}
        </div>

        {/* Live product feed — fills remaining height */}
        <div style={{ flex: 1, minHeight: 160, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <p style={{
            margin: "0 0 5px", fontSize: 10.5, fontWeight: 600,
            color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: ".05em", flexShrink: 0,
          }}>
            Products found
          </p>
          <div style={{
            flex: 1, overflowY: "auto",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,.65)",
            background: "rgba(255,255,255,.55)",
          }}>
            {recents.length === 0 ? (
              <p style={{ margin: "16px 12px", fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>
                Waiting for first products…
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <tbody>
                  {[...recents].reverse().map((p, i) => (
                    <tr key={p.salla_id} style={{
                      borderBottom: i < recents.length - 1 ? "1px solid rgba(255,255,255,.6)" : undefined,
                      opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.04),
                    }}>
                      {/* Thumbnail */}
                      <td style={{ padding: "5px 8px", width: 36, flexShrink: 0 }}>
                        {p.image
                          ? <img src={p.image} alt="" width={28} height={28}
                              style={{ objectFit: "cover", borderRadius: 5, display: "block" }} />
                          : <div style={{ width: 28, height: 28, borderRadius: 5, background: "var(--g-panel)" }} />
                        }
                      </td>
                      {/* Name */}
                      <td style={{
                        padding: "5px 4px", maxWidth: 0, width: "99%",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        color: i === 0 ? "var(--ink)" : "var(--ink-2)",
                      }}>
                        {p.name}
                      </td>
                      {/* SKU */}
                      <td style={{
                        padding: "5px 6px", fontSize: 10.5,
                        color: "var(--ink-4)", whiteSpace: "nowrap",
                        fontFamily: "var(--font-mono)",
                      }}>
                        {p.sku ?? ""}
                      </td>
                      {/* Price */}
                      <td style={{
                        padding: "5px 8px", textAlign: "end",
                        fontFamily: "var(--font-mono)", fontSize: 11,
                        color: "var(--ink-3)", whiteSpace: "nowrap",
                      }}>
                        {p.price != null ? `${p.price.toLocaleString("en-US")} ${p.currency}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Meta line */}
        <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--ink-4)", flexShrink: 0 }}>
          {job?.store_id ? `Store ${job.store_id} · ` : ""}
          {progress.categories_crawled.length} categories · {progress.brands_crawled.length} brands
          {" · worker running in background"}
        </p>
      </div>
    );
  }

  // ── Preview (done) ────────────────────────────────────────────────────────

  function renderPreview() {
    const allSelected  = selected.size === products.length;
    const someSelected = !allSelected && selected.size > 0;

    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {([ ["Products", products.length, "green"],
              ["Selected", selected.size,   "blue"],
              ["Images",   progress.images_found, ""],
          ] as [string, number, string][]).map(([k, v, cls]) => (
            <div key={k} className={`stat-tile${cls ? ` ${cls}` : ""}`} style={{ textAlign: "center", padding: "10px 8px" }}>
              <div className="tile-value" style={{ fontSize: 20 }}>{v}</div>
              <div className="tile-key">{k}</div>
            </div>
          ))}
        </div>

        <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,.6)", marginBottom: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, background: "rgba(255,255,255,.96)", zIndex: 1 }}>
              <tr>
                <th style={{ padding: "6px 8px", textAlign: "center", fontWeight: 400, fontSize: 11, color: "var(--ink-3)", width: 32 }}>
                  <input type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={() => allSelected
                      ? setSelected(new Set())
                      : setSelected(new Set(products.map(p => p.salla_id)))}
                  />
                </th>
                {["Image","Name","SKU","Brand","Price","Stock","Images","Via"].map(h => (
                  <th key={h} style={{ padding: "6px 8px", textAlign: "start", fontWeight: 400, fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const sel = selected.has(p.salla_id);
                return (
                  <tr key={p.salla_id}
                    style={{ background: sel ? "rgba(226,237,251,.4)" : undefined, cursor: "pointer" }}
                    onClick={() => setSelected(prev => {
                      const n = new Set(prev);
                      if (n.has(p.salla_id)) n.delete(p.salla_id); else n.add(p.salla_id);
                      return n;
                    })}>
                    <td style={{ padding: "5px 8px", textAlign: "center" }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={sel}
                        onChange={() => setSelected(prev => {
                          const n = new Set(prev);
                          if (n.has(p.salla_id)) n.delete(p.salla_id); else n.add(p.salla_id);
                          return n;
                        })} />
                    </td>
                    <td style={{ padding: "5px 8px" }}>
                      {p.image
                        ? <img src={p.image} alt="" width={32} height={32} style={{ objectFit: "cover", borderRadius: 6, display: "block" }} />
                        : <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--g-panel)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>□</div>
                      }
                    </td>
                    <td style={{ padding: "5px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.name}>{p.name}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)", fontSize: 11 }}>{p.sku ?? "—"}</td>
                    <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>{p.brand ?? "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "end", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {p.price != null ? `${p.price.toLocaleString("en-US")} ${p.currency}` : "—"}
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>{p.in_stock ? "✓" : "—"}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", color: "var(--ink-3)" }}>{p.images.length || 1}</td>
                    <td style={{ padding: "5px 8px", fontSize: 10.5, color: "var(--ink-4)", whiteSpace: "nowrap" }}>{p.found_via}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ── Imported confirmation ─────────────────────────────────────────────────

  function renderImported() {
    if (!imported) return null;
    return (
      <div style={{ textAlign: "center", paddingTop: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20, textAlign: "left" }}>
          <div className="stat-tile green">
            <div className="tile-key">Imported</div>
            <div className="tile-value">{imported.imported}</div>
          </div>
          <div className="stat-tile amber">
            <div className="tile-key">Updated</div>
            <div className="tile-value">{imported.updated}</div>
          </div>
        </div>
        <button className="pill dark" onClick={onClose}>Done</button>
      </div>
    );
  }

  const footer = state === "done" && !imported ? (
    <>
      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{selected.size} of {products.length} selected</span>
      <button className="pill outline" onClick={onClose}>Cancel</button>
      <button className="pill dark" disabled={selected.size === 0 || importing} onClick={runImport}>
        {importing ? "Importing…" : `Import ${selected.size} product${selected.size !== 1 ? "s" : ""}`}
      </button>
    </>
  ) : state === "error" ? (
    <button className="pill outline" onClick={onClose}>Close</button>
  ) : undefined;

  return (
    <Modal open onClose={imported ? onClose : () => {}} title={`Fetch — ${merchant.store_name}`} wide footer={footer}>
      {state === "creating" && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>Connecting…</p>
      )}
      {state === "waiting" && renderProgress()}
      {state === "done"    && !imported && renderPreview()}
      {state === "done"    && imported  && renderImported()}
      {state === "error"   && (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--red)" }}>Fetch failed</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>{errorMsg ?? job?.error ?? "Unknown error"}</p>
        </div>
      )}
    </Modal>
  );
}
