/**
 * Finds whether category/brand products overlap with source=latest.
 *
 * Walks all pages of source=latest to build a known-IDs set, then
 * walks 3 categories and 1 brand and shows new vs duplicate product counts.
 * Also checks ID types at every step.
 *
 * Usage:
 *   npx tsx scripts/debug-dedup.ts [storeUrl]
 */

import { resolveStore } from "../src/lib/salla/resolver";

const STORE_URL = process.argv[2] ?? "https://wixsana.sa/";
const SALLA_API = "https://api.salla.dev/store/v1";

async function fetchPage(storeId: string, url: string) {
  const res = await fetch(url, {
    headers: { "store-identifier": storeId, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json() as Promise<{ data?: { id: unknown; brand?: { id?: number } | null }[]; cursor?: { next?: string | null } }>;
}

async function walkFull(storeId: string, startUrl: string, label: string): Promise<Map<string, number>> {
  const seen = new Map<string, number>(); // stringified id → count
  let url: string | null | undefined = startUrl;
  let pages = 0;

  while (url) {
    await new Promise(r => setTimeout(r, 150));
    const body = await fetchPage(storeId, url);
    const items = body.data ?? [];
    pages++;

    for (const item of items) {
      const rawId = item.id;
      const key = String(rawId);   // stringify for consistent lookup
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }

    url = body.cursor?.next;
    if (pages > 50) { console.log(`  [${label}] stopped at 50 pages`); break; }
  }

  console.log(`  [${label}] pages=${pages}  unique products=${seen.size}`);
  return seen;
}

async function main() {
  console.log(`\n=== debug-dedup: ${STORE_URL} ===\n`);

  const resolved = await resolveStore(STORE_URL);
  if (!resolved) { console.error("resolveStore failed"); process.exit(1); }
  const { storeId, categoryUrls } = resolved;
  console.log(`Store ID: ${storeId}\n`);

  // ── Walk source=latest fully ───────────────────────────────────────────────
  console.log("── Walking source=latest (all pages) ───────────────────────────");
  const latestUrl = `${SALLA_API}/products?source=latest&limit=50`;
  const latestIds = await walkFull(storeId, latestUrl, "latest");

  // Sample to show ID types
  const sample = [...latestIds.keys()].slice(0, 3);
  console.log(`  ID sample: ${sample.map(id => `"${id}" (${typeof id})`).join(", ")}`);
  console.log();

  // Also collect brand IDs from a full source=latest page
  const latestBody = await fetchPage(storeId, latestUrl);
  const brandIds = [...new Set(
    (latestBody.data ?? [])
      .map(p => p.brand?.id)
      .filter((id): id is number => typeof id === "number"),
  )];
  console.log(`Brand IDs from first source=latest page: ${brandIds.join(", ") || "(none)"}\n`);

  // ── Walk 3 categories and show overlap ────────────────────────────────────
  const catRe = /\/c(\d+)/;
  const categoriesWithIds = categoryUrls
    .map(u => ({ url: u, id: u.match(catRe)?.[1] }))
    .filter(c => c.id != null) as { url: string; id: string }[];

  console.log(`── Category dedup check (first 3 categories) ──────────────────`);
  for (const cat of categoriesWithIds.slice(0, 3)) {
    const catApiUrl = `${SALLA_API}/products?source=categories&limit=50&source_value[]=${cat.id}`;
    console.log(`\n  Cat ${cat.id} (${cat.url.split("/").at(-1)})`);
    console.log(`  URL: ${catApiUrl}`);

    const catIds = await walkFull(storeId, catApiUrl, `cat:${cat.id}`);

    let newCount = 0;
    let dupCount = 0;
    for (const [id] of catIds) {
      if (latestIds.has(id)) dupCount++;
      else newCount++;
    }
    console.log(`  → new=${newCount}  dup=${dupCount}  total=${catIds.size}`);

    if (newCount > 0) {
      const newIds = [...catIds.keys()].filter(id => !latestIds.has(id)).slice(0, 5);
      console.log(`  → sample new IDs: ${newIds.join(", ")}`);
    }
  }

  // ── Brand check ───────────────────────────────────────────────────────────
  console.log(`\n── Brand check ─────────────────────────────────────────────────`);
  if (brandIds.length === 0) {
    // No brands from source=latest — check if source=categories returns brands
    console.log("  No brand IDs from source=latest first page.");
    console.log("  Trying source=brands without a filter to see available brands…");
    const brandsUrl = `${SALLA_API}/products?source=brands&limit=10`;
    const bRes = await fetchPage(storeId, brandsUrl).catch(e => null);
    console.log(`  source=brands (no filter) → ${bRes?.data?.length ?? "error"} products`);

    // Try fetching the brands endpoint
    const brandListUrl = `${SALLA_API}/brands?limit=20`;
    const blRes = await fetch(brandListUrl, {
      headers: { "store-identifier": storeId, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    const blText = await blRes.text();
    console.log(`  GET /brands HTTP ${blRes.status}: ${blText.slice(0, 300)}`);
  } else {
    const bid = brandIds[0];
    const brandUrl = `${SALLA_API}/products?source=brands&limit=50&source_value[]=${String(bid)}`;
    console.log(`  URL: ${brandUrl}`);
    const brandIds2 = await walkFull(storeId, brandUrl, `brand:${bid}`);
    let newCount = 0, dupCount = 0;
    for (const [id] of brandIds2) {
      if (latestIds.has(id)) dupCount++;
      else newCount++;
    }
    console.log(`  → new=${newCount}  dup=${dupCount}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
