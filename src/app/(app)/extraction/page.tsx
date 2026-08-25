import { createClient } from '@/lib/supabase/server';
import { adminClient }  from '@/lib/supabase/admin';
import StatTile from '@/components/ui/StatTile';
import ExtractionTable, { type ExtractionRow } from './ExtractionTable';
import type { MerchantStage } from '@/lib/database.types';

export default async function ExtractionPage() {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db    = supabase as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any;

  const [
    { data: merchants },
    { data: allJobs },
    { data: merchantCounts },
    { count: totalExtracted },
  ] = await Promise.all([
    db.from('merchants')
      .select('id, store_name, store_url, salla_store_id, stage')
      .order('store_name'),
    db.from('salla_fetch_jobs')
      .select('id, merchant_id, status, error, created_at, progress')
      .order('created_at', { ascending: false }),
    admin.from('v_merchant_product_counts').select('merchant_id, product_count'),
    admin.from('products')
      .select('*', { count: 'exact', head: true }),
  ]);

  // Product count per merchant — one row per merchant from the aggregate view
  const productCountByMerchant: Record<string, number> = {};
  for (const p of (merchantCounts ?? []) as Array<{ merchant_id: string; product_count: number }>) {
    productCountByMerchant[p.merchant_id] = p.product_count;
  }

  // Latest salla_fetch_job per merchant (already ordered desc)
  const latestJobByMerchant: Record<string, ExtractionRow['latest_job']> = {};
  for (const j of (allJobs ?? []) as Array<{
    id: string; merchant_id: string;
    status: 'pending' | 'running' | 'done' | 'error';
    error: string | null; created_at: string;
    progress: { products_found?: number } | null;
  }>) {
    if (!latestJobByMerchant[j.merchant_id]) {
      latestJobByMerchant[j.merchant_id] = {
        id: j.id,
        status: j.status,
        created_at: j.created_at,
        products_found: j.progress?.products_found ?? 0,
        error: j.error,
      };
    }
  }

  const rows: ExtractionRow[] = (
    (merchants ?? []) as Array<{
      id: string; store_name: string; store_url: string | null;
      salla_store_id: string | null; stage: MerchantStage;
    }>
  ).map(m => ({
    id:             m.id,
    store_name:     m.store_name,
    store_url:      m.store_url,
    salla_store_id: m.salla_store_id,
    stage:          m.stage,
    product_count:  productCountByMerchant[m.id] ?? 0,
    latest_job:     latestJobByMerchant[m.id] ?? null,
  }));

  // Stat tiles
  const extractable  = rows.filter(r => r.store_url || r.salla_store_id);
  const readyCount   = extractable.filter(r => !r.latest_job || r.latest_job.status === 'error').length;
  const fetchedCount = rows.filter(r => r.latest_job?.status === 'done').length;
  const failedCount  = rows.filter(r => r.latest_job?.status === 'error').length;

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Extraction</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          Pull product catalogues from connected Salla stores
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatTile label="Ready to extract" value={readyCount} />
        <StatTile label="Fetched"          value={fetchedCount} tint="green" />
        <StatTile label="Failed"           value={failedCount}  tint="red" />
        <StatTile label="Total extracted"  value={totalExtracted ?? 0} tint="blue" />
      </div>

      <div className="glass-panel" style={{ padding: 16 }}>
        <ExtractionTable rows={rows} />
      </div>
    </div>
  );
}
