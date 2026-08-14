import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { SearchList, SearchResult, Merchant } from '@/lib/database.types';
import ResultsClient from './ResultsClient';

export const metadata = { title: 'Search results' };

const STAGE_LABELS: Record<string, string> = {
  new: 'New', assigned: 'Assigned', contacted: 'Contacted', interested: 'Interested',
  form_sent: 'Form sent', cta_completed: 'CTA done', onboarding: 'Onboarding',
  active: 'Active', on_hold: 'On hold', lost: 'Lost',
};

interface PageProps {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ filter?: string }>;
}

export type EnrichedResult = SearchResult & {
  merchant_stage: string | null;
  merchant_id: string | null;
};

export default async function ListDetailPage({ params, searchParams }: PageProps) {
  const { listId } = await params;
  const { filter } = await searchParams;
  const activeFilter = (filter === 'new' || filter === 'existing') ? filter : 'all';

  const supabase = await createClient();

  const { data: list, error: listErr } = await supabase
    .from('search_lists')
    .select('*')
    .eq('id', listId)
    .single();

  if (listErr || !list) notFound();

  const { data: results, error: resultsErr } = await supabase
    .from('search_results')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });

  if (resultsErr) {
    return (
      <div className="glass-panel" style={{ padding: 24, color: 'var(--red)' }}>
        Failed to load results: {resultsErr.message}
      </div>
    );
  }

  // Gather unique matched merchant ids
  const merchantIds = [
    ...new Set((results ?? []).map(r => r.matched_merchant).filter(Boolean) as string[]),
  ];

  let merchantMap = new Map<string, Pick<Merchant, 'id' | 'stage'>>();
  if (merchantIds.length) {
    const { data: merchants } = await supabase
      .from('merchants')
      .select('id, stage')
      .in('id', merchantIds);
    for (const m of merchants ?? []) {
      merchantMap.set(m.id, m);
    }
  }

  const enriched: EnrichedResult[] = (results ?? []).map(r => {
    const merchant = r.matched_merchant ? merchantMap.get(r.matched_merchant) : undefined;
    return {
      ...r,
      merchant_stage: merchant ? (STAGE_LABELS[merchant.stage] ?? merchant.stage) : null,
      merchant_id: r.matched_merchant ?? null,
    };
  });

  // Apply filter
  const filtered =
    activeFilter === 'new'
      ? enriched.filter(r => !r.matched_merchant)
      : activeFilter === 'existing'
      ? enriched.filter(r => !!r.matched_merchant)
      : enriched;

  const newCount = enriched.filter(r => !r.matched_merchant).length;
  const existingCount = enriched.filter(r => !!r.matched_merchant).length;

  return (
    <div style={{ padding: '24px' }}>
      {/* Back + header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/prospecting" style={{ fontSize: 12.5, color: 'var(--ink-3)', textDecoration: 'none' }}>
          ← Prospecting
        </Link>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginTop: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{(list as SearchList).name}</h1>
            {(list as SearchList).query && (
              <p className="mono sub" style={{ marginTop: 4, fontSize: 12 }}>{(list as SearchList).query}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`/api/prospecting/${listId}/export`}
              className="pill outline"
              style={{ fontSize: 12.5 }}
            >
              Export CSV
            </a>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
          <div>
            <span className="sub" style={{ fontSize: 11 }}>Total results</span>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{enriched.length}</div>
          </div>
          <div>
            <span className="sub" style={{ fontSize: 11 }}>New stores</span>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{newCount}</div>
          </div>
          <div>
            <span className="sub" style={{ fontSize: 11 }}>Existing</span>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>{existingCount}</div>
          </div>
          <div>
            <span className="sub" style={{ fontSize: 11 }}>Leads created</span>
            <div className="num" style={{ fontSize: 18, fontWeight: 600 }}>
              {enriched.filter(r => r.converted).length}
            </div>
          </div>
        </div>
      </div>

      <ResultsClient results={filtered} allResults={enriched} listId={listId} activeFilter={activeFilter} />
    </div>
  );
}
