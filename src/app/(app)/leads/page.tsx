import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";
import LeadsTable from "./LeadsTable";
import type { VMerchantList, LeadBatch } from "@/lib/database.types";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    q?: string;
    batch?: string;
    city?: string;
    category?: string;
  }>;
}

async function LeadsData({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const PAGE_SIZE = 100;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();

  let query = supabase
    .from("v_merchants_list")
    .select("*", { count: "exact" })
    .eq("stage", "new")
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.q) {
    query = query.or(
      `store_name.ilike.%${params.q}%,owner_name.ilike.%${params.q}%,phone.ilike.%${params.q}%`,
    );
  }
  if (params.batch) query = query.eq("batch_id", params.batch);
  if (params.city) query = query.eq("city", params.city);
  if (params.category) query = query.eq("category", params.category);

  const [{ data: merchants, count }, { data: batches }, { data: filterMeta }] = await Promise.all([
    query,
    supabase
      .from("lead_batches")
      .select("id, name")
      .order("created_at", { ascending: false }),
    supabase.from("merchants").select("city, category").eq("stage", "new"),
  ]);

  const cities = Array.from(
    new Set((filterMeta ?? []).map((m) => m.city).filter(Boolean)),
  ) as string[];
  const categories = Array.from(
    new Set((filterMeta ?? []).map((m) => m.category).filter(Boolean)),
  ) as string[];

  return (
    <LeadsTable
      merchants={(merchants ?? []) as VMerchantList[]}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      batches={(batches ?? []) as Pick<LeadBatch, "id" | "name">[]}
      cities={cities}
      categories={categories}
      filters={{
        q: params.q,
        batch: params.batch,
        city: params.city,
        category: params.category,
      }}
    />
  );
}

export default function LeadsPage({ searchParams }: PageProps) {
  return (
    <div style={{ padding: "20px 0" }}>
      <Suspense fallback={<LeadsTableSkeleton />}>
        <LeadsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function LeadsTableSkeleton() {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          height: 36,
        }}
      >
        <div
          style={{
            width: 60,
            height: 22,
            borderRadius: 8,
            background: "rgba(120,135,160,.12)",
          }}
        />
      </div>
      <div
        style={{
          height: 32,
          borderRadius: 10,
          background: "rgba(120,135,160,.08)",
          marginBottom: 14,
        }}
      />
      <div
        style={{
          height: 400,
          borderRadius: 14,
          background: "rgba(255,255,255,.6)",
        }}
      />
    </div>
  );
}
