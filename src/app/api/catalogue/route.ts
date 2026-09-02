import { adminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

// Merchant stages that qualify a product as "ready for shelf".
export const SHELF_READY_STAGES = ["cta_completed", "onboarding", "active"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a category/subcategory count map from a product row array.
function buildCountMap<K extends string>(
  rows: Record<string, unknown>[],
  key: string,
): Map<K, number> {
  const map = new Map<K, number>();
  for (const r of rows) {
    const v = r[key] as K | null;
    if (v) map.set(v, (map.get(v) ?? 0) + 1);
  }
  return map;
}

// GET /api/catalogue?search=&nml_category=&nml_subcategory=&merchant_ids=&page=0
// GET /api/catalogue?type=nml-categories
// GET /api/catalogue?type=nml-subcategories&category=X
// GET /api/catalogue?type=merchants
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const type = searchParams.get("type");

    // ── NML category list ────────────────────────────────────────────────────
    // Uses an inner join on merchants so the merchant ID list never goes into
    // the URL (a large IN() filter can exceed server URL-length limits).
    if (type === "nml-categories") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (adminClient.from("products") as any)
        .select("nml_category, merchants!inner(stage)")
        .in("merchants.stage", SHELF_READY_STAGES)
        .not("nml_category", "is", null)
        .limit(50_000);

      if (error) console.error("[catalogue] nml-categories error:", error?.message);

      const catMap = buildCountMap<string>(
        (data ?? []) as Record<string, unknown>[],
        "nml_category",
      );

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (adminClient.from("products") as any)
        .select("nml_subcategory, merchants!inner(stage)")
        .in("merchants.stage", SHELF_READY_STAGES)
        .eq("nml_category", category)
        .not("nml_subcategory", "is", null)
        .limit(50_000);

      if (error) console.error("[catalogue] nml-subcategories error:", error?.message);

      const subMap = buildCountMap<string>(
        (data ?? []) as Record<string, unknown>[],
        "nml_subcategory",
      );

      return NextResponse.json({
        subcategories: [...subMap.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count),
      });
    }

    // ── Merchant list ────────────────────────────────────────────────────────
    // Only shelf-ready merchants, sorted by name, for the merchant filter.
    if (type === "merchants") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mData } = await (adminClient.from("merchants") as any)
        .select("id, store_name")
        .in("stage", SHELF_READY_STAGES)
        .order("store_name")
        .limit(5_000);

      return NextResponse.json({
        merchants: ((mData ?? []) as { id: string; store_name: string }[]).map(m => ({
          id: m.id,
          name: m.store_name,
        })),
      });
    }

    // ── Product listing ──────────────────────────────────────────────────────
    // Shelf-ready merchants resolved once for this request (used for the IN
    // filter + optional user-supplied merchant filter).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: merchantData, error: merchantErr } = await (adminClient.from("merchants") as any)
      .select("id")
      .in("stage", SHELF_READY_STAGES)
      .limit(5_000);
    if (merchantErr) return NextResponse.json({ error: "Failed to resolve merchant list" }, { status: 500 });
    const shelfReadyIds = ((merchantData ?? []) as { id: string }[]).map(m => m.id);
    if (!shelfReadyIds.length) return NextResponse.json({ products: [], total: 0, page: 0 });

    const search         = searchParams.get("search") ?? "";
    const nmlCategory    = searchParams.get("nml_category") ?? "";
    const nmlSubcategory = searchParams.get("nml_subcategory") ?? "";
    const merchantIdsParam = (searchParams.get("merchant_ids") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    // Intersect user-selected merchants with shelf-ready set.
    const effectiveMerchantIds = merchantIdsParam.length
      ? shelfReadyIds.filter(id => merchantIdsParam.includes(id))
      : shelfReadyIds;
    if (!effectiveMerchantIds.length) return NextResponse.json({ products: [], total: 0, page });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (adminClient.from("products") as any)
      .select(
        "id, name, image_url, images, nml_category, nml_subcategory, price, description, url, merchant_id, merchants!merchant_id(store_name)",
        { count: "exact" },
      )
      .in("merchant_id", effectiveMerchantIds);

    if (search)         q = q.ilike("name", `%${search}%`);
    if (nmlCategory)    q = q.eq("nml_category", nmlCategory);
    if (nmlSubcategory) q = q.eq("nml_subcategory", nmlSubcategory);

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
