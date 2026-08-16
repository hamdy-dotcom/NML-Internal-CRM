// Batched gallery pass: enriches products with full image arrays.
// Calls /products/options with up to 15 IDs at a time.
// The response is data:[{ id, image:{url}, images:[{url}], ... }].
// We anchor the product ID from the top-level data array, then recursively
// collect every image-shaped URL string within that product's subtree.

import type { NormalizedProduct, WalkProgress } from "./types";

const SALLA_API  = "https://api.salla.dev/store/v1";
const BATCH_SIZE = 15;
const DELAY_MS   = 200;
const IMAGE_RE   = /https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|webp|avif|gif)(?:[?#][^\s"'<>]*)?/i;

// Field names that reliably hold an image URL even without a file extension
// (e.g. Salla CDN paths like https://cdn.salla.sa/XrGpz/abcdef with no .jpg)
const IMAGE_KEYS  = new Set(["url", "src", "image", "thumbnail", "original", "original_image", "photo"]);
const HTTPS_RE    = /^https?:\/\//i;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchGalleryBatch(storeId: string, ids: number[]): Promise<unknown> {
  const params = ids.map(id => `selected[]=${id}`).join("&");
  const url    = `${SALLA_API}/products/options?${params}&with[]=images&with[]=options`;

  const res = await fetch(url, {
    headers: { "store-identifier": storeId, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`gallery HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Collect every image URL string found anywhere within `node`.
// Two detection paths:
//   1. Extension-based regex — works for most Salla CDN URLs
//   2. Key-name heuristic  — catches extension-less URLs in fields like "url", "thumbnail"
function collectUrlsInSubtree(node: unknown, out: Set<string>, parentKey?: string): void {
  if (!node || typeof node !== "object") {
    if (typeof node === "string") {
      if (IMAGE_RE.test(node)) {
        out.add(node);
      } else if (parentKey && IMAGE_KEYS.has(parentKey.toLowerCase()) && HTTPS_RE.test(node)) {
        out.add(node);
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectUrlsInSubtree(item, out, parentKey);
    return;
  }
  for (const [k, value] of Object.entries(node as Record<string, unknown>)) {
    collectUrlsInSubtree(value, out, k);
  }
}

export async function enrichWithGallery(
  storeId:    string,
  products:   NormalizedProduct[],
  onProgress: (p: Partial<WalkProgress>) => Promise<void>,
): Promise<NormalizedProduct[]> {
  const idToProduct = new Map(products.map(p => [p.salla_id, p]));
  const allIds      = [...idToProduct.keys()];
  let   imagesFound = 0;

  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const batch    = allIds.slice(i, i + BATCH_SIZE);
    const batchSet = new Set(batch);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    await sleep(DELAY_MS);

    // Diagnostic: surface any salla_id type mismatch before the HTTP call
    if (i === 0) {
      console.log(
        `[gallery] salla_id sample — typeof=${typeof batch[0]}, ` +
        `first3=[${batch.slice(0, 3).join(",")}]`,
      );
    }

    try {
      const raw = await fetchGalleryBatch(storeId, batch);

      // The API returns { data: [...products...] }.
      // Anchor each item by its `id` field, then walk its subtree for URLs.
      const data = (raw as Record<string, unknown>)?.["data"];
      if (!Array.isArray(data)) {
        console.warn(`[gallery] batch ${batchNum} unexpected shape — data is ${typeof data}`);
        continue;
      }

      let batchMatched = 0;
      let batchImages  = 0;

      for (const item of data as Record<string, unknown>[]) {
        // Resolve the product ID — handle both number and string forms defensively.
        const rawId = item["id"];
        const productId =
          typeof rawId === "number" ? rawId :
          typeof rawId === "string" ? Number(rawId) :
          NaN;

        if (isNaN(productId) || !batchSet.has(productId)) continue;

        const product = idToProduct.get(productId);
        if (!product) continue;
        batchMatched++;

        // Collect every image URL anywhere under this product object.
        const urls = new Set<string>();
        collectUrlsInSubtree(item, urls);
        batchImages += urls.size;

        if (urls.size === 0) continue;

        // Dedupe: put the main image first, then remaining gallery images.
        const ordered = product.image
          ? [product.image, ...urls].filter((u, idx, a) => a.indexOf(u) === idx)
          : [...urls];

        product.images  = ordered;
        imagesFound    += ordered.length - (product.image ? 1 : 0);
      }

      console.log(
        `[gallery] batch ${batchNum} — ${data.length} items, ` +
        `matched=${batchMatched}/${batch.length}, urls=${batchImages}`,
      );
    } catch (e) {
      console.warn(`[gallery] batch ${batchNum} failed:`, (e as Error).message);
    }

    await onProgress({ images_found: imagesFound });
  }

  return products;
}
