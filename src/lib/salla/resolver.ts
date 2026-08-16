// Resolves a Salla store's numeric ID and category URLs from its public homepage.
// Runs server-side (route handler or worker). Not safe to call from the browser.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ResolvedStore {
  storeId:      string;
  categoryUrls: string[];
}

export async function resolveStore(rawUrl: string): Promise<ResolvedStore | null> {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  let html: string;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    return null;
  }

  let storeId: string | null = null;

  // Pattern 1: "id":<digits> in a ~1600-byte window around api.salla.dev/store/v1
  const apiIdx = html.indexOf("api.salla.dev/store/v1");
  if (apiIdx !== -1) {
    const win = html.slice(Math.max(0, apiIdx - 800), apiIdx + 800);
    storeId = win.match(/"id"\s*:\s*(\d{4,})/)?.[1] ?? null;
  }

  // Pattern 2: cdn.files.salla.network/homepage/<digits>  ← verified hit on bamcostore
  if (!storeId) {
    storeId = html.match(/cdn\.files\.salla\.network\/homepage\/(\d+)/)?.[1] ?? null;
  }

  // Pattern 3: store-identifier literal in the bundle
  if (!storeId) {
    storeId = html.match(/store-identifier["'\s]*:["'\s]*(\d{4,})/)?.[1] ?? null;
  }

  // Pattern 4: loose fallback — first "id":<8+ digits> in the whole page
  if (!storeId) {
    storeId = html.match(/"id"\s*:\s*(\d{8,})/)?.[1] ?? null;
  }

  if (!storeId) return null;

  // Collect /c<digits> href values from homepage HTML for the category-crawl phase
  const base = new URL(url).origin;
  const catSet = new Set<string>();
  const catRe = /href="([^"#?]*\/c\d+[^"#?]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = catRe.exec(html)) !== null) {
    const href = m[1];
    catSet.add(href.startsWith("http") ? href : `${base}${href}`);
  }

  return { storeId, categoryUrls: [...catSet] };
}
