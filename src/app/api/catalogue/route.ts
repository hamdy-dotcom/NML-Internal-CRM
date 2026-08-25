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

// GET /api/catalogue?search=&category=&merchant_id=&page=0
// GET /api/catalogue?type=categories
// GET /api/catalogue?type=merchants
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const merchantIds = await getShelfReadyMerchantIds();
    if (!merchantIds) return NextResponse.json({ error: "Failed to resolve merchant list" }, { status: 500 });

    // ── Category list ────────────────────────────────────────────────────────
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
      const categories = [...seen].sort((a, b) => a.localeCompare(b, "ar"));
      return NextResponse.json({ categories });
    }

    // ── Merchant list — all shelf-ready merchants, sorted by name ────────────
    if (searchParams.get("type") === "merchants") {
      if (!merchantIds.length) return NextResponse.json({ merchants: [] });

      // Query merchants table directly — avoids the products scan that hits
      // Supabase's 1000-row default cap and misses most merchants.
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
    const search      = searchParams.get("search") ?? "";
    const category    = searchParams.get("category") ?? "";
    const merchantIdsParam = (searchParams.get("merchant_ids") ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);
    const page        = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

    if (!merchantIds.length) {
      return NextResponse.json({ products: [], total: 0, page });
    }

    // Explicit column allowlist — include url (Salla link) and merchant join for store_name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (adminClient.from("products") as any)
      .select(
        "id, name, image_url, images, category_mapped, price, description, url, merchant_id, merchants!merchant_id(store_name)",
        { count: "exact" },
      )
      .in("merchant_id", merchantIds);

    if (search)                q = q.ilike("name", `%${search}%`);
    if (category)              q = q.eq("category_mapped", category);
    if (merchantIdsParam.length) q = q.in("merchant_id", merchantIdsParam);

    const from = page * PAGE_SIZE;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error, count } = await (
      q.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1) as any
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Flatten merchant join → merchant_name
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
