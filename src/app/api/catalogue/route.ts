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

    // ── Merchant list (only those that have catalogue products) ──────────────
    if (searchParams.get("type") === "merchants") {
      if (!merchantIds.length) return NextResponse.json({ merchants: [] });

      // Distinct merchant_ids that have at least one product
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: prodRows } = await (adminClient.from("products") as any)
        .select("merchant_id")
        .in("merchant_id", merchantIds);

      const distinctIds = [
        ...new Set(((prodRows ?? []) as { merchant_id: string }[]).map(r => r.merchant_id)),
      ];
      if (!distinctIds.length) return NextResponse.json({ merchants: [] });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: mData } = await (adminClient.from("merchants") as any)
        .select("id, store_name")
        .in("id", distinctIds)
        .order("store_name");

      return NextResponse.json({
        merchants: ((mData ?? []) as { id: string; store_name: string }[]).map(m => ({
          id: m.id,
          name: m.store_name,
        })),
      });
    }

    // ── Product listing ──────────────────────────────────────────────────────
    const search     = searchParams.get("search") ?? "";
    const category   = searchParams.get("category") ?? "";
    const merchantId = searchParams.get("merchant_id") ?? "";
    const page       = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

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

    if (search)     q = q.ilike("name", `%${search}%`);
    if (category)   q = q.eq("category_mapped", category);
    if (merchantId) q = q.eq("merchant_id", merchantId);

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
