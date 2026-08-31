import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';
import StatTile from '@/components/ui/StatTile';
import MerchantsTable from './MerchantsTable';
import FilterBar from './FilterBar';
import ViewTabs from './ViewTabs';
import type { VMerchantList } from '@/lib/database.types';

const PAGE_SIZE = 100;

const VIEWS = [
  { key: 'all',            label: 'All' },
  { key: 'my',             label: 'My merchants' },
  { key: 'needs',          label: 'Needs action' },
  { key: 'form_pending',   label: 'Form sent, not submitted' },
  { key: 'onboarding',     label: 'In onboarding' },
  { key: 'active',         label: 'Active' },
  { key: 'on_hold',        label: 'On hold' },
  { key: 'lost',           label: 'Lost' },
  { key: 'not_interested', label: 'Not interested' },
];

interface PageProps {
  searchParams: Promise<{
    page?: string;
    q?: string;
    stage?: string | string[];
    city?: string;
    priority?: string;
    industry?: string;
    store_type?: string;
    view?: string;
    extraction?: string;
  }>;
}

export interface FetchJobSummary {
  status: 'pending' | 'running' | 'done' | 'error';
  products_found: number;
}

export default async function MerchantsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page        = Math.max(0, parseInt(params.page ?? '0', 10) || 0);
  const q           = params.q?.trim() ?? '';
  const stageFilter = Array.isArray(params.stage) ? params.stage : params.stage ? [params.stage] : [];
  const city        = params.city?.trim() ?? '';
  const priority    = params.priority ?? '';
  const industry    = params.industry?.trim() ?? '';
  const storeType   = params.store_type?.trim() ?? '';
  const view        = params.view ?? 'all';
  const extraction  = params.extraction ?? '';   // none|never|fetching|fetched|failed

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = adminClient as any;

  const { data: { user } } = await supabase.auth.getUser();
  const now = new Date().toISOString();

  // ── All stats + tab counts in one parallel batch (no rows transferred) ────
  const [
    { count: total },
    { count: inPipeline },
    { count: atCta },
    { count: overdue },
    // Tab counts
    { count: tabMy },
    { count: tabNeeds },
    { count: tabFormPending },
    { count: tabOnboarding },
    { count: tabActive },
    { count: tabOnHold },
    { count: tabLost },
    { count: tabNotInterested },
    // Filter option lists
    { data: industryLookups },
    { data: storeTypeLookups },
  ] = await Promise.all([
    // Stat cards
    supabase.from('merchants').select('*', { count: 'exact', head: true }),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).not('stage', 'in', '(lost,not_interested)'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'cta_completed'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).lt('next_action_at', now).not('stage', 'in', '(active,lost,not_interested)'),
    // Tabs
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('acquisition_owner_id', user!.id),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).lt('next_action_at', now).not('stage', 'in', '(active,lost,not_interested)'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'form_sent'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'onboarding'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'active'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'on_hold'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'lost'),
    supabase.from('merchants').select('*', { count: 'exact', head: true }).eq('stage', 'not_interested'),
    // Lookups
    supabase.from('lookups').select('value').eq('kind', 'industry').eq('is_active', true).order('sort_order'),
    supabase.from('lookups').select('value').eq('kind', 'store_type').eq('is_active', true).order('sort_order'),
  ]);

  const tabCounts: Record<string, number> = {
    all:             total           ?? 0,
    my:              tabMy           ?? 0,
    needs:           tabNeeds        ?? 0,
    form_pending:    tabFormPending  ?? 0,
    onboarding:      tabOnboarding   ?? 0,
    active:          tabActive       ?? 0,
    on_hold:         tabOnHold       ?? 0,
    lost:            tabLost         ?? 0,
    not_interested:  tabNotInterested ?? 0,
  };

  const industryOptions  = (industryLookups ?? []).map(r => r.value);
  const storeTypeOptions = (storeTypeLookups ?? []).map(r => r.value);

  // ── Optional extraction-status pre-filter ─────────────────────────────────
  // Build a set of merchant IDs that match the requested extraction status.
  // This runs only when the filter is active.
  let extractionIds: string[] | null = null;
  if (extraction) {
    const { data: allJobs } = await db
      .from('salla_fetch_jobs')
      .select('merchant_id, status')
      .order('created_at', { ascending: false }) as { data: { merchant_id: string; status: string }[] | null };

    // Latest status per merchant (first row is latest due to DESC order)
    const latestStatus: Record<string, string> = {};
    for (const j of (allJobs ?? [])) {
      if (!latestStatus[j.merchant_id]) latestStatus[j.merchant_id] = j.status;
    }

    if (extraction === 'never') {
      // Merchants with NO fetch job at all: we need all merchant IDs then subtract
      const { data: allMerchants } = await supabase.from('merchants').select('id') as { data: { id: string }[] | null };
      const withJob = new Set(Object.keys(latestStatus));
      extractionIds = (allMerchants ?? []).filter(m => !withJob.has(m.id)).map(m => m.id);
    } else {
      const statusMap: Record<string, string[]> = {
        fetching: ['pending', 'running'],
        fetched:  ['done'],
        failed:   ['error'],
      };
      const statuses = statusMap[extraction] ?? [];
      extractionIds = Object.entries(latestStatus)
        .filter(([, s]) => statuses.includes(s))
        .map(([id]) => id);
    }
  }

  // ── Build paginated table query ────────────────────────────────────────────
  let query = supabase
    .from('v_merchants_list')
    .select('*', { count: 'exact' });

  // View filters
  if (view === 'my' && user)         query = query.eq('acquisition_owner_id', user.id);
  else if (view === 'needs')         query = query.lt('next_action_at', now).not('stage', 'in', '(active,lost,not_interested)');
  else if (view === 'form_pending')  query = query.eq('stage', 'form_sent');
  else if (view === 'onboarding')    query = query.eq('stage', 'onboarding');
  else if (view === 'active')        query = query.eq('stage', 'active');
  else if (view === 'on_hold')       query = query.eq('stage', 'on_hold');
  else if (view === 'lost')          query = query.eq('stage', 'lost');
  else if (view === 'not_interested')query = query.eq('stage', 'not_interested');

  // Additional filters
  if (stageFilter.length > 0) query = query.in('stage', stageFilter as import('@/lib/database.types').MerchantStage[]);
  if (city)       query = query.ilike('city', `%${city}%`);
  if (priority)   query = query.eq('priority', priority as import('@/lib/database.types').MerchantPriority);
  if (industry)   query = query.eq('industry', industry);
  if (storeType)  query = query.eq('store_type', storeType);
  if (q)          query = query.textSearch('store_name', q, { type: 'websearch' });

  // Extraction pre-filter
  if (extractionIds !== null) {
    if (extractionIds.length === 0) {
      // No merchants match — short-circuit to empty
      return renderPage({
        total: total ?? 0, inPipeline: inPipeline ?? 0,
        atCta: atCta ?? 0, overdue: overdue ?? 0,
        tabCounts, industryOptions, storeTypeOptions,
        rows: [], totalRows: 0, page, view, q, stageFilter, city, priority, industry, storeType, extraction,
      });
    }
    query = query.in('id', extractionIds);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const { data, count: filteredCount, error } = await query;
  const rows      = (data ?? []) as VMerchantList[];
  const totalRows = filteredCount ?? 0;

  // ── Enrich page rows with product counts + extraction status ──────────────
  const pageIds = rows.map(r => r.id);

  const [rawProductCounts, rawFetchJobs] = pageIds.length
    ? await Promise.all([
        admin.from('v_merchant_product_counts').select('merchant_id, product_count').in('merchant_id', pageIds) as Promise<{ data: { merchant_id: string; product_count: number }[] | null }>,
        db.from('salla_fetch_jobs').select('merchant_id, status, progress').in('merchant_id', pageIds).order('created_at', { ascending: false }) as Promise<{ data: { merchant_id: string; status: string; progress: { products_found?: number } | null }[] | null }>,
      ])
    : [{ data: [] }, { data: [] }];

  const productCountById: Record<string, number> = {};
  for (const p of (rawProductCounts.data ?? []) as { merchant_id: string; product_count: number }[]) {
    productCountById[p.merchant_id] = p.product_count;
  }

  const fetchJobById: Record<string, FetchJobSummary | null> = {};
  for (const j of (rawFetchJobs.data ?? []) as { merchant_id: string; status: string; progress: { products_found?: number } | null }[]) {
    if (!fetchJobById[j.merchant_id]) {
      fetchJobById[j.merchant_id] = {
        status: j.status as FetchJobSummary['status'],
        products_found: j.progress?.products_found ?? 0,
      };
    }
  }

  const enrichedRows = rows.map(r => ({
    ...r,
    product_count: productCountById[r.id] ?? 0,
    extraction: fetchJobById[r.id] ?? null,
  }));

  return renderPage({
    total: total ?? 0, inPipeline: inPipeline ?? 0,
    atCta: atCta ?? 0, overdue: overdue ?? 0,
    tabCounts, industryOptions, storeTypeOptions,
    rows: enrichedRows, totalRows, page, view, q, stageFilter, city, priority, industry, storeType, extraction,
    error: error?.message,
  });
}

// ── Render helper (avoids duplicating JSX for the early-exit path) ──────────
function renderPage(p: {
  total: number; inPipeline: number; atCta: number; overdue: number;
  tabCounts: Record<string, number>;
  industryOptions: string[]; storeTypeOptions: string[];
  rows: (VMerchantList & { product_count: number; extraction: FetchJobSummary | null })[];
  totalRows: number; page: number; view: string; q: string;
  stageFilter: string[]; city: string; priority: string; industry: string;
  storeType: string; extraction: string;
  error?: string;
}) {
  const totalPages = Math.ceil(p.totalRows / PAGE_SIZE);

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Merchants</h1>
        <p className="sub" style={{ marginTop: 4 }}>{p.total.toLocaleString('en-US')} total</p>
      </div>

      {/* Stat tiles — all server-side counts, zero rows transferred */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatTile label="Total merchants"   value={p.total}      description="all merchants ever added" />
        <StatTile label="In pipeline"       value={p.inPipeline} description="not lost or not-interested" />
        <StatTile label="At CTA done now"   value={p.atCta}      description="stage = cta_completed right now" tint="green" />
        <StatTile label="Overdue"           value={p.overdue}    description="next action date has passed" tint="red" />
      </div>

      {/* Main panel */}
      <div className="glass-panel" style={{ padding: 16 }}>
        <ViewTabs views={VIEWS} current={p.view} counts={p.tabCounts} />

        <div style={{ marginBottom: 14 }}>
          <FilterBar
            currentQ={p.q} currentStages={p.stageFilter} currentCity={p.city}
            currentPriority={p.priority} currentIndustry={p.industry}
            currentStoreType={p.storeType} currentExtraction={p.extraction}
            industryOptions={p.industryOptions} storeTypeOptions={p.storeTypeOptions}
            view={p.view}
          />
        </div>

        {p.error && (
          <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>
            {p.error}
          </div>
        )}

        <MerchantsTable rows={p.rows} view={p.view} />

        {totalPages > 1 && (
          <Pagination
            page={p.page} totalPages={totalPages} view={p.view} q={p.q}
            stages={p.stageFilter} city={p.city} priority={p.priority}
            industry={p.industry} storeType={p.storeType} extraction={p.extraction}
          />
        )}
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────
function Pagination({
  page, totalPages, view, q, stages, city, priority, industry, storeType, extraction,
}: {
  page: number; totalPages: number; view: string; q: string; stages: string[];
  city: string; priority: string; industry: string; storeType: string; extraction: string;
}) {
  function href(p: number) {
    const sp = new URLSearchParams();
    if (view !== 'all') sp.set('view', view);
    if (q) sp.set('q', q);
    stages.forEach(s => sp.append('stage', s));
    if (city) sp.set('city', city);
    if (priority) sp.set('priority', priority);
    if (industry) sp.set('industry', industry);
    if (storeType) sp.set('store_type', storeType);
    if (extraction) sp.set('extraction', extraction);
    sp.set('page', String(p));
    return `/merchants?${sp.toString()}`;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
      <span className="sub">Page {page + 1} of {totalPages}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {page > 0 && (
          <a href={href(page - 1)} className="pill outline" style={{ textDecoration: 'none', fontSize: 12.5 }}>← Previous</a>
        )}
        {page < totalPages - 1 && (
          <a href={href(page + 1)} className="pill outline" style={{ textDecoration: 'none', fontSize: 12.5 }}>Next →</a>
        )}
      </div>
    </div>
  );
}
