// Catalog walker: multi-axis discovery for Salla storefronts.
//
// Axes (per brief §3):
//   1. source=latest      — walk cursor to exhaustion
//   2. HTML cat crawl     — mine sub-category IDs from category page HTML
//   3. source=categories  — walk each category ID
//   4. source=brands      — walk each brand ID mined from found products
//   5. Repeat 3–4 up to MAX_ROUNDS, stop when a round adds nothing new
//
// Early-stop: if STALE_LIMIT consecutive categories add zero new product IDs,
// the category sweep ends and the reason is logged in progress.stop_reason.
//
// Incremental flush: onFlush (optional) is called every FLUSH_EVERY new
// products so callers can persist a snapshot before the walk completes.

import type { NormalizedProduct, RecentProduct, WalkProgress } from "./types";

const SALLA_API   = "https://api.salla.dev/store/v1";
const UA          = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DELAY_MS    = 200;
const MAX_RETRIES = 5;
const MAX_ROUNDS  = 4;
const STALE_LIMIT = 40;    // consecutive no-new-product categories → stop sweep
const FLUSH_EVERY = 2000;  // call onFlush each time this many new products accumulate

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function buildProductsUrl(source: string, sourceValues?: string[]): string {
  const parts = [`source=${source}`, "limit=50"];
  for (const v of sourceValues ?? []) parts.push(`source_value[]=${v}`);
  return `${SALLA_API}/products?${parts.join("&")}`;
}

function extractCatId(url: string): string | null {
  return url.match(/\/c(\d+)/)?.[1] ?? null;
}

function countCatIds(catUrlSet: Set<string>): number {
  let n = 0;
  for (const u of catUrlSet) { if (extractCatId(u)) n++; }
  return n;
}

// ── Typed HTTP errors ─────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status}: ${url}`);
  }
}

// ── Salla API fetcher with retry / 429 + 422 backoff ─────────────────────────
//
// 410  — store gone; thrown immediately, no retries (caller decides action).
// 422  — transient API error; retried up to MAX_RETRIES with backoff.
// 429  — rate-limit; retried with backoff (not counted as an attempt).
// Other non-2xx — retried up to MAX_RETRIES, then thrown as HttpError.

async function sallaFetch(storeId: string, url: string): Promise<unknown> {
  let backoff = 500;
  let lastErr: Error | null = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    if (attempt > 0) await sleep(backoff);

    try {
      const res = await fetch(url, {
        headers: { "store-identifier": storeId, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429) {
        backoff = Math.min(backoff * 2, 8_000);
        continue; // don't increment attempt — rate-limit is not an attempt
      }
      if (res.status === 410) throw new HttpError(410, url); // no retry
      if (res.status === 422) {
        lastErr = new HttpError(422, url);
        attempt++;
        backoff = Math.min(backoff * 2, 16_000);
        continue;
      }
      if (!res.ok) {
        lastErr = new HttpError(res.status, url);
        attempt++;
        backoff = Math.min(backoff * 2, 8_000);
        continue;
      }
      return await res.json();
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) throw e; // propagate immediately
      lastErr = e as Error;
      attempt++;
      backoff = Math.min(backoff * 2, 8_000);
    }
  }
  throw lastErr ?? new Error(`sallaFetch failed after ${MAX_RETRIES} attempts: ${url}`);
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
    salla_id:        Number(raw.id),
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
    images:          [],
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
  storeId:    string,
  startUrl:   string,
  foundVia:   string,
  products:   Map<number, NormalizedProduct>,
  progress:   WalkProgress,
  onProgress: (p: WalkProgress) => Promise<void>,
): Promise<number> {
  let added = 0;
  let nextUrl: string | null = startUrl;

  while (nextUrl) {
    await sleep(DELAY_MS);
    progress.request_count++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data  = (await sallaFetch(storeId, nextUrl)) as Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: Record<string, any>[] = (data?.data as Record<string, any>[]) ?? [];

    for (const raw of items) {
      const id = raw.id as number;
      if (!products.has(id)) {
        const np = normalizeProduct(raw, foundVia);
        products.set(id, np);
        added++;
        progress.products_found = products.size;
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

export interface WalkOpts {
  /** Called every FLUSH_EVERY new products with the full snapshot so far. */
  onFlush?: (products: NormalizedProduct[]) => Promise<void>;
  /** Resume from a prior checkpoint (skips already-walked categories/brands). */
  resume?: {
    walkedCatIds:   string[];
    walkedBrandIds: number[];
    knownProducts:  NormalizedProduct[];
  };
}

export async function walkStore(
  storeId:         string,
  homepageCatUrls: string[],
  onProgress:      (p: WalkProgress) => Promise<void>,
  opts:            WalkOpts = {},
): Promise<NormalizedProduct[]> {
  const { onFlush, resume } = opts;

  const products = new Map<number, NormalizedProduct>(
    resume?.knownProducts.map(p => [p.salla_id, p]) ?? [],
  );

  const progress: WalkProgress = {
    phase:               "latest",
    products_found:      products.size,
    images_found:        0,
    request_count:       0,
    categories_crawled:  resume?.walkedCatIds  ?? [],
    brands_crawled:      resume?.walkedBrandIds.map(String) ?? [],
    category_index:      resume?.walkedCatIds.length ?? 0,
    category_total:      0,
    walked_cat_ids:      resume?.walkedCatIds  ?? [],
    walked_brand_ids:    resume?.walkedBrandIds ?? [],
  };

  await onProgress({ ...progress });

  // Declare before maybeFlush so the closure doesn't hit the TDZ.
  const walkedCatIds   = new Set<string>(resume?.walkedCatIds   ?? []);
  const walkedBrandIds = new Set<number>(resume?.walkedBrandIds ?? []);

  // ── Incremental flush tracker ─────────────────────────────────────────────
  let lastFlushedCount = products.size;
  async function maybeFlush() {
    if (!onFlush) return;
    if (products.size - lastFlushedCount >= FLUSH_EVERY) {
      lastFlushedCount = products.size;
      progress.walked_cat_ids   = [...walkedCatIds];
      progress.walked_brand_ids = [...walkedBrandIds];
      await onFlush([...products.values()]);
    }
  }

  // ── Axis 1: source=latest ─────────────────────────────────────────────────
  // Any HttpError here propagates straight to processJob (no partial to save yet).
  if (!resume) {
    await walkCursor(storeId, buildProductsUrl("latest"), "latest", products, progress, onProgress);
    await maybeFlush();
  }

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

  let dryStreak = 0;
  let stoppedEarly = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (stoppedEarly) break;
    let roundAdded = 0;

    // Mine category URLs from already-found products
    for (const p of products.values()) {
      if (p.category_url) catUrlSet.add(p.category_url);
    }

    // Update total known categories before this batch
    progress.category_total = countCatIds(catUrlSet);

    // Walk unseen categories
    for (const catUrl of catUrlSet) {
      if (stoppedEarly) break;
      const catId = extractCatId(catUrl);
      if (!catId || walkedCatIds.has(catId)) continue;
      walkedCatIds.add(catId);

      progress.categories_crawled = [...walkedCatIds];
      progress.category_index     = walkedCatIds.size;
      progress.category_total     = countCatIds(catUrlSet);
      progress.phase              = `category:${catId}`;
      progress.walked_cat_ids     = [...walkedCatIds];
      await onProgress({ ...progress });

      let added: number;
      try {
        added = await walkCursor(
          storeId,
          buildProductsUrl("categories", [catId]),
          `category:${catId}`,
          products, progress, onProgress,
        );
      } catch (e) {
        if (e instanceof HttpError && e.status === 410) throw e; // store gone — propagate
        // 422 or other transient error mid-sweep: record partial coverage and stop.
        const reason = `Stopped at category ${walkedCatIds.size}/${progress.category_total ?? "?"} — ${e instanceof Error ? e.message : String(e)}`;
        progress.stop_reason = reason;
        await onProgress({ ...progress });
        stoppedEarly = true;
        break;
      }
      roundAdded += added;
      await maybeFlush();

      if (added === 0) {
        dryStreak++;
        if (dryStreak >= STALE_LIMIT) {
          const reason =
            `${STALE_LIMIT} consecutive categories with no new products ` +
            `(${walkedCatIds.size} of ${progress.category_total} walked)`;
          progress.stop_reason = reason;
          await onProgress({ ...progress });
          stoppedEarly = true;
          break;
        }
      } else {
        dryStreak = 0;
      }
    }

    // Mine brand IDs from all found products
    const allBrandIds = new Set<number>(
      [...products.values()].filter(p => p.brand_id !== null).map(p => p.brand_id as number),
    );

    for (const brandId of allBrandIds) {
      if (walkedBrandIds.has(brandId)) continue;
      walkedBrandIds.add(brandId);
      progress.brands_crawled   = [...walkedBrandIds].map(String);
      progress.walked_brand_ids = [...walkedBrandIds];
      progress.phase            = `brand:${brandId}`;
      await onProgress({ ...progress });

      let added: number;
      try {
        added = await walkCursor(
          storeId,
          buildProductsUrl("brands", [String(brandId)]),
          `brand:${brandId}`,
          products, progress, onProgress,
        );
      } catch (e) {
        if (e instanceof HttpError && e.status === 410) throw e;
        // Brand walk failed — log and continue to next brand.
        console.warn(`brand:${brandId} walk failed — ${e instanceof Error ? e.message : e}; skipping`);
        added = 0;
      }
      roundAdded += added;
      await maybeFlush();
    }

    if (roundAdded === 0) break;
  }

  return [...products.values()];
}
