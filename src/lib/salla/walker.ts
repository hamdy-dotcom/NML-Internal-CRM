// Catalog walker: multi-axis discovery for Salla storefronts.
//
// Axes (per brief §3):
//   1. source=latest      — walk cursor to exhaustion
//   2. HTML cat crawl     — mine sub-category IDs from category page HTML
//   3. source=categories  — walk each category ID
//   4. source=brands      — walk each brand ID mined from found products
//   5. Repeat 3–4 up to MAX_ROUNDS, stop when a round adds nothing new

import type { NormalizedProduct, RecentProduct, WalkProgress } from "./types";

const SALLA_API = "https://api.salla.dev/store/v1";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS  = 200;
const MAX_RETRIES = 5;
const MAX_ROUNDS  = 4;

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function buildProductsUrl(source: string, sourceValues?: string[]): string {
  // Use raw bracket notation — Salla's API expects `source_value[]=` unencoded.
  const parts = [`source=${source}`, "limit=50"];
  for (const v of sourceValues ?? []) parts.push(`source_value[]=${v}`);
  return `${SALLA_API}/products?${parts.join("&")}`;
}

function extractCatId(url: string): string | null {
  return url.match(/\/c(\d+)/)?.[1] ?? null;
}

// ── Salla API fetcher with retry / 429 backoff ────────────────────────────────

async function sallaFetch(storeId: string, url: string): Promise<unknown> {
  let backoff = 500;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoff);

    try {
      const res = await fetch(url, {
        headers: { "store-identifier": storeId, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429) {
        backoff = Math.min(backoff * 2, 8_000);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e as Error;
      backoff = Math.min(backoff * 2, 8_000);
    }
  }
  throw lastErr ?? new Error(`sallaFetch failed: ${url}`);
}

// ── HTML category-page crawler ────────────────────────────────────────────────

async function crawlCategoryPage(url: string): Promise<string[]> {
  try {
    await sleep(DELAY_MS);
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const base = new URL(url).origin;
    const found: string[] = [];
    const re = /href="([^"#?]*\/c\d+[^"#?]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const href = m[1];
      found.push(href.startsWith("http") ? href : `${base}${href}`);
    }
    return [...new Set(found)];
  } catch {
    return [];
  }
}

// ── Description parser (§6) ───────────────────────────────────────────────────

function parseDescription(raw: string | null): {
  description: string | null;
  specs: { label: string; value: string }[];
} {
  if (!raw) return { description: null, specs: [] };
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return { description: null, specs: [] };

  const sepIdx = text.indexOf("=====");
  if (sepIdx === -1) return { description: text, specs: [] };

  const prose = text.slice(0, sepIdx).trim() || null;
  const specs: { label: string; value: string }[] = [];

  for (const chunk of text.slice(sepIdx + 5).split("##")) {
    const t = chunk.trim();
    if (!t) continue;
    const ci = t.indexOf(":");
    const hi = t.indexOf("#");
    const si = ci === -1 ? hi : hi === -1 ? ci : Math.min(ci, hi);
    if (si < 1) continue;
    const label = t.slice(0, si).trim();
    const value = t.slice(si + 1).trim();
    if (label && value) specs.push({ label, value });
  }

  return { description: prose, specs };
}

function extractPrice(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object") {
    const v = (raw as Record<string, unknown>).amount;
    if (typeof v === "number") return v;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeProduct(raw: Record<string, any>, foundVia: string): NormalizedProduct {
  const { description, specs } = parseDescription(raw.description as string | null);
  const price = extractPrice(raw.price);
  const regularPrice = extractPrice(raw.regular_price);

  return {
    salla_id:        Number(raw.id),   // source=latest returns id as string; options as number
    name:            String(raw.name ?? ""),
    sku:             (raw.sku as string | null) || null,
    mpn:             (raw.mpn as string | null) || null,
    gtin:            (raw.gtin as string | null) || null,
    price,
    compare_at:      raw.is_on_sale ? regularPrice : null,
    currency:        (raw.currency as string) || "SAR",
    image:           (raw.image as { url?: string } | null)?.url
                       ?? (raw.original_image as string | null)
                       ?? null,
    images:          [],  // enriched by gallery pass
    brand:           (raw.brand as { name: string } | null)?.name ?? null,
    brand_id:        (raw.brand as { id: number | string } | null)?.id != null
                       ? Number((raw.brand as { id: number | string }).id)
                       : null,
    category:        (raw.category as { name: string } | null)?.name ?? null,
    category_url:    (raw.category as { url: string } | null)?.url ?? null,
    weight:          typeof raw.weight === "number" ? raw.weight : null,
    in_stock:        raw.is_available === true && raw.is_out_of_stock !== true,
    has_options:     raw.has_options === true,
    external_url:    (raw.url as string) || "",
    description_html: (raw.description as string | null) || null,
    description,
    specs,
    found_via: foundVia,
  };
}

// ── Cursor walker ─────────────────────────────────────────────────────────────

async function walkCursor(
  storeId:   string,
  startUrl:  string,
  foundVia:  string,
  products:  Map<number, NormalizedProduct>,
  progress:  WalkProgress,
  onProgress: (p: WalkProgress) => Promise<void>,
): Promise<number> {
  let added = 0;
  let nextUrl: string | null = startUrl;

  while (nextUrl) {
    await sleep(DELAY_MS);
    progress.request_count++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await sallaFetch(storeId, nextUrl)) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Record<string, any>[] = (data?.data as Record<string, any>[]) ?? [];

    for (const raw of items) {
      const id = raw.id as number;
      if (!products.has(id)) {
        const np = normalizeProduct(raw, foundVia);
        products.set(id, np);
        added++;
        progress.products_found = products.size;
        // Rolling 50-item buffer for the live popup feed
        const entry: RecentProduct = {
          salla_id: np.salla_id, name: np.name, sku: np.sku,
          price: np.price, currency: np.currency, image: np.image,
        };
        const buf = progress.recent_products ?? [];
        progress.recent_products = [...buf.slice(-(50 - 1)), entry];
      }
    }

    if (progress.request_count % 3 === 0 || added > 0) {
      await onProgress({ ...progress });
    }

    nextUrl = (data?.cursor?.next as string | null) ?? null;
  }

  return added;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function walkStore(
  storeId:        string,
  homepageCatUrls: string[],
  onProgress:     (p: WalkProgress) => Promise<void>,
): Promise<NormalizedProduct[]> {
  const products = new Map<number, NormalizedProduct>();
  const progress: WalkProgress = {
    phase:               "latest",
    products_found:      0,
    images_found:        0,
    request_count:       0,
    categories_crawled:  [],
    brands_crawled:      [],
  };

  await onProgress({ ...progress });

  // ── Axis 1: source=latest ─────────────────────────────────────────────────
  await walkCursor(storeId, buildProductsUrl("latest"), "latest", products, progress, onProgress);

  // ── Crawl category HTML pages for sub-category IDs (one level deep) ───────
  progress.phase = "crawling-categories";
  await onProgress({ ...progress });

  const catUrlSet = new Set<string>(homepageCatUrls);
  for (const catUrl of homepageCatUrls) {
    const subs = await crawlCategoryPage(catUrl);
    progress.request_count++;
    for (const u of subs) catUrlSet.add(u);
  }

  // ── Axes 2–4: categories → brands, repeated ───────────────────────────────
  const walkedCatIds  = new Set<string>();
  const walkedBrandIds = new Set<number>();

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let roundAdded = 0;

    // Mine category URLs from already-found products (in case API returned them)
    for (const p of products.values()) {
      if (p.category_url) catUrlSet.add(p.category_url);
    }

    // Walk unseen categories
    for (const catUrl of catUrlSet) {
      const catId = extractCatId(catUrl);
      if (!catId || walkedCatIds.has(catId)) continue;
      walkedCatIds.add(catId);
      progress.categories_crawled = [...walkedCatIds];
      progress.phase = `category:${catId}`;
      await onProgress({ ...progress });

      const added = await walkCursor(
        storeId,
        buildProductsUrl("categories", [catId]),
        `category:${catId}`,
        products, progress, onProgress,
      );
      roundAdded += added;
    }

    // Mine brand IDs from all found products
    for (const p of products.values()) {
      if (p.brand_id !== null) walkedBrandIds; // collect below
    }

    // Walk unseen brands
    const allBrandIds = new Set<number>(
      [...products.values()].filter(p => p.brand_id !== null).map(p => p.brand_id as number),
    );

    for (const brandId of allBrandIds) {
      if (walkedBrandIds.has(brandId)) continue;
      walkedBrandIds.add(brandId);
      progress.brands_crawled = [...walkedBrandIds].map(String);
      progress.phase = `brand:${brandId}`;
      await onProgress({ ...progress });

      const added = await walkCursor(
        storeId,
        buildProductsUrl("brands", [String(brandId)]),
        `brand:${brandId}`,
        products, progress, onProgress,
      );
      roundAdded += added;
    }

    if (roundAdded === 0) break;
  }

  return [...products.values()];
}
