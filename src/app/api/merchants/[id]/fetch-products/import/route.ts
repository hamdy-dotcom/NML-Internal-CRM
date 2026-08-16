// POST /api/merchants/[id]/fetch-products/import
// Imports selected products from a completed salla_fetch_jobs record into
// the products table. Uses upsert on (merchant_id, salla_product_id) so
// re-fetching a store updates prices/stock instead of duplicating rows.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient }  from "@/lib/supabase/admin";
import type { NormalizedProduct } from "@/lib/salla/types";

interface ImportRequest {
  jobId:           string;
  selectedSallaIds: number[];  // subset the user kept after deselection
}

interface Ctx { params: Promise<{ id: string }> }

const READY_STAGES = new Set(["cta_completed", "onboarding", "active", "paused"]);

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: merchantId } = await ctx.params;

  // Auth
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as ImportRequest;
  const { jobId, selectedSallaIds } = body;
  if (!jobId || !Array.isArray(selectedSallaIds)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = adminClient as any;

  // Load the completed job (admin client — fetched_products can be large)
  const { data: job, error: jErr } = await adminDb.from("salla_fetch_jobs")
    .select("status, fetched_products, merchant_id")
    .eq("id", jobId)
    .eq("merchant_id", merchantId)
    .single();

  if (jErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  if (job.status !== "done") {
    return NextResponse.json({ error: "Job not complete" }, { status: 400 });
  }

  // Resolve merchant stage for status derivation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: merchant } = await (supabase as any).from("merchants")
    .select("stage")
    .eq("id", merchantId)
    .single();

  const productStatus = READY_STAGES.has(merchant?.stage) ? "ready_for_shelf" : "discovered";

  // Filter to selected products
  const allProducts = (job.fetched_products ?? []) as NormalizedProduct[];
  const selectedSet = new Set(selectedSallaIds);
  const toImport = allProducts.filter(p => selectedSet.has(p.salla_id));

  if (!toImport.length) {
    return NextResponse.json({ imported: 0, updated: 0 });
  }

  // Fetch existing salla_product_id set for this merchant (to distinguish insert vs update)
  const { data: existing } = await adminDb.from("products")
    .select("salla_product_id")
    .eq("merchant_id", merchantId)
    .not("salla_product_id", "is", null);

  const existingSet = new Set((existing ?? []).map(
    (r: { salla_product_id: string }) => r.salla_product_id,
  ));

  const now = new Date().toISOString();
  const rows = toImport.map(p => ({
    merchant_id:       merchantId,
    salla_product_id:  String(p.salla_id),
    name:              p.name,
    sku:               p.sku || null,
    image_url:         p.image || null,
    images:            p.images.length ? p.images : null,
    external_url:      p.external_url || null,
    url:               p.external_url || null,
    category:          p.category || null,
    brand:             p.brand || null,
    price:             p.price,
    nml_cost:          null,  // never public; AMs enter manually
    stock:             null,  // `in_stock` boolean is trustworthy; exact qty often null
    raw:               {
      in_stock:    p.in_stock,
      has_options: p.has_options,
      found_via:   p.found_via,
      specs:       p.specs,
    },
    source:            "store_fetch",
    status:            productStatus,
    fetched_at:        now,
  }));

  // Upsert — conflict on (merchant_id, salla_product_id) updates price/images/stock
  const { error: uErr } = await adminDb.from("products").upsert(rows, {
    onConflict: "merchant_id,salla_product_id",
    ignoreDuplicates: false,
  });

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const imported = toImport.filter(p => !existingSet.has(String(p.salla_id))).length;
  const updated  = toImport.length - imported;

  return NextResponse.json({ imported, updated });
}
