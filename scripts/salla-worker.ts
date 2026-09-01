/**
 * Salla fetch worker — standalone Node.js 18+ script.
 *
 * Runs outside Next.js. Polls salla_fetch_jobs for pending work, processes
 * each job sequentially (brief §5: never parallelize stores), writes
 * progress to Supabase Realtime, and stores fetched_products on completion.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/salla-worker.ts
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypasses RLS)
 *
 * Deployment options (decide with the team before wiring):
 *   A) Cron job on any Linux server (e.g. Railway, Render, EC2)
 *   B) Supabase Edge Function on a pg_cron schedule
 *   C) GitHub Actions workflow_dispatch + schedule
 *   D) Vercel Cron (only viable for stores < ~200 products; brief §5)
 *
 * For multiple workers, replace the optimistic claim below with a
 * `claim_next_salla_job()` Postgres function using FOR UPDATE SKIP LOCKED.
 */

import { createClient } from "@supabase/supabase-js";
import { resolveStore } from "../src/lib/salla/resolver";
import { walkStore }    from "../src/lib/salla/walker";
import { enrichWithGallery } from "../src/lib/salla/gallery";
import { importProducts } from "../src/lib/salla/importProducts";
import type { WalkProgress, NormalizedProduct } from "../src/lib/salla/types";
import type { WalkOpts } from "../src/lib/salla/walker";
import { HttpError } from "../src/lib/salla/walker";

// ── Supabase client (service role) ────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function setJobStatus(
  jobId:  string,
  status: "running" | "done" | "error",
  extra:  Record<string, unknown> = {},
) {
  const { error } = await db
    .from("salla_fetch_jobs")
    .update({ status, ...extra })
    .eq("id", jobId);
  if (error) console.error(`[${jobId}] status update failed:`, error.message);
}

async function updateProgress(jobId: string, progress: WalkProgress) {
  const { error } = await db
    .from("salla_fetch_jobs")
    .update({ progress })
    .eq("id", jobId);
  if (error) console.error(`[${jobId}] progress update failed:`, error.message);
}

// ── Resume checkpoint ────────────────────────────────────────────────────────

interface ResumeCheckpoint {
  walkedCatIds:   string[];
  walkedBrandIds: number[];
  knownProducts:  NormalizedProduct[];
}

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(
  job: { id: string; store_url: string; merchant_id: string; auto_import: boolean },
  resume?: ResumeCheckpoint,
): Promise<void> {
  const { id: jobId, store_url: storeUrl } = job;
  if (resume) {
    console.log(`[${jobId}] Resuming ${storeUrl} — ${resume.knownProducts.length} products already fetched, ${resume.walkedCatIds.length} categories walked`);
  } else {
    console.log(`[${jobId}] Processing ${storeUrl}`);
  }

  await setJobStatus(jobId, "running", { store_id: null });

  // Step 1: resolve store ID
  const resolved = await resolveStore(storeUrl);
  if (!resolved) {
    // Could not find a store ID even after the custom-domain fallback.
    // Mark as error so the team can investigate the URL.
    await setJobStatus(jobId, "error", {
      error: `Could not resolve Salla store ID from ${storeUrl}. ` +
             `The store may use a custom domain — verify the URL or add the store-identifier manually.`,
    });
    return;
  }

  const { storeId, categoryUrls } = resolved;
  await db.from("salla_fetch_jobs").update({ store_id: storeId }).eq("id", jobId);
  console.log(`[${jobId}] Resolved store ID: ${storeId}, ${categoryUrls.length} category URLs`);

  // Progress callback — throttled to every 500 ms OR ≥25 new products
  let lastProgressSave = 0;
  let lastSavedCount   = 0;
  const onProgress = async (p: WalkProgress) => {
    const now         = Date.now();
    const newProducts = p.products_found - lastSavedCount;
    if (now - lastProgressSave < 500 && newProducts < 25) return;
    lastProgressSave = now;
    lastSavedCount   = p.products_found;
    await updateProgress(jobId, p);

    // Structured log: show category X/N during category sweep, plain phase otherwise
    if (p.category_index != null && p.category_total != null && p.category_total > 0) {
      console.log(`[${jobId}] category ${p.category_index}/${p.category_total} · ${p.products_found.toLocaleString()} products · ${p.request_count.toLocaleString()} requests`);
    } else {
      console.log(`[${jobId}] ${p.phase} — ${p.products_found.toLocaleString()} products, ${p.request_count.toLocaleString()} requests`);
    }

    if (p.stop_reason) {
      console.log(`[${jobId}] Category sweep stopped early: ${p.stop_reason}`);
    }
  };

  // Incremental flush — write fetched_products every 2000 new products
  // so a crash or Ctrl+C doesn't lose hours of work.
  const onFlush = async (snapshot: NormalizedProduct[]) => {
    const { error } = await db
      .from("salla_fetch_jobs")
      .update({ fetched_products: snapshot })
      .eq("id", jobId);
    if (error) {
      console.error(`[${jobId}] Incremental flush failed:`, error.message);
    } else {
      console.log(`[${jobId}] Incremental flush — ${snapshot.length.toLocaleString()} products persisted`);
    }
  };

  // Step 2: walk the catalog
  let products: NormalizedProduct[];
  let walkProgress: WalkProgress | undefined;
  const captureProgress = async (p: WalkProgress) => {
    walkProgress = p;
    await onProgress(p);
  };

  try {
    const walkOpts: WalkOpts = { onFlush };
    if (resume) {
      walkOpts.resume = {
        walkedCatIds:   resume.walkedCatIds,
        walkedBrandIds: resume.walkedBrandIds,
        knownProducts:  resume.knownProducts,
      };
    }
    products = await walkStore(storeId, categoryUrls, captureProgress, walkOpts);
  } catch (e) {
    if (e instanceof HttpError && e.status === 410) {
      // Store is gone — mark done (not error) so it isn't requeued.
      console.warn(`[${jobId}] Store returned 410 Gone — marking done with 0 products`);
      await setJobStatus(jobId, "done", {
        fetched_products: [],
        progress: { phase: "done", products_found: 0, images_found: 0, request_count: 0,
                    categories_crawled: [], brands_crawled: [],
                    stop_reason: "Store returned HTTP 410 Gone — store no longer exists" },
      });
      return;
    }
    // Any other walk failure (422 exhausted on first request, network error, etc.)
    const msg = e instanceof Error ? e.message : "Walk failed";
    await setJobStatus(jobId, "error", { error: msg });
    console.error(`[${jobId}] Walk error:`, msg);
    return;
  }

  const partialReason = walkProgress?.stop_reason;
  console.log(`[${jobId}] Walk ${partialReason ? "partial" : "complete"} — ${products.length} products${partialReason ? ` (${partialReason})` : ""}`);

  // Step 3: gallery pass
  // Carry category coverage from the walk into the final progress so it's
  // visible after the job completes, not only while it was running.
  const finalProgress: WalkProgress = {
    phase:              "gallery",
    products_found:     products.length,
    images_found:       0,
    request_count:      walkProgress?.request_count ?? 0,
    categories_crawled: walkProgress?.categories_crawled ?? [],
    brands_crawled:     walkProgress?.brands_crawled ?? [],
    category_index:     walkProgress?.category_index,
    category_total:     walkProgress?.category_total,
    stop_reason:        walkProgress?.stop_reason,
  };

  try {
    products = await enrichWithGallery(storeId, products, async (partial) => {
      if (partial.images_found !== undefined) finalProgress.images_found = partial.images_found;
      await updateProgress(jobId, { ...finalProgress });
    });
  } catch {
    // Gallery failure is non-fatal
    console.warn(`[${jobId}] Gallery pass failed — continuing without extra images`);
  }

  console.log(`[${jobId}] Gallery done — ${finalProgress.images_found} extra images`);

  // Step 4: write fetched_products and mark done
  // Storing as JSON in the job row; the popup reads it once on completion.
  await setJobStatus(jobId, "done", {
    fetched_products: products,
    progress: { ...finalProgress, phase: "done" },
  });

  console.log(`[${jobId}] Done — ${products.length} products ready for import`);

  if (job.auto_import) {
    console.log(`[${jobId}] Auto-importing ${products.length} products…`);
    try {
      const { imported, updated } = await importProducts(job.merchant_id, products);
      console.log(`[${jobId}] Auto-import complete — ${imported} inserted, ${updated} updated`);
    } catch (e) {
      // Non-fatal: products are still in fetched_products, manual import still works
      console.error(`[${jobId}] Auto-import failed:`, e instanceof Error ? e.message : e);
    }
  }
}

// ── Main polling loop ─────────────────────────────────────────────────────────

interface ClaimedJob {
  id: string;
  store_url: string;
  merchant_id: string;
  auto_import: boolean;
  resume?: ResumeCheckpoint;
}

async function claimNextJob(): Promise<ClaimedJob | null> {
  // 1. Claim the oldest pending job (normal path — always tried first).
  // Read-then-update optimistic claim (safe for a single worker).
  // For multi-worker setups, replace with a Postgres function using FOR UPDATE SKIP LOCKED.
  const { data: rows } = await db
    .from("salla_fetch_jobs")
    .select("id, store_url, merchant_id, auto_import")
    .eq("status", "pending")
    .order("created_at")
    .limit(1);

  const pendingJob = rows?.[0];
  if (pendingJob) {
    const { error } = await db
      .from("salla_fetch_jobs")
      .update({ status: "running" })
      .eq("id", pendingJob.id)
      .eq("status", "pending");
    return error ? null : pendingJob;
  }

  // 2. No pending jobs — try to resume an interrupted running job that has
  //    checkpoint data (walked_cat_ids set). A running job without checkpoint
  //    data is assumed to be live on another worker; leave it alone.
  const { data: running } = await db
    .from("salla_fetch_jobs")
    .select("id, store_url, merchant_id, auto_import, progress, fetched_products")
    .eq("status", "running")
    .order("created_at")
    .limit(1);

  const interruptedJob = running?.[0];
  if (!interruptedJob) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prog = interruptedJob.progress as Record<string, any> | null;
  const walkedCatIds   = (prog?.walked_cat_ids   as string[]  | undefined) ?? [];
  const walkedBrandIds = (prog?.walked_brand_ids as number[]  | undefined) ?? [];
  if (walkedCatIds.length === 0 && walkedBrandIds.length === 0) return null;

  const knownProducts = (interruptedJob.fetched_products as NormalizedProduct[] | null) ?? [];
  console.log(`[${interruptedJob.id}] Detected interrupted job with ${walkedCatIds.length} walked categories — resuming`);
  return {
    id:          interruptedJob.id,
    store_url:   interruptedJob.store_url,
    merchant_id: interruptedJob.merchant_id,
    auto_import: interruptedJob.auto_import,
    resume:      { walkedCatIds, walkedBrandIds, knownProducts },
  };
}

async function main() {
  console.log("Salla worker v5 started (category progress, early-stop, incremental flush, resume). Polling every 5 s…");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await claimNextJob();
    if (job) {
      try {
        await processJob(job, job.resume);
      } catch (e) {
        console.error(`[${job.id}] Unhandled error:`, e);
        await setJobStatus(job.id, "error", {
          error: e instanceof Error ? e.message : "Unhandled error",
        });
      }
    } else {
      await sleep(5_000);
    }
  }
}

main().catch(e => { console.error("Worker crashed:", e); process.exit(1); });
