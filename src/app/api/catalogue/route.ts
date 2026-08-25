import { adminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const PAGE_SIZE = 100;

// Merchant stages that qualify a product as "ready for shelf".
// A product is shelf-ready when its merchant has reached one of these stages.
export const SHELF_READY_STAGES = ["cta_completed", "onboarding", "active"] as const;

async function getShelfReadyMerchantIds(): Promise<string[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient.from("merchants") as any)
    .select("id")
    .in("stage", SHELF_READY_STAGES);
  if (error) return null;
  return ((data ?? []) as { id: string }[]).map(m => m.id);
}

// GET /api/catalogue?search=&category=&page=0
// GET /api/catalogue?type=categories
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const merchantIds = await getShelfReadyMerchantIds();
  if (!merchantIds) return NextResponse.json({ error: "Failed to resolve merchant list" }, { status: 500 });

  // Category list — distinct mapped categories from active-merchant products, no counts
  if (searchParams.get("type") === "categories") {
    if (!merchantIds.length) return NextResponse.json({ categories: [] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminClient.from("products") as any)
      .select("category_mapped")
      .in("merchant_id", merchantIds)
      .not("category_mapped", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const seen = new Set<string>();
    for (const row of ((data ?? []) as { category_mapped: string }[])) {
      seen.add(row.category_mapped);
    }
    // Preserve NML taxonomy order: sort by Arabic locale
    const categories = [...seen].sort((a, b) => a.localeCompare(b, "ar"));

    return NextResponse.json({ categories });
  }

  // Product listing — explicit column allowlist, never select *
  const search   = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const page     = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  if (!merchantIds.length) {
    return NextResponse.json({ products: [], total: 0, page });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (adminClient.from("products") as any)
    .select("id, name, image_url, category_mapped, price", { count: "exact" })
    .in("merchant_id", merchantIds);

  if (search)   q = q.ilike("name", `%${search}%`);
  if (category) q = q.eq("category_mapped", category);

  const from = page * PAGE_SIZE;
  const { data, error, count } = await (
    q.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1) as any
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ products: data ?? [], total: count ?? 0, page });
}
