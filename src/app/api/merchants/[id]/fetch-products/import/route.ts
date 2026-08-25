// POST /api/merchants/[id]/fetch-products/import
// Imports selected products from a completed salla_fetch_jobs record into
// the products table. Uses upsert on (merchant_id, salla_product_id) so
// re-fetching a store updates prices/stock instead of duplicating rows.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient }  from "@/lib/supabase/admin";
import type { NormalizedProduct } from "@/lib/salla/types";
import { importProducts } from "@/lib/salla/importProducts";

interface ImportRequest {
  jobId:           string;
  selectedSallaIds: number[];  // subset the user kept after deselection
}

interface Ctx { params: Promise<{ id: string }> }

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

  // Filter to selected products
  const allProducts = (job.fetched_products ?? []) as NormalizedProduct[];
  const selectedSet = new Set(selectedSallaIds);
  const toImport = allProducts.filter(p => selectedSet.has(p.salla_id));

  if (!toImport.length) {
    return NextResponse.json({ imported: 0, updated: 0 });
  }

  try {
    const result = await importProducts(merchantId, toImport);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
