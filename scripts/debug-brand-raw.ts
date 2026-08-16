const STORE = "692526850";
const API   = "https://api.salla.dev/store/v1";

async function get(url: string) {
  const r = await fetch(url, { headers: { "store-identifier": STORE, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

async function main() {
  // Raw product data — what does brand field look like?
  const latest = await get(`${API}/products?source=latest&limit=3`);
  const items = (latest.body.data as Record<string, unknown>[]) ?? [];
  console.log("=== source=latest product[0] brand + category fields ===");
  console.log("brand   :", JSON.stringify((items[0] as Record<string, unknown>)?.brand));
  console.log("category:", JSON.stringify((items[0] as Record<string, unknown>)?.category));
  console.log();

  // Try source=brands with wixsana brand ID 1947709337
  console.log("=== source=brands&source_value[]=1947709337 ===");
  const brands = await get(`${API}/products?source=brands&limit=10&source_value[]=1947709337`);
  console.log("HTTP", brands.status, "products:", (brands.body.data as unknown[])?.length ?? "N/A");
  const bItems = (brands.body.data as Record<string, unknown>[]) ?? [];
  if (bItems.length > 0) {
    const allLatestIds = new Set(items.map(p => String((p as Record<string, unknown>).id)));
    const bp = bItems[0] as Record<string, unknown>;
    console.log("brand product[0] id:", bp.id, "typeof:", typeof bp.id);
    console.log("brand product[0] name:", String(bp.name).slice(0, 60));
    console.log("already in source=latest set?", allLatestIds.has(String(bp.id)));
  }

  // How many total from brands?
  let total = 0, next: string | null = `${API}/products?source=brands&limit=50&source_value[]=1947709337`;
  while (next) {
    const r = await get(next);
    const d = (r.body.data as unknown[]) ?? [];
    total += d.length;
    next = (r.body as Record<string, unknown>)?.cursor != null
      ? ((r.body as Record<string, unknown>).cursor as Record<string, unknown>)?.next as string | null
      : null;
    if (total > 1000) { console.log("stopped at 1000"); break; }
  }
  console.log("Total via source=brands (brand 1947709337):", total);
}

main().catch(e => { console.error(e); process.exit(1); });
