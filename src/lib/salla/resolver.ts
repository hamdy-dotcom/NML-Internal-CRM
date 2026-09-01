// Resolves a Salla store's numeric ID and category URLs from its public homepage.
// Runs server-side (route handler or worker). Not safe to call from the browser.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ResolvedStore {
  storeId:      string;
  categoryUrls: string[];
}

/** Fetch a URL and return the HTML, or null on any error / non-2xx. */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Extract a Salla store ID from HTML using four increasingly loose patterns:
 *
 *  1. "id":<digits> in a 1600-byte window around the API base URL
 *  2. cdn.files.salla.network/homepage/<digits>
 *  3. store-identifier literal in the bundle
 *  4. <meta name="store-identifier" content="<digits>">
 *  5. Loose fallback — first "id":<8+ digits> on the page
 */
function extractStoreId(html: string): string | null {
  const apiIdx = html.indexOf("api.salla.dev/store/v1");
  if (apiIdx !== -1) {
    const win = html.slice(Math.max(0, apiIdx - 800), apiIdx + 800);
    const m = win.match(/"id"\s*:\s*(\d{4,})/);
    if (m) return m[1];
  }

  const cdn = html.match(/cdn\.files\.salla\.network\/homepage\/(\d+)/);
  if (cdn) return cdn[1];

  const lit = html.match(/store-identifier["'\s]*:["'\s]*(\d{4,})/);
  if (lit) return lit[1];

  const meta = html.match(/<meta[^>]+name=["']store-identifier["'][^>]+content=["'](\d{4,})["']/i)
            ?? html.match(/<meta[^>]+content=["'](\d{4,})["'][^>]+name=["']store-identifier["']/i);
  if (meta) return meta[1];

  const loose = html.match(/"id"\s*:\s*(\d{8,})/);
  if (loose) return loose[1];

  return null;
}

/** Collect /c<digits> hrefs from HTML for the category-crawl phase. */
function extractCategoryUrls(html: string, base: string): string[] {
  const catSet = new Set<string>();
  const catRe = /href="([^"#?]*\/c\d+[^"#?]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = catRe.exec(html)) !== null) {
    const href = m[1];
    catSet.add(href.startsWith("http") ? href : `${base}${href}`);
  }
  return [...catSet];
}

export async function resolveStore(rawUrl: string): Promise<ResolvedStore | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  // Primary attempt — the URL as given (covers salla.sa/slug and custom domains).
  const html = await fetchHtml(url);
  if (html) {
    const storeId = extractStoreId(html);
    if (storeId) {
      const base = new URL(url).origin;
      return { storeId, categoryUrls: extractCategoryUrls(html, base) };
    }
  }

  // Fallback for custom domains: the merchant's store may redirect from the
  // root to a localised path (e.g. osma.sa → osma.sa/ar). The salla.sa/slug
  // form failed to resolve a store ID, so try the origin directly if the
  // original URL was a salla.sa/slug and the domain looks like a custom one.
  // We also try the plain origin in case the full URL's page had no store ID.
  const parsed = new URL(url);
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    const originHtml = await fetchHtml(parsed.origin + "/");
    if (originHtml) {
      const storeId = extractStoreId(originHtml);
      if (storeId) {
        return { storeId, categoryUrls: extractCategoryUrls(originHtml, parsed.origin) };
      }
    }
  }

  return null;
}
