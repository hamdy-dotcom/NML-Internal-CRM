/**
 * Gallery debug script — verifies the new enrichWithGallery logic against
 * bamcostore.com without going through the UI or worker.
 *
 * Usage:
 *   npx tsx scripts/debug-gallery.ts [storeId]
 *
 * Defaults to bamcostore store ID 1221454796.
 */

const STORE_ID  = process.argv[2] ?? "1221454796";
const SALLA_API = "https://api.salla.dev/store/v1";
const IMAGE_RE  = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:[?#][^\s"'<>]*)?/i;

// ── Fetch 15 product IDs ──────────────────────────────────────────────────────

async function getProducts(): Promise<{ id: number; name: string }[]> {
  const res  = await fetch(`${SALLA_API}/products?source=latest&limit=15`, {
    headers: { "store-identifier": STORE_ID, Accept: "application/json" },
  });
  const body = await res.json() as { data?: { id: number; name: string }[] };
  return body.data ?? [];
}

// ── Gallery batch call ────────────────────────────────────────────────────────

async function fetchGallery(ids: number[]): Promise<unknown> {
  const params = ids.map(id => `selected[]=${id}`).join("&");
  const url    = `${SALLA_API}/products/options?${params}&with[]=images&with[]=options`;
  console.log(`\nGallery URL (truncated): ${url.slice(0, 120)}…`);
  const res = await fetch(url, {
    headers: { "store-identifier": STORE_ID, Accept: "application/json" },
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok) { console.error(await res.text()); process.exit(1); }
  return res.json();
}

// ── Mirror the new collectUrlsInSubtree from gallery.ts ───────────────────────

function collectUrlsInSubtree(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") {
    if (typeof node === "string" && IMAGE_RE.test(node)) out.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectUrlsInSubtree(item, out);
    return;
  }
  for (const value of Object.values(node as Record<string, unknown>)) {
    collectUrlsInSubtree(value, out);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Gallery debug — store ${STORE_ID} ===`);

  const products = await getProducts();
  console.log(`\nFetched ${products.length} products from source=latest:`);
  products.forEach(p => console.log(`  ${p.id}  ${p.name}`));

  // source=latest returns id as string; coerce to number to match options response
  const ids      = products.map(p => Number(p.id));
  const batchSet = new Set(ids);
  const raw      = await fetchGallery(ids);

  const data = (raw as Record<string, unknown>)?.["data"];
  if (!Array.isArray(data)) {
    console.error("Unexpected: response.data is not an array, type:", typeof data);
    process.exit(1);
  }

  console.log(`\nresponse.data has ${data.length} items`);

  let totalImages = 0;
  let matched = 0;

  for (const item of data as Record<string, unknown>[]) {
    const rawId    = item["id"];
    const productId = typeof rawId === "number" ? rawId :
                      typeof rawId === "string" ? Number(rawId) : NaN;

    const inBatch = batchSet.has(productId);
    const name    = products.find(p => Number(p.id) === productId)?.name ?? "?";

    const urls = new Set<string>();
    collectUrlsInSubtree(item, urls);

    console.log(`\n  id=${productId} inBatch=${inBatch} images=${urls.size}  ${name}`);
    for (const u of [...urls].slice(0, 5)) console.log(`    ${u.slice(0, 100)}`);
    if (urls.size > 5) console.log(`    … and ${urls.size - 5} more`);

    if (inBatch) { matched++; totalImages += urls.size; }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Products matched: ${matched} / ${products.length}`);
  console.log(`Total image URLs collected: ${totalImages}`);
  console.log(`Average per product: ${matched > 0 ? (totalImages / matched).toFixed(1) : 0}`);
}

main().catch(e => { console.error(e); process.exit(1); });
