import { createClient } from '@/lib/supabase/server';
import { adminClient }  from '@/lib/supabase/admin';
import StatTile from '@/components/ui/StatTile';
import ExtractionTable, { type ExtractionRow } from './ExtractionTable';
import type { MerchantStage } from '@/lib/database.types';

export const dynamic = 'force-dynamic';

export default async function ExtractionPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db    = supabase as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any;

  // ── All fetches in parallel ───────────────────────────────────────────────────
  const [
    { count: hasSallaUrl },       // HEAD count — merchants that can be extracted
    { count: fetchedCount },       // HEAD count — merchants with ≥1 product in CRM
    { count: failedJobCount },     // HEAD count — jobs with status=error
    { count: totalExtracted },     // HEAD count — total product rows
    { data: productCounts },       // merchant_id + product_count from view (small dataset)
    { data: merchants },           // full merchant list for the table
    { data: allJobs },             // full job list for the table
  ] = await Promise.all([
    // Stat card HEAD counts — zero rows transferred
    supabase.from('merchants')
      .select('*', { count: 'exact', head: true })
      .or('store_url.not.is.null,salla_store_id.not.is.null'),
    admin.from('v_merchant_product_counts')
      .select('*', { count: 'exact', head: true }),
    db.from('salla_fetch_jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'error'),
    admin.from('products')
      .select('*', { count: 'exact', head: true }),
    // Product counts per merchant — used for the table display AND the ready anti-join
    admin.from('v_merchant_product_counts')
      .select('merchant_id, product_count')
      .limit(10_000) as Promise<{ data: { merchant_id: string; product_count: number }[] | null }>,
    // Table data — explicit high limits; default PostgREST cap is 1 000 rows
    db.from('merchants')
      .select('id, store_name, store_url, salla_store_id, stage')
      .order('store_name')
      .limit(10_000) as Promise<{ data: { id: string; store_name: string; store_url: string | null; salla_store_id: string | null; stage: MerchantStage }[] | null }>,
    db.from('salla_fetch_jobs')
      .select('id, merchant_id, status, error, created_at, progress')
      .order('created_at', { ascending: false })
      .limit(10_000) as Promise<{ data: { id: string; merchant_id: string; status: 'pending' | 'running' | 'done' | 'error'; error: string | null; created_at: string; progress: { products_found?: number } | null }[] | null }>,
  ]);

  // Ready to extract: has salla URL and no products yet.
  // = (merchants with salla url) − (merchants with salla url that already have products)
  const productMerchantIds = (productCounts ?? []).map(r => r.merchant_id);
  let hasSallaAndProducts = 0;
  if (productMerchantIds.length > 0) {
    const { count } = await supabase
      .from('merchants')
      .select('*', { count: 'exact', head: true })
      .or('store_url.not.is.null,salla_store_id.not.is.null')
      .in('id', productMerchantIds);
    hasSallaAndProducts = count ?? 0;
  }
  const readyCount = (hasSallaUrl ?? 0) - hasSallaAndProducts;

  // ── Build table rows ──────────────────────────────────────────────────────────
  const productCountById: Record<string, number> = {};
  for (const p of (productCounts ?? [])) {
    productCountById[p.merchant_id] = p.product_count;
  }

  const latestJobByMerchant: Record<string, ExtractionRow['latest_job']> = {};
  for (const j of (allJobs ?? [])) {
    if (!latestJobByMerchant[j.merchant_id]) {
      latestJobByMerchant[j.merchant_id] = {
        id:             j.id,
        status:         j.status,
        created_at:     j.created_at,
        products_found: j.progress?.products_found ?? 0,
        error:          j.error,
      };
    }
  }

  const rows: ExtractionRow[] = (merchants ?? []).map(m => ({
    id:             m.id,
    store_name:     m.store_name,
    store_url:      m.store_url,
    salla_store_id: m.salla_store_id,
    stage:          m.stage,
    product_count:  productCountById[m.id] ?? 0,
    latest_job:     latestJobByMerchant[m.id] ?? null,
  }));

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Extraction</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          Pull product catalogues from connected Salla stores
        </p>
      </div>

      {/* All four stat tiles use server-side HEAD count queries — no row cap risk */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatTile
          label="Ready to extract"
          value={readyCount}
          description="has Salla URL · no products in CRM yet"
        />
        <StatTile
          label="Fetched"
          value={fetchedCount ?? 0}
          tint="green"
          description="merchants with ≥1 product imported"
        />
        <StatTile
          label="Failed"
          value={failedJobCount ?? 0}
          tint="red"
          description="jobs with status = error"
        />
        <StatTile
          label="Total extracted"
          value={totalExtracted ?? 0}
          tint="blue"
          description="product rows across all merchants"
        />
      </div>

      <div className="glass-panel" style={{ padding: 16 }}>
        <ExtractionTable rows={rows} />
      </div>
    </div>
  );
}
