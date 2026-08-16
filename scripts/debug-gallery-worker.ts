/**
 * Mirrors exactly what the worker does for the gallery pass:
 *   resolveStore → fetch 15 products via walkStore's sallaFetch → gallery batch
 *
 * Logs: resolved storeId, request URL, first 500 chars raw response, ID types.
 *
 * Usage:
 *   npx tsx scripts/debug-gallery-worker.ts [storeUrl]
 *
 * Defaults to bamcostore.com
 */

import { resolveStore } from "../src/lib/salla/resolver";

const STORE_URL = process.argv[2] ?? "bamcostore.com";
const SALLA_API = "https://api.salla.dev/store/v1";

async function main() {
  console.log(`\n=== debug-gallery-worker: ${STORE_URL} ===\n`);

  // Step 1: resolve store ID exactly as the worker does
  console.log("Step 1: resolveStore…");
  const resolved = await resolveStore(STORE_URL);
  if (!resolved) {
    console.error("resolveStore returned null — check the URL");
    process.exit(1);
  }
  const { storeId } = resolved;
  console.log(`  resolved storeId = "${storeId}"  (typeof: ${typeof storeId})`);
  console.log(`  ${resolved.categoryUrls.length} category URLs found`);

  // Step 2: fetch 15 products using source=latest with the resolved storeId
  //         (same request the walker makes)
  console.log("\nStep 2: fetching 15 products via source=latest…");
  const prodRes = await fetch(`${SALLA_API}/products?source=latest&limit=15`, {
    headers: { "store-identifier": storeId, Accept: "application/json" },
  });
  console.log(`  HTTP ${prodRes.status}`);
  const prodBody = await prodRes.json() as { data?: { id: unknown; name: string }[] };
  const rawProducts = prodBody.data ?? [];
  console.log(`  ${rawProducts.length} products returned`);
  if (rawProducts.length === 0) { console.error("No products — wrong store?"); process.exit(1); }

  // Show raw id types (this is what normalizeProduct will receive)
  const firstId = rawProducts[0].id;
  console.log(`  raw id sample: value="${firstId}", typeof=${typeof firstId}`);

  // Step 3: coerce ids as normalizeProduct does (Number(raw.id))
  const ids = rawProducts.map(p => Number(p.id));
  console.log(`  coerced ids: [${ids.slice(0, 5).join(", ")}…]  typeof first=${typeof ids[0]}`);

  // Step 4: build the gallery URL exactly as fetchGalleryBatch does
  const params = ids.map(id => `selected[]=${id}`).join("&");
  const galleryUrl = `${SALLA_API}/products/options?${params}&with[]=images&with[]=options`;
  console.log(`\nStep 3: gallery request URL (first 200 chars):`);
  console.log(`  ${galleryUrl.slice(0, 200)}`);

  // Step 5: make the gallery call with the RESOLVED storeId (not hardcoded)
  console.log(`\n  using store-identifier: "${storeId}"`);
  const galRes = await fetch(galleryUrl, {
    headers: { "store-identifier": storeId, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  console.log(`  HTTP ${galRes.status}`);

  const rawText = await galRes.text();
  console.log(`\nStep 4: raw response (first 500 chars):`);
  console.log(rawText.slice(0, 500));

  if (!galRes.ok) {
    console.error("\n[FAIL] Gallery request returned non-OK status");
    process.exit(1);
  }

  const galBody = JSON.parse(rawText) as { data?: unknown[] };
  const data = galBody.data;
  if (!Array.isArray(data)) {
    console.error(`\n[FAIL] response.data is ${typeof data}, not an array`);
    process.exit(1);
  }
  console.log(`\nStep 5: response.data has ${data.length} items`);

  // Step 6: check ID matching exactly as gallery.ts does
  const batchSet = new Set(ids);
  let matched = 0;
  let totalUrls = 0;

  const IMAGE_RE  = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:[?#][^\s"'<>]*)?/i;
  const IMAGE_KEYS = new Set(["url", "src", "image", "thumbnail", "original", "original_image", "photo"]);
  const HTTPS_RE   = /^https?:\/\//i;

  function collectUrls(node: unknown, out: Set<string>, parentKey?: string): void {
    if (!node || typeof node !== "object") {
      if (typeof node === "string") {
        if (IMAGE_RE.test(node)) out.add(node);
        else if (parentKey && IMAGE_KEYS.has(parentKey.toLowerCase()) && HTTPS_RE.test(node)) out.add(node);
      }
      return;
    }
    if (Array.isArray(node)) { for (const item of node) collectUrls(item, out, parentKey); return; }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) collectUrls(v, out, k);
  }

  for (const item of data as Record<string, unknown>[]) {
    const rawId = (item as Record<string, unknown>)["id"];
    const productId = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : NaN;
    const inBatch = !isNaN(productId) && batchSet.has(productId);

    const urls = new Set<string>();
    collectUrls(item, urls);

    if (!inBatch) {
      console.log(`  item id=${rawId} (typeof ${typeof rawId}) — NOT in batch, skipped`);
    } else {
      matched++;
      totalUrls += urls.size;
      const name = rawProducts.find(p => Number(p.id) === productId)?.name ?? "?";
      console.log(`  id=${productId} matched, urls=${urls.size}  ${name}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Products fetched: ${rawProducts.length}`);
  console.log(`Gallery items:    ${data.length}`);
  console.log(`Matched:          ${matched}`);
  console.log(`Total image URLs: ${totalUrls}`);
  console.log(`storeId used:     "${storeId}"`);
  console.log(`\n[Compare] Debug script uses storeId "1221454796" — does this match?`, storeId === "1221454796" ? "YES ✓" : "NO ✗ (this is likely the bug)");
}

main().catch(e => { console.error(e); process.exit(1); });
