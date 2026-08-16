/**
 * Deep-diagnoses the category/brand walk against a live Salla store.
 *
 * Prints:
 *   • Resolved store ID
 *   • Category URLs from homepage + extractCatId result for each
 *   • Exact URL we build for the first category request
 *   • First 500 chars of the raw API response for that request
 *   • A manually-built "correct" reference URL
 *   • Brand IDs found in source=latest products
 *   • Exact URL we build for the first brand request + raw response
 *
 * Usage:
 *   npx tsx scripts/debug-walker.ts [storeUrl]
 */

import { resolveStore } from "../src/lib/salla/resolver";

const STORE_URL = process.argv[2] ?? "https://wixsana.sa/";
const SALLA_API = "https://api.salla.dev/store/v1";

function extractCatId(url: string): string | null {
  return url.match(/\/c(\d+)/)?.[1] ?? null;
}

function buildProductsUrl(source: string, sourceValues?: string[]): string {
  const parts = [`source=${source}`, "limit=50"];
  for (const v of sourceValues ?? []) parts.push(`source_value[]=${v}`);
  return `${SALLA_API}/products?${parts.join("&")}`;
}

async function sallaGet(storeId: string, url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    headers: { "store-identifier": storeId, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log(`\n=== debug-walker: ${STORE_URL} ===\n`);

  // ── 1. Resolve store ──────────────────────────────────────────────────────
  const resolved = await resolveStore(STORE_URL);
  if (!resolved) { console.error("resolveStore returned null"); process.exit(1); }
  const { storeId, categoryUrls } = resolved;
  console.log(`Store ID : "${storeId}"  (typeof: ${typeof storeId})`);
  console.log(`Category URLs from homepage: ${categoryUrls.length}\n`);

  // ── 2. Show extractCatId results for each homepage category URL ───────────
  console.log("── Category URLs + extractCatId ─────────────────────────────────");
  for (const u of categoryUrls.slice(0, 15)) {
    const id = extractCatId(u);
    console.log(`  extractCatId → ${id ?? "NULL"} ← ${u}`);
  }
  if (categoryUrls.length > 15) console.log(`  … and ${categoryUrls.length - 15} more`);
  console.log();

  // ── 3. Also mine category URLs from a category page (one level deep) ───────
  const firstCatUrl = categoryUrls[0];
  if (firstCatUrl) {
    console.log(`── Sub-crawl of first category page: ${firstCatUrl}`);
    const pageRes = await fetch(firstCatUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15_000),
    });
    const html = await pageRes.text();
    const re = /href="([^"#?]*\/c\d+[^"#?]*)"/g;
    const subs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      subs.push(href.startsWith("http") ? href : `https://${new URL(firstCatUrl).host}${href}`);
    }
    const uniq = [...new Set(subs)].slice(0, 5);
    uniq.forEach(u => console.log(`  sub-cat: extractCatId → ${extractCatId(u) ?? "NULL"} ← ${u}`));
    console.log();
  }

  // ── 4. Fetch source=latest to get products + brand IDs ────────────────────
  console.log("── source=latest (first page) ───────────────────────────────────");
  const latestUrl = buildProductsUrl("latest");
  console.log(`  URL: ${latestUrl}`);
  const latestRaw = await sallaGet(storeId, latestUrl);
  console.log(`  HTTP ${latestRaw.status}`);
  console.log(`  raw[0:200]: ${latestRaw.text.slice(0, 200)}\n`);

  const latestBody = JSON.parse(latestRaw.text) as { data?: { id: unknown; brand?: { id: number } | null; category?: { url?: string } | null }[] };
  const products = latestBody.data ?? [];
  console.log(`  products returned: ${products.length}`);

  // Collect category URLs from products
  const productCatUrls = products
    .map(p => p.category?.url)
    .filter(Boolean) as string[];
  console.log(`  category URLs in products: ${productCatUrls.length}`);
  productCatUrls.slice(0, 3).forEach(u =>
    console.log(`    extractCatId → ${extractCatId(u) ?? "NULL"} ← ${u}`),
  );

  // Collect brand IDs
  const brandIds = [...new Set(
    products.map(p => p.brand?.id).filter((id): id is number => typeof id === "number"),
  )];
  console.log(`  brand IDs in products: ${brandIds.join(", ") || "(none)"}\n`);

  // ── 5. First category request — our URL vs a manual one ────────────────────
  const firstCatIdFromHomepage = categoryUrls.map(u => extractCatId(u)).find(id => id != null);
  const firstCatIdFromProducts = productCatUrls.map(u => extractCatId(u)).find(id => id != null);
  const catId = firstCatIdFromHomepage ?? firstCatIdFromProducts;

  if (catId) {
    console.log(`── Category API request (catId="${catId}") ──────────────────────`);

    const ourUrl  = buildProductsUrl("categories", [catId]);
    // Manual reference: what a correct call looks like per Salla docs
    const refUrl1 = `${SALLA_API}/products?source=categories&source_value[]=${catId}&limit=50`;
    const refUrl2 = `${SALLA_API}/products?source=categories&source_value=${catId}&limit=50`;

    console.log(`  Our URL :  ${ourUrl}`);
    console.log(`  Ref URL1:  ${refUrl1}`);
    console.log(`  Ref URL2:  ${refUrl2}`);
    console.log(`  (Our == Ref1: ${ourUrl === refUrl1})\n`);

    console.log(`  Fetching our URL…`);
    const ourRaw = await sallaGet(storeId, ourUrl);
    console.log(`  HTTP ${ourRaw.status}`);
    console.log(`  raw[0:500]:\n${ourRaw.text.slice(0, 500)}\n`);

    const ourBody = JSON.parse(ourRaw.text) as { data?: unknown[] };
    console.log(`  products in our response: ${ourBody.data?.length ?? "N/A"}\n`);

    // Compare against ref URL2 (no brackets)
    console.log(`  Fetching Ref URL2 (no brackets)…`);
    const ref2Raw = await sallaGet(storeId, refUrl2);
    console.log(`  HTTP ${ref2Raw.status}`);
    console.log(`  raw[0:300]:\n${ref2Raw.text.slice(0, 300)}\n`);
    const ref2Body = JSON.parse(ref2Raw.text) as { data?: unknown[] };
    console.log(`  products in ref2 response: ${ref2Body.data?.length ?? "N/A"}\n`);

    // Try with URL encoding
    const encodedUrl = `${SALLA_API}/products?source=categories&limit=50&source_value%5B%5D=${catId}`;
    console.log(`  Fetching URL-encoded brackets…`);
    const encRaw = await sallaGet(storeId, encodedUrl);
    console.log(`  HTTP ${encRaw.status}`);
    const encBody = JSON.parse(encRaw.text) as { data?: unknown[] };
    console.log(`  products in encoded response: ${encBody.data?.length ?? "N/A"}\n`);
  } else {
    console.log("  No category ID found — check homepage HTML for /c<digits> hrefs\n");
  }

  // ── 6. First brand request ─────────────────────────────────────────────────
  if (brandIds.length > 0) {
    const brandId = brandIds[0];
    console.log(`── Brand API request (brandId=${brandId}) ────────────────────────`);

    const brandUrl = buildProductsUrl("brands", [String(brandId)]);
    console.log(`  Our URL: ${brandUrl}`);

    const brandRaw = await sallaGet(storeId, brandUrl);
    console.log(`  HTTP ${brandRaw.status}`);
    console.log(`  raw[0:300]:\n${brandRaw.text.slice(0, 300)}`);
    const brandBody = JSON.parse(brandRaw.text) as { data?: unknown[] };
    console.log(`  products in response: ${brandBody.data?.length ?? "N/A"}\n`);

    // Also try without brackets
    const brandRef = `${SALLA_API}/products?source=brands&source_value=${brandId}&limit=50`;
    console.log(`  Ref (no brackets): ${brandRef}`);
    const brandRef2Raw = await sallaGet(storeId, brandRef);
    console.log(`  HTTP ${brandRef2Raw.status}`);
    const brandRef2Body = JSON.parse(brandRef2Raw.text) as { data?: unknown[] };
    console.log(`  products in ref response: ${brandRef2Body.data?.length ?? "N/A"}`);
  } else {
    console.log("── No brand IDs found in first page of products");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
