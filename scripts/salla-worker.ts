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

// ── Job processor ─────────────────────────────────────────────────────────────

async function processJob(job: {
  id: string;
  store_url: string;
  merchant_id: string;
  auto_import: boolean;
}): Promise<void> {
  const { id: jobId, store_url: storeUrl } = job;
  console.log(`[${jobId}] Processing ${storeUrl}`);

  await setJobStatus(jobId, "running", { store_id: null });

  // Step 1: resolve store ID
  const resolved = await resolveStore(storeUrl);
  if (!resolved) {
    await setJobStatus(jobId, "error", { error: `Could not resolve Salla store ID from ${storeUrl}` });
    return;
  }

  const { storeId, categoryUrls } = resolved;
  await db.from("salla_fetch_jobs").update({ store_id: storeId }).eq("id", jobId);
  console.log(`[${jobId}] Resolved store ID: ${storeId}, ${categoryUrls.length} category URLs`);

  // Progress callback — write at most every 500 ms OR when ≥25 new products arrive
  let lastProgressSave = 0;
  let lastSavedCount   = 0;
  const onProgress = async (p: WalkProgress) => {
    const now         = Date.now();
    const newProducts = p.products_found - lastSavedCount;
    if (now - lastProgressSave < 500 && newProducts < 25) return;
    lastProgressSave = now;
    lastSavedCount   = p.products_found;
    await updateProgress(jobId, p);
    console.log(`[${jobId}] ${p.phase} — ${p.products_found} products, ${p.request_count} requests`);
  };

  // Step 2: walk the catalog
  let products: NormalizedProduct[];
  try {
    products = await walkStore(storeId, categoryUrls, onProgress);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Walk failed";
    await setJobStatus(jobId, "error", { error: msg });
    console.error(`[${jobId}] Walk error:`, msg);
    return;
  }

  console.log(`[${jobId}] Walk complete — ${products.length} products`);

  // Step 3: gallery pass
  const finalProgress: WalkProgress = {
    phase: "gallery",
    products_found: products.length,
    images_found: 0,
    request_count: 0,
    categories_crawled: [],
    brands_crawled: [],
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

async function claimNextJob(): Promise<{
  id: string;
  store_url: string;
  merchant_id: string;
  auto_import: boolean;
} | null> {
  // Read-then-update optimistic claim (safe for a single worker).
  // For multi-worker setups, replace with a Postgres function using FOR UPDATE SKIP LOCKED.
  const { data: rows } = await db
    .from("salla_fetch_jobs")
    .select("id, store_url, merchant_id, auto_import")
    .eq("status", "pending")
    .order("created_at")
    .limit(1);

  const job = rows?.[0];
  if (!job) return null;

  const { error } = await db
    .from("salla_fetch_jobs")
    .update({ status: "running" })
    .eq("id", job.id)
    .eq("status", "pending"); // only claim if still pending

  return error ? null : job;
}

async function main() {
  console.log("Salla worker v4 started (gallery: parentKey URL detection, dual-threshold throttle). Polling every 5 s…");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await claimNextJob();
    if (job) {
      try {
        await processJob(job);
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
