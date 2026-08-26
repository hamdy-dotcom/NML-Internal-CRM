import { adminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

// Merchant stages that qualify a product as "ready for shelf".
export const SHELF_READY_STAGES = ["cta_completed", "onboarding", "active"] as const;

async function getShelfReadyMerchantIds(): Promise<string[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient.from("merchants") as any)
    .select("id")
    .in("stage", SHELF_READY_STAGES);
  if (error) return null;
  return ((data ?? []) as { id: string }[]).map(m => m.id);
}

// GET /api/catalogue?search=&nml_category=&nml_subcategory=&merchant_ids=&page=0
// GET /api/catalogue?type=nml-categories
// GET /api/catalogue?type=nml-subcategories&category=X
// GET /api/catalogue?type=merchants
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");

    const merchantIds = await getShelfReadyMerchantIds();
    if (!merchantIds) return NextResponse.json({ error: "Failed to resolve merchant list" }, { status: 500 });

    // ── NML category list ────────────────────────────────────────────────────
    if (type === "nml-categories") {
      if (!merchantIds.length) return NextResponse.json({ categories: [] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (adminClient.from("products") as any)
        .select("nml_category")
        .in("merchant_id", merchantIds)
        .not("nml_category", "is", null)
        .limit(10000);

      console.log("[catalogue] nml-categories:", { merchantCount: merchantIds.length, rows: (data ?? []).length, error: error?.message });
      if (error) console.error("[catalogue] nml-categories error:", error);

      const catMap = new Map<string, number>();
      for (const r of (data ?? []) as { nml_category: string }[])
        catMap.set(r.nml_category, (catMap.get(r.nml_category) ?? 0) + 1);

      return NextResponse.json({
        categories: [...catMap.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      });
    }

    // ── NML subcategory list ─────────────────────────────────────────────────
    if (type === "nml-subcategories") {
      const category = searchParams.get("category") ?? "";
      if (!category) return NextResponse.json({ subcategories: [] });
      if (!merchantIds.length) return NextResponse.json({ subcategories: [] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (adminClient.from("products") as any)
        .select("nml_subcategory")
        .in("merchant_id", merchantIds)
        .eq("nml_category", category)
        .not("nml_subcategory", "is", null)
        .limit(10000);

      console.log("[catalogue] nml-subcategories:", { category, merchantCount: merchantIds.length, rows: (data ?? []).length, error: error?.message });
      if (error) console.error("[catalogue] nml-subcategories error:", error);

      const subMap = new Map<string, number>();
      for (const r of (data ?? []) as { nml_subcategory: string }[])
        subMap.set(r.nml_subcategory, (subMap.get(r.nml_subcategory) ?? 0) + 1);

      return NextResponse.json({
        subcategories: [...subMap.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      });
    }

    // ── Merchant list — all shelf-ready merchants, sorted by name ────────────
    if (type === "merchants") {
      if (!merchantIds.length) return NextResponse.json({ merchants: [] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mData } = await (adminClient.from("merchants") as any)
        .select("id, store_name")
        .in("id", merchantIds)
        .order("store_name");

      return NextResponse.json({
        merchants: ((mData ?? []) as { id: string; store_name: string }[]).map(m => ({
          id: m.id,
          name: m.store_name,
        })),
      });
    }

    // ── Product listing ──────────────────────────────────────────────────────
    const search        = searchParams.get("search") ?? "";
    const nmlCategory   = searchParams.get("nml_category") ?? "";
    const nmlSubcategory = searchParams.get("nml_subcategory") ?? "";
    const merchantIdsParam = (searchParams.get("merchant_ids") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    if (!merchantIds.length) {
      return NextResponse.json({ products: [], total: 0, page });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (adminClient.from("products") as any)
      .select(
        "id, name, image_url, images, nml_category, nml_subcategory, price, description, url, merchant_id, merchants!merchant_id(store_name)",
        { count: "exact" },
      )
      .in("merchant_id", merchantIds);

    if (search)              q = q.ilike("name", `%${search}%`);
    if (nmlCategory)         q = q.eq("nml_category", nmlCategory);
    if (nmlSubcategory)      q = q.eq("nml_subcategory", nmlSubcategory);
    if (merchantIdsParam.length) q = q.in("merchant_id", merchantIdsParam);

    const from = page * PAGE_SIZE;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (
      q.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1) as any
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const products = ((data ?? []) as Array<Record<string, unknown>>).map(p => {
      const { merchants, ...rest } = p as { merchants: { store_name: string } | null } & Record<string, unknown>;
      return { ...rest, merchant_name: merchants?.store_name ?? null };
    });

    return NextResponse.json({ products, total: count ?? 0, page });
  } catch (err) {
    console.error("[catalogue] unhandled error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
