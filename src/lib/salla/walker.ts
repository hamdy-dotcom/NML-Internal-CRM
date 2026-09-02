// Catalog walker: multi-axis discovery for Salla storefronts.
//
// Axes (per brief §3):
//   1. source=latest      — walk cursor to exhaustion
//   2. HTML cat crawl     — mine sub-category IDs from category page HTML
//   3. source=categories  — walk each category ID (4 concurrent, shared seen-set)
//   4. source=brands      — walk each brand ID mined from found products
//   5. Repeat 3–4 up to MAX_ROUNDS, stop when a round adds nothing new
//
// Sweep skip: if latest returns > LATEST_RICH_THRESHOLD products the category +
//   brand sweeps are skipped entirely (the sweep exists only to work around the
//   ~636-product cap on small stores; large stores are already covered by latest).
//
// Hard ceiling: any job that makes more than REQUEST_CEILING total requests stops
//   immediately with stop_reason "request ceiling".
//
// Early-stop: dry streak of STALE_LIMIT consecutive zero-yield categories.
//
// Category skip: if the Salla category listing reports N products for a category
//   and we already hold N products tagged to that catId, the walk is skipped.
//
// Incremental flush: onFlush (optional) is called every FLUSH_EVERY new products.

import type { NormalizedProduct, RecentProduct, WalkProgress } from "./types";

const SALLA_API    = "https://api.salla.dev/store/v1";
const UA           = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
                     "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DEFAULT_DELAY          = 100;    // ms between requests; auto-backs off on 429
const MAX_RETRIES            = 5;
const MAX_ROUNDS             = 4;
const STALE_LIMIT            = 40;    // consecutive zero-yield categories → stop
const FLUSH_EVERY            = 2000;  // call onFlush each time this many new products accumulate
const CAT_CONCURRENCY        = 4;     // parallel category walks (shared seen-set)
const LATEST_RICH_THRESHOLD  = 2_000; // skip sweeps when latest yields more than this
const REQUEST_CEILING        = 3_000; // hard stop: no single job exceeds this many requests

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

// ── Stop signal ───────────────────────────────────────────────────────────────
// A shared mutable object threaded into walkCursor so in-flight page iterations
// halt within one request (≤ delayMs + one fetch timeout) once stoppedEarly fires.

interface StopSignal { stopped: boolean }

// ── Typed HTTP errors ─────────────────────────────────────────────────────────

export class HttpError extends Error {
  constructor(public readonly status: number, url: string) {
    super(`HTTP ${status}: ${url}`);
  }
}

// ── Shared rate state ─────────────────────────────────────────────────────────
// All concurrent walkCursor calls share one RateState so a 429 on any request
// backs off the whole batch, not just the one that was rate-limited.

interface RateState {
  delayMs: number;   // current inter-request delay
  minMs:   number;   // floor (the configured baseline)
}

function onRateLimit(rate: RateState) {
  rate.delayMs = Math.min(rate.delayMs * 2, 8_000);
}

function onRequestSuccess(rate: RateState) {
  // Slowly recover toward the minimum after successful requests.
  if (rate.delayMs > rate.minMs) {
    rate.delayMs = Math.max(rate.delayMs * 0.9, rate.minMs);
  }
}

// ── Salla API fetcher with retry / 429 + 422 backoff ─────────────────────────
//
// 410  — store gone; thrown immediately, no retries (caller decides action).
// 422  — transient API error; retried up to MAX_RETRIES with local backoff.
// 429  — rate-limit; retried with backoff, rate.delayMs raised globally.
// Other non-2xx — retried up to MAX_RETRIES, then thrown as HttpError.

async function sallaFetch(
  storeId: string,
  url:     string,
  rate:    RateState,
): Promise<unknown> {
  await sleep(rate.delayMs);

  let localBackoff = 500;
  let lastErr: Error | null = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    if (attempt > 0) await sleep(localBackoff);

    try {
      const res = await fetch(url, {
        headers: { "store-identifier": storeId, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 429) {
        onRateLimit(rate);
        localBackoff = Math.min(localBackoff * 2, 8_000);
        await sleep(rate.delayMs); // shared backoff on top of local
        continue; // don't count as an attempt
      }
      if (res.status === 410) throw new HttpError(410, url); // no retry
      if (res.status === 422) {
        lastErr = new HttpError(422, url);
        attempt++;
        localBackoff = Math.min(localBackoff * 2, 16_000);
        continue;
      }
      if (!res.ok) {
        lastErr = new HttpError(res.status, url);
        attempt++;
        localBackoff = Math.min(localBackoff * 2, 8_000);
        continue;
      }

      onRequestSuccess(rate);
      return await res.json();
    } catch (e) {
      if (e instanceof HttpError && e.status === 410) throw e;
      lastErr = e as Error;
      attempt++;
      localBackoff = Math.min(localBackoff * 2, 8_000);
    }
  }

  throw lastErr ?? new Error(`sallaFetch failed after ${MAX_RETRIES} attempts: ${url}`);
}

// ── HTML category-page crawler ────────────────────────────────────────────────

async function crawlCategoryPage(url: string): Promise<string[]> {
  try {
    await sleep(DEFAULT_DELAY);
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

// ── Category listing (product counts per category) ────────────────────────────
// Fetched once before the sweep so we can skip fully-covered categories.
// Non-fatal: if the listing call fails, returns an empty map and all categories
// will be walked normally.

async function fetchCategoryListing(
  storeId: string,
  rate:    RateState,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let url: string | null = `${SALLA_API}/categories?limit=50`;

  while (url) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await sallaFetch(storeId, url, rate) as Record<string, any>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const cat of ((data?.data as Record<string, any>[]) ?? [])) {
        const id    = String(cat?.id ?? "");
        const count = typeof cat?.product_count === "number" ? cat.product_count as number : -1;
        if (id) counts.set(id, count);
      }
      url = (data?.cursor?.next as string | null) ?? null;
    } catch {
      break; // non-fatal; walk all categories
    }
  }

  return counts;
}

// Count products we already hold that are tagged to a given catId.
// Products store their category URL; the catId appears as /c{catId} in that URL.
function heldForCat(products: Map<number, NormalizedProduct>, catId: string): number {
  let n = 0;
  for (const p of products.values()) {
    if (p.category_url && extractCatId(p.category_url) === catId) n++;
  }
  return n;
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
  rate:       RateState,
  stop:       StopSignal,
): Promise<number> {
  let added = 0;
  let nextUrl: string | null = startUrl;

  while (nextUrl) {
    if (stop.stopped) break; // exit immediately when the sweep is aborted
    if (progress.request_count >= REQUEST_CEILING) {
      stop.stopped = true; // signal all concurrent walkers to stop
      break;
    }
    progress.request_count++;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data  = (await sallaFetch(storeId, nextUrl, rate)) as Record<string, any>;
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

// ── Concurrent pool ───────────────────────────────────────────────────────────

async function runPool<T>(
  items:       T[],
  concurrency: number,
  fn:          (item: T) => Promise<void>,
  shouldStop?: () => boolean,
): Promise<void> {
  const queue = [...items];
  async function worker() {
    while (queue.length > 0) {
      if (shouldStop?.()) break; // exit cleanly — don't drain remaining items
      const item = queue.shift();
      if (item === undefined) break;
      await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, worker),
  );
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
  /** Inter-request delay in ms (default: 100). Auto-backs off on 429. */
  delayMs?: number;
}

export async function walkStore(
  storeId:         string,
  homepageCatUrls: string[],
  onProgress:      (p: WalkProgress) => Promise<void>,
  opts:            WalkOpts = {},
): Promise<NormalizedProduct[]> {
  const { onFlush, resume } = opts;
  const rate: RateState = {
    delayMs: opts.delayMs ?? DEFAULT_DELAY,
    minMs:   opts.delayMs ?? DEFAULT_DELAY,
  };

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

  // Shared stop signal: set .stopped = true whenever stoppedEarly fires.
  // walkCursor checks this at the top of each page iteration so in-flight
  // requests drain within one fetch round-trip (≤ delayMs + 30 s timeout).
  const stopSignal: StopSignal = { stopped: false };

  // ── Incremental flush ─────────────────────────────────────────────────────
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
  if (!resume) {
    await walkCursor(storeId, buildProductsUrl("latest"), "latest", products, progress, onProgress, rate, stopSignal);
    await maybeFlush();
  }

  // ── Ceiling / sweep-skip gate ─────────────────────────────────────────────
  // Stop immediately if the hard request ceiling was hit during latest.
  if (stopSignal.stopped) {
    progress.stop_reason = `request ceiling reached (${progress.request_count.toLocaleString()} requests)`;
    await onProgress({ ...progress });
    return [...products.values()];
  }
  // Skip category + brand sweeps when latest already found enough products:
  // the sweep exists only to work around the ~636-product cap on small stores.
  if (products.size > LATEST_RICH_THRESHOLD) {
    progress.stop_reason = "latest pass complete, sweep skipped";
    await onProgress({ ...progress });
    return [...products.values()];
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

  // Fetch category product counts once — used to skip already-covered categories.
  progress.phase = "prefetching-categories";
  await onProgress({ ...progress });
  const catProductCounts = await fetchCategoryListing(storeId, rate);

  // ── Axes 2–4: categories → brands, repeated ───────────────────────────────

  let stoppedEarly = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (stoppedEarly) break;
    let roundAdded = 0;

    // Mine category URLs from already-found products
    for (const p of products.values()) {
      if (p.category_url) catUrlSet.add(p.category_url);
    }

    progress.category_total = countCatIds(catUrlSet);

    // Build the list of unseen categories for this round.
    // Mark them all as walked synchronously before any await to prevent
    // concurrent workers from picking the same category.
    const pending: { catId: string }[] = [];
    for (const catUrl of catUrlSet) {
      const catId = extractCatId(catUrl);
      if (!catId || walkedCatIds.has(catId)) continue;

      // Skip if the category's product count is already fully covered.
      const expected = catProductCounts.get(catId) ?? -1;
      if (expected >= 0 && heldForCat(products, catId) >= expected) {
        walkedCatIds.add(catId); // mark as done so progress counts it
        progress.category_index = walkedCatIds.size;
        continue;
      }

      walkedCatIds.add(catId); // lock synchronously before pool starts
      pending.push({ catId });
    }

    let dryStreak = 0;

    await runPool(pending, CAT_CONCURRENCY, async ({ catId }) => {
      progress.categories_crawled = [...walkedCatIds];
      progress.category_index     = walkedCatIds.size;
      progress.category_total     = countCatIds(catUrlSet);
      progress.phase              = `category:${catId}`;
      progress.walked_cat_ids     = [...walkedCatIds];
      await onProgress({ ...progress });

      let added = 0;
      try {
        added = await walkCursor(
          storeId,
          buildProductsUrl("categories", [catId]),
          `category:${catId}`,
          products, progress, onProgress, rate, stopSignal,
        );
        // Ceiling hit inside walkCursor — propagate as early stop.
        if (stopSignal.stopped && !stoppedEarly && !progress.stop_reason) {
          progress.stop_reason = `request ceiling reached (${progress.request_count.toLocaleString()} requests)`;
          await onProgress({ ...progress });
          stoppedEarly = true;
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 410) throw e;
        const reason =
          `Stopped at category ${walkedCatIds.size}/${progress.category_total ?? "?"} ` +
          `— ${e instanceof Error ? e.message : String(e)}`;
        progress.stop_reason = reason;
        await onProgress({ ...progress });
        stoppedEarly = true; stopSignal.stopped = true;
        return;
      }

      roundAdded += added;
      await maybeFlush();

      // Dry-streak check (resets on any yield)
      if (added === 0) {
        dryStreak++;
        if (dryStreak >= STALE_LIMIT) {
          const reason =
            `${STALE_LIMIT} consecutive categories with no new products ` +
            `(${walkedCatIds.size} of ${progress.category_total} walked)`;
          progress.stop_reason = reason;
          await onProgress({ ...progress });
          stoppedEarly = true; stopSignal.stopped = true;
        }
      } else {
        dryStreak = 0;
      }
    }, () => stoppedEarly);

    if (stoppedEarly) break;

    // Mine brand IDs from all found products
    const allBrandIds = new Set<number>(
      [...products.values()]
        .filter(p => p.brand_id !== null)
        .map(p => p.brand_id as number),
    );

    for (const brandId of allBrandIds) {
      if (walkedBrandIds.has(brandId)) continue;
      walkedBrandIds.add(brandId);
      progress.brands_crawled   = [...walkedBrandIds].map(String);
      progress.walked_brand_ids = [...walkedBrandIds];
      progress.phase            = `brand:${brandId}`;
      await onProgress({ ...progress });

      let added = 0;
      try {
        added = await walkCursor(
          storeId,
          buildProductsUrl("brands", [String(brandId)]),
          `brand:${brandId}`,
          products, progress, onProgress, rate, stopSignal,
        );
        // Ceiling hit inside walkCursor during brand walk.
        if (stopSignal.stopped && !stoppedEarly && !progress.stop_reason) {
          progress.stop_reason = `request ceiling reached (${progress.request_count.toLocaleString()} requests)`;
          await onProgress({ ...progress });
          stoppedEarly = true;
        }
      } catch (e) {
        if (e instanceof HttpError && e.status === 410) throw e;
        console.warn(`brand:${brandId} walk failed — ${e instanceof Error ? e.message : e}; skipping`);
        added = 0;
      }
      roundAdded += added;
      await maybeFlush();
      if (stoppedEarly) break;
    }

    if (roundAdded === 0) break;
  }

  return [...products.values()];
}
