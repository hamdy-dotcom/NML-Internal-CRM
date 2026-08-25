import { createClient } from '@/lib/supabase/server';
import StatTile from '@/components/ui/StatTile';
import MerchantsTable from './MerchantsTable';
import FilterBar from './FilterBar';
import ViewTabs from './ViewTabs';
import type { VMerchantList } from '@/lib/database.types';

const PAGE_SIZE = 100;

const VIEWS = [
  { key: 'all',          label: 'All' },
  { key: 'my',           label: 'My merchants' },
  { key: 'needs',        label: 'Needs action' },
  { key: 'form_pending', label: 'Form sent, not submitted' },
  { key: 'onboarding',   label: 'In onboarding' },
  { key: 'active',       label: 'Active' },
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
  }>;
}

export default async function MerchantsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(0, parseInt(params.page ?? '0', 10) || 0);
  const q = params.q?.trim() ?? '';
  const stageFilter = Array.isArray(params.stage)
    ? params.stage
    : params.stage
    ? [params.stage]
    : [];
  const city = params.city?.trim() ?? '';
  const priority = params.priority ?? '';
  const industry = params.industry?.trim() ?? '';
  const storeType = params.store_type?.trim() ?? '';
  const view = params.view ?? 'all';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Stats ──────────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const [
    { count: inPipelineCount },
    { count: formsPendingCount },
    { count: ctaThisMonthCount },
    { count: overdueCount },
    { data: industryLookups },
    { data: storeTypeLookups },
  ] = await Promise.all([
    supabase.from('merchants').select('*', { count: 'exact', head: true })
      .not('stage', 'in', '(active,lost,not_interested)'),
    supabase.from('merchants').select('*', { count: 'exact', head: true })
      .eq('stage', 'form_sent'),
    supabase.from('merchants').select('*', { count: 'exact', head: true })
      .eq('stage', 'cta_completed')
      .gte('cta_completed_at', firstOfMonth),
    supabase.from('merchants').select('*', { count: 'exact', head: true })
      .lt('next_action_at', now)
      .not('stage', 'in', '(active,lost,not_interested)'),
    supabase.from('lookups').select('value').eq('kind', 'industry').eq('is_active', true).order('sort_order'),
    supabase.from('lookups').select('value').eq('kind', 'store_type').eq('is_active', true).order('sort_order'),
  ]);

  const industryOptions = (industryLookups ?? []).map(r => r.value);
  const storeTypeOptions = (storeTypeLookups ?? []).map(r => r.value);

  // ── Build query ────────────────────────────────────────────────────────
  let query = supabase
    .from('v_merchants_list')
    .select('*', { count: 'exact' });

  // View filters
  if (view === 'my' && user) {
    query = query.eq('acquisition_owner_id', user.id);
  } else if (view === 'needs') {
    query = query.lt('next_action_at', now).not('stage', 'in', '(active,lost,not_interested)');
  } else if (view === 'form_pending') {
    query = query.eq('stage', 'form_sent');
  } else if (view === 'onboarding') {
    query = query.eq('stage', 'onboarding');
  } else if (view === 'active') {
    query = query.eq('stage', 'active');
  } else if (view === 'on_hold') {
    query = query.eq('stage', 'on_hold');
  } else if (view === 'lost') {
    query = query.eq('stage', 'lost');
  } else if (view === 'not_interested') {
    query = query.eq('stage', 'not_interested');
  }

  // Additional filters
  if (stageFilter.length > 0) {
    query = query.in('stage', stageFilter as import("@/lib/database.types").MerchantStage[]);
  }
  if (city) {
    query = query.ilike('city', `%${city}%`);
  }
  if (priority) {
    query = query.eq('priority', priority as import("@/lib/database.types").MerchantPriority);
  }
  if (industry) {
    query = query.eq('industry', industry);
  }
  if (storeType) {
    query = query.eq('store_type', storeType);
  }
  if (q) {
    query = query.textSearch('store_name', q, { type: 'websearch' });
  }

  query = query
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as VMerchantList[];
  const totalRows = count ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>Merchants</h1>
        <p className="sub" style={{ marginTop: 4 }}>
          {totalRows.toLocaleString('en-US')} total
        </p>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatTile label="In pipeline" value={inPipelineCount ?? 0} />
        <StatTile label="Forms pending" value={formsPendingCount ?? 0} tint="blue" />
        <StatTile label="CTA this month" value={ctaThisMonthCount ?? 0} tint="green" />
        <StatTile label="Overdue" value={overdueCount ?? 0} tint="red" />
      </div>

      {/* Main panel */}
      <div className="glass-panel" style={{ padding: 16 }}>
        {/* View tabs */}
        <ViewTabs views={VIEWS} current={view} />

        {/* Filter bar */}
        <div style={{ marginBottom: 14 }}>
          <FilterBar currentQ={q} currentStages={stageFilter} currentCity={city} currentPriority={priority} currentIndustry={industry} currentStoreType={storeType} industryOptions={industryOptions} storeTypeOptions={storeTypeOptions} view={view} />
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 8, fontSize: 12.5, color: 'var(--red)', marginBottom: 12 }}>
            {error.message}
          </div>
        )}

        {/* Table */}
        <MerchantsTable rows={rows} view={view} />

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} view={view} q={q} stages={stageFilter} city={city} priority={priority} industry={industry} storeType={storeType} />
        )}
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────
function Pagination({
  page, totalPages, view, q, stages, city, priority, industry, storeType,
}: {
  page: number; totalPages: number; view: string; q: string; stages: string[]; city: string; priority: string; industry: string; storeType: string;
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
