import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { parseProductRow } from "../preview/route";

const READY_STAGES = new Set(["cta_completed", "onboarding", "active", "paused"]);

interface ImportRequest {
  merchantId: string;
  merchantStage: string;
  rows: Record<string, string>[];
}

const BATCH = 500;

export async function POST(req: NextRequest) {
  const { merchantId, merchantStage, rows } = (await req.json()) as ImportRequest;
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      function send(msg: object) {
        ctrl.enqueue(enc.encode(JSON.stringify(msg) + "\n"));
      }

      try {
        const productStatus = READY_STAGES.has(merchantStage) ? "ready_for_shelf" : "discovered";
        const parsed = rows.map(parseProductRow);

        // Existing SKU map for this merchant
        const skus = parsed.map(p => p.sku).filter(Boolean);
        const skuIdMap = new Map<string, string>();
        if (skus.length) {
          const { data } = await adminClient
            .from("products")
            .select("id, sku")
            .eq("merchant_id", merchantId)
            .in("sku", skus);
          for (const p of (data ?? []) as { id: string; sku: string | null }[]) {
            if (p.sku) skuIdMap.set(p.sku, p.id);
          }
        }

        const toInsert: object[] = [];
        const toUpdate: { id: string; price: number | null; nml_cost: number | null; stock: number | null }[] = [];

        for (const p of parsed) {
          if (!p.name) continue;
          if (p.sku && skuIdMap.has(p.sku)) {
            toUpdate.push({ id: skuIdMap.get(p.sku)!, price: p.price, nml_cost: p.nml_cost, stock: p.stock });
          } else {
            toInsert.push({
              merchant_id: merchantId,
              name: p.name,
              sku:  p.sku || null,
              url:  p.url || null,
              image_url: p.image_url || null,
              category:  p.category || null,
              brand:     p.brand || null,
              price:     p.price,
              nml_cost:  p.nml_cost,
              stock:     p.stock,
              review_notes: p.notes || null,
              raw: p.barcode ? { barcode: p.barcode } : null,
              source: "merchant_file",
              status: productStatus,
            });
          }
        }

        const total = toInsert.length + toUpdate.length;
        let done = 0;

        // INSERT new products in chunks
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const chunk = toInsert.slice(i, i + BATCH);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await adminClient.from("products").insert(chunk as any);
          done += chunk.length;
          send({ progress: done, total });
        }

        // UPDATE existing products (price, cost, stock)
        for (const u of toUpdate) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (adminClient.from("products") as any)
            .update({ price: u.price, nml_cost: u.nml_cost, stock: u.stock })
            .eq("id", u.id);
          done++;
          send({ progress: done, total });
        }

        send({ result: { imported: toInsert.length, updated: toUpdate.length }, progress: total, total });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : "Import failed" });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
