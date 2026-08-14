"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ProductStatus } from "@/lib/database.types";

// Supabase's TS types collapse update() parameter to `never` when Row types
// use mapped types in the Database generic. `as any` is the standard
// workaround — runtime data is always correct.

export async function updateProductStatus(
  productId: string,
  status: ProductStatus,
  rejectReason?: string,
) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "rejected" && rejectReason) patch.reject_reason = rejectReason;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products") as any).update(patch).eq("id", productId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/products");
}

export async function updateProductReviewNotes(productId: string, notes: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products") as any).update({ review_notes: notes }).eq("id", productId);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/products");
}

export async function bulkUpdateProductStatus(
  productIds: string[],
  status: ProductStatus,
  rejectReason?: string,
) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "rejected" && rejectReason) patch.reject_reason = rejectReason;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("products") as any).update(patch).in("id", productIds);
  if (error) throw new Error((error as { message: string }).message);
  revalidatePath("/products");
}

export async function exportProductsCSV(filters: {
  status?: ProductStatus;
  merchant?: string;
  category?: string;
  brand?: string;
}) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = (supabase.from("v_product_margin") as any).select("*");
  if (filters.status)   q = q.eq("status", filters.status);
  if (filters.merchant) q = q.ilike("store_name", `%${filters.merchant}%`);
  if (filters.category) q = q.ilike("category",   `%${filters.category}%`);
  if (filters.brand)    q = q.ilike("brand",      `%${filters.brand}%`);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error((error as { message: string }).message);
  if (!(data as unknown[])?.length) return "";
  const cols = [
    "id", "name", "sku", "store_name", "category", "brand",
    "price", "sale_price", "effective_cost", "margin_pct",
    "stock", "status", "created_at",
  ];
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    cols.join(","),
    ...(data as Record<string, unknown>[]).map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}
