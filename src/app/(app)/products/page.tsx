import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ProductsTable from "./ProductsTable";

export default async function ProductsPage() {
  const supabase = await createClient();

  const [
    { count: readyCount },
    { count: reviewCount },
    { count: shelvedCount },
    { count: rejectedCount },
    { count: allCount },
    { data: rejectReasons },
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "ready_for_shelf"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "in_review"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "shelved"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase
      .from("lookups")
      .select("*")
      .eq("kind", "reject_reason")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <Suspense fallback={<div style={{ padding: "20px 0", color: "var(--ink-3)" }}>Loading…</div>}>
      <ProductsTable
        tabCounts={{
          ready_for_shelf: readyCount ?? 0,
          in_review: reviewCount ?? 0,
          shelved: shelvedCount ?? 0,
          rejected: rejectedCount ?? 0,
          all: allCount ?? 0,
        }}
        rejectReasons={rejectReasons ?? []}
      />
    </Suspense>
  );
}
