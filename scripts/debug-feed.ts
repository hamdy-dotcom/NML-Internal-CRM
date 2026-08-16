/**
 * Runs a live progress trace: resolves bamcostore, walks source=latest to
 * exhaustion, and prints each progress event so we can confirm recent_products
 * is populated and the popup would have live data to render.
 *
 * Usage:
 *   npx tsx scripts/debug-feed.ts [storeUrl]
 */

import { resolveStore } from "../src/lib/salla/resolver";
import { walkStore }    from "../src/lib/salla/walker";
import type { WalkProgress } from "../src/lib/salla/types";

const STORE_URL = process.argv[2] ?? "bamcostore.com";

async function main() {
  console.log(`\n=== debug-feed: ${STORE_URL} ===\n`);

  const resolved = await resolveStore(STORE_URL);
  if (!resolved) { console.error("resolveStore failed"); process.exit(1); }
  console.log(`Store ID: ${resolved.storeId}\n`);

  let updateCount = 0;
  const start = Date.now();

  await walkStore(resolved.storeId, resolved.categoryUrls, async (p: WalkProgress) => {
    updateCount++;
    const sec = ((Date.now() - start) / 1000).toFixed(1);
    const buf = p.recent_products ?? [];

    console.log(
      `[${sec}s] update #${updateCount}  phase=${p.phase}  ` +
      `products=${p.products_found}  feed=${buf.length} items`,
    );

    if (buf.length > 0) {
      const newest = buf[buf.length - 1];
      console.log(
        `         newest: id=${newest.salla_id} (${typeof newest.salla_id}) ` +
        `"${newest.name.slice(0, 50)}" sku=${newest.sku ?? "null"} price=${newest.price}`,
      );
    }

    // Stop after 20 updates so the script exits quickly
    if (updateCount >= 20) {
      console.log("\n[stopped after 20 updates — feed is working]\n");
      process.exit(0);
    }
  });

  console.log(`\nWalk complete — ${updateCount} progress events emitted`);
}

main().catch(e => { console.error(e); process.exit(1); });
