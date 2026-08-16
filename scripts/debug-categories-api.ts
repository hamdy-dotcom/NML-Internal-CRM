/**
 * Tests whether the Salla API has a /categories listing endpoint and whether
 * its category IDs yield products beyond what source=latest returns.
 */
const STORE = "692526850";
const API   = "https://api.salla.dev/store/v1";

async function get(url: string) {
  const r = await fetch(url, {
    headers: { "store-identifier": STORE, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  return { status: r.status, text: await r.text() };
}

async function main() {
  // Build the source=latest ID set (all pages)
  console.log("── Building source=latest full ID set ───────────────────────────");
  const latestIds = new Set<string>();
  let next: string | null = `${API}/products?source=latest&limit=50`;
  while (next) {
    const r = await get(next);
    const body = JSON.parse(r.text) as Record<string, unknown>;
    const items = (body.data as { id: unknown }[]) ?? [];
    for (const p of items) latestIds.add(String(p.id));
    next = (body.cursor as Record<string, unknown>)?.next as string | null ?? null;
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`  source=latest total: ${latestIds.size} products\n`);

  // Test /categories listing endpoint
  console.log("── GET /categories ───────────────────────────────────────────────");
  const catList = await get(`${API}/categories?limit=50`);
  console.log(`  HTTP ${catList.status}`);
  console.log(`  raw[0:500]: ${catList.text.slice(0, 500)}\n`);

  if (catList.status === 200) {
    const catBody = JSON.parse(catList.text) as Record<string, unknown>;
    const cats = (catBody.data as { id: unknown; name?: string }[]) ?? [];
    console.log(`  ${cats.length} categories returned`);

    // Walk the first few for new products
    for (const cat of cats.slice(0, 5)) {
      const catId = String(cat.id);
      const catUrl = `${API}/products?source=categories&limit=50&source_value[]=${catId}`;
      const r = await get(catUrl);
      const b = JSON.parse(r.text) as Record<string, unknown>;
      const items = (b.data as { id: unknown }[]) ?? [];
      const newProducts = items.filter(p => !latestIds.has(String(p.id)));
      console.log(`  cat id=${catId} "${cat.name}" → ${items.length} products, ${newProducts.length} NEW`);
      if (newProducts.length > 0) {
        console.log(`    sample new IDs: ${newProducts.slice(0, 3).map(p => p.id).join(", ")}`);
      }
    }
  }

  // Also test /categories with pagination to see how many exist
  console.log("\n── Total categories via /categories?limit=100 ────────────────────");
  const catAll = await get(`${API}/categories?limit=100`);
  if (catAll.status === 200) {
    const b = JSON.parse(catAll.text) as Record<string, unknown>;
    const cats = (b.data as { id: unknown; name?: string }[]) ?? [];
    console.log(`  First page: ${cats.length} categories`);
    cats.slice(0, 20).forEach(c => console.log(`    id=${c.id}  "${c.name}"`));
  }

  // Test /categories/tree for nested structure
  console.log("\n── GET /categories/tree ─────────────────────────────────────────");
  const tree = await get(`${API}/categories/tree`);
  console.log(`  HTTP ${tree.status}`);
  console.log(`  raw[0:300]: ${tree.text.slice(0, 300)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
