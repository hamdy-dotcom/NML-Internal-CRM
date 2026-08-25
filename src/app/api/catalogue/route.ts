import { adminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const PAGE_SIZE = 100;

// GET /api/catalogue?search=&category=&page=0
// GET /api/catalogue?type=categories
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  // Category list — counts from ready_for_shelf products only
  if (searchParams.get("type") === "categories") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (adminClient.from("products") as any)
      .select("category_mapped")
      .eq("status", "ready_for_shelf")
      .not("category_mapped", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts: Record<string, number> = {};
    for (const row of ((data ?? []) as { category_mapped: string }[])) {
      counts[row.category_mapped] = (counts[row.category_mapped] ?? 0) + 1;
    }
    const categories = Object.entries(counts)
      .map(([mapped_category, product_count]) => ({ mapped_category, product_count }))
      .sort((a, b) => b.product_count - a.product_count);

    return NextResponse.json({ categories });
  }

  // Product listing endpoint — explicit column allowlist, never select *
  const search   = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const page     = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (adminClient.from("products") as any)
    .select("id, name, image_url, category_mapped, price", { count: "exact" })
    .eq("status", "ready_for_shelf");

  if (search)   q = q.ilike("name", `%${search}%`);
  if (category) q = q.eq("category_mapped", category);

  const from = page * PAGE_SIZE;
  const { data, error, count } = await (
    q.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1) as any
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    products: data ?? [],
    total: count ?? 0,
    page,
  });
}
