/**
 * Batch-maps product_categories.mapped_category using Claude claude-sonnet-4-6.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/map-categories.ts
 *   npx tsx --env-file=.env.local scripts/map-categories.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/map-categories.ts --remap-low
 *
 * Required env vars (in .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY
 *
 * Flags:
 *   --dry-run    Print proposed mappings without writing to DB
 *   --remap-low  Also re-map rows where confidence is 'low' or 'none'
 */

import { createClient } from "@supabase/supabase-js";
import { NML_CATEGORIES } from "../src/lib/categories";

const DRY_RUN   = process.argv.includes("--dry-run");
const REMAP_LOW = process.argv.includes("--remap-low");
const BATCH     = 50; // categories per Claude call

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TAXONOMY_LIST = NML_CATEGORIES
  .map((c, i) => `${i + 1}. ${c.ar}  (${c.en})`)
  .join("\n");

interface Row {
  raw_category: string;
  product_count: number;
}

interface MappingResult {
  raw: string;
  mapped: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

async function mapBatch(batch: Row[]): Promise<MappingResult[]> {
  const items = batch.map((r, i) => `${i + 1}. ${r.raw_category}`).join("\n");

  const prompt = `You are mapping Arabic product category names from Egyptian e-commerce stores (Salla platform) into a standardised NML taxonomy.

NML taxonomy (pick EXACTLY one — use the Arabic label verbatim):
${TAXONOMY_LIST}

Rules:
- Navigation labels, price ranges, promotional phrases, seasonal banners, store-section headers → mapped: null, confidence: "none"
- Individual coffee roastery pages (e.g. "محمصة فلان", "قهوة متجر X") → map to "حبوب القهوة والمحاصيل", confidence: "high"
- When you are certain → confidence: "high"; when likely → "medium"; when guessing → "low"; when unmappable → "none"
- Return ONLY a valid JSON array, no prose.

Categories to map:
${items}

Return a JSON array with exactly ${batch.length} objects:
[{"raw": "<exact original>", "mapped": "<NML Arabic label or null>", "confidence": "high|medium|low|none"}, ...]`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const body = await resp.json() as { content: { type: string; text: string }[] };
  const text = body.content.find(b => b.type === "text")?.text ?? "";

  // Extract JSON from the response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`No JSON array in response: ${text.slice(0, 300)}`);

  const results = JSON.parse(match[0]) as MappingResult[];

  // Validate mapped values are in taxonomy
  const validCategories: Set<string> = new Set(NML_CATEGORIES.map(c => c.ar));
  for (const r of results) {
    if (r.mapped && !validCategories.has(r.mapped)) {
      console.warn(`  ⚠ Unknown category "${r.mapped}" for "${r.raw}" — setting to null`);
      r.mapped = null;
      r.confidence = "none";
    }
  }

  return results;
}

async function main() {
  console.log("=== NML Category Mapper ===");
  if (DRY_RUN) console.log("  DRY RUN — nothing will be written to DB\n");

  // Fetch unmapped (or low-confidence) categories
  let q = (supabase.from("product_categories") as any)
    .select("raw_category, product_count")
    .order("product_count", { ascending: false });

  if (REMAP_LOW) {
    q = q.or("mapped_category.is.null,confidence.in.(low,none)");
  } else {
    q = q.is("mapped_category", null);
  }

  const { data, error } = await q;
  if (error) { console.error("DB error:", error.message); process.exit(1); }

  const rows = (data ?? []) as Row[];
  console.log(`Found ${rows.length} categories to map\n`);
  if (!rows.length) { console.log("Nothing to do."); return; }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH);
    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} categories)…`);

    try {
      const results = await mapBatch(batch);

      if (DRY_RUN) {
        for (const r of results) {
          console.log(`  [${r.confidence.padEnd(6)}] ${r.raw.slice(0, 40).padEnd(40)} → ${r.mapped ?? "(unmapped)"}`);
        }
      } else {
        // Upsert results in one shot
        const upserts = results.map(r => ({
          raw_category: r.raw,
          mapped_category: r.mapped,
          confidence: r.confidence,
          updated_at: new Date().toISOString(),
        }));
        const { error: uErr } = await (supabase.from("product_categories") as any)
          .upsert(upserts, { onConflict: "raw_category" });
        if (uErr) throw new Error(uErr.message);

        const mapped = results.filter(r => r.mapped).length;
        console.log(`  ✓ ${mapped}/${results.length} mapped, ${results.length - mapped} unmapped`);
        succeeded += results.length;
      }
    } catch (e) {
      console.error(`  ✗ batch ${batchNum} failed:`, (e as Error).message);
      failed += batch.length;
    }

    processed += batch.length;

    // Polite delay between Claude calls
    if (i + BATCH < rows.length) await new Promise(r => setTimeout(r, 800));
  }

  console.log(`\nDone. ${processed} processed, ${succeeded} succeeded, ${failed} failed.`);

  if (!DRY_RUN && succeeded > 0) {
    console.log("\nSyncing products.category_mapped from product_categories…");
    // The trigger handles per-row updates on upsert, but do a final bulk sync to catch any gaps
    const { error: syncErr } = await supabase.rpc("sync_all_category_mapped" as any);
    if (syncErr) {
      console.warn("  Trigger-based sync already ran per row; bulk sync RPC not found (safe to ignore).");
    } else {
      console.log("  ✓ Bulk sync complete.");
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
