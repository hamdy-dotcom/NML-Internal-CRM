// POST /api/merchants/[id]/fetch-products
// Creates a salla_fetch_jobs record for the given merchant.
// The actual fetch runs in the background worker (scripts/salla-worker.ts).

import { NextRequest, NextResponse } from "next/server";
import { createClient }  from "@/lib/supabase/server";
import { adminClient }   from "@/lib/supabase/admin";

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: merchantId } = await ctx.params;

  // Auth: verify caller can edit this merchant
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read merchant store_url — use anon client so RLS filters the merchant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: merchant, error: mErr } = await (supabase as any).from("merchants")
    .select("id, store_url")
    .eq("id", merchantId)
    .maybeSingle();

  if (mErr || !merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }
  if (!merchant.store_url) {
    return NextResponse.json({ error: "Merchant has no store_url" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const autoImport = body?.auto_import === true;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = adminClient as any;

  // If there is already a running job, return it instead of creating a duplicate
  const { data: existing, error: existErr } = await adminDb.from("salla_fetch_jobs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existErr) {
    console.error("[fetch-products] existing-job check failed:", existErr.message, existErr);
    return NextResponse.json({ error: existErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json({ jobId: existing.id, resumed: true });
  }

  // Create a new job record (worker polls and picks it up)
  const { data: job, error: jErr } = await adminDb.from("salla_fetch_jobs")
    .insert({ merchant_id: merchantId, store_url: merchant.store_url, auto_import: autoImport })
    .select("id")
    .single();

  if (jErr) {
    // 23505 = unique_violation: a concurrent request won the race and already
    // inserted an active job. Return that job instead of erroring.
    if (jErr.code === "23505") {
      const { data: race } = await adminDb.from("salla_fetch_jobs")
        .select("id")
        .eq("merchant_id", merchantId)
        .in("status", ["pending", "running"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (race) return NextResponse.json({ jobId: race.id, resumed: true });
    }
    console.error("[fetch-products] insert failed:", jErr.message, jErr);
    return NextResponse.json({ error: jErr.message ?? "Could not create job" }, { status: 500 });
  }
  if (!job) {
    return NextResponse.json({ error: "Could not create job" }, { status: 500 });
  }

  return NextResponse.json({ jobId: job.id });
}
