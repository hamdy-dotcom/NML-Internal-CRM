import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ProductsTable from "./ProductsTable";
import FetchPanel from "./FetchPanel";

const ONBOARDING_STAGES = ["cta_completed", "onboarding"];

export default async function ProductsPage() {
  const supabase = await createClient();

  const [
    { count: activeCount },
    { count: onboardingCount },
    { count: allCount },
  ] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("products") as any)
      .select("id, merchants!inner(stage)", { count: "exact", head: true })
      .eq("merchants.stage", "active"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.from("products") as any)
      .select("id, merchants!inner(stage)", { count: "exact", head: true })
      .in("merchants.stage", ONBOARDING_STAGES),
    supabase.from("products").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div style={{ paddingTop: 16 }}>
      <FetchPanel />
      <Suspense fallback={<div style={{ color: "var(--ink-3)" }}>Loading…</div>}>
        <ProductsTable
          tabCounts={{
            active:     activeCount     ?? 0,
            onboarding: onboardingCount ?? 0,
            all:        allCount        ?? 0,
          }}
        />
      </Suspense>
    </div>
  );
}
