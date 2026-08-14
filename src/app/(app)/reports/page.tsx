import { createClient } from '@/lib/supabase/server';
import type { VSpecialistPerformance, Merchant, MerchantOnboardingStep, Product, LeadBatch } from '@/lib/database.types';
import ReportsTabs, { type TabKey } from './ReportsTabs';

/* ─────────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────────── */

function getDateRange(range: string, from?: string, to?: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { gte: start.toISOString() };
  }
  if (range === 'last30') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { gte: start.toISOString() };
  }
  if (range === 'custom') {
    return { gte: from, lte: to };
  }
  return {};
}

function pct(n: number, d: number): string {
  if (!d) return '—';
  return `${Math.round((n / d) * 100)}%`;
}

function dropPct(current: number, previous: number): string {
  if (!previous) return '';
  const drop = Math.round(((previous - current) / previous) * 100);
  return drop > 0 ? `↓${drop}%` : '';
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function avgDays(pairs: Array<[string | null, string | null]>): string {
  const valid = pairs
    .map(([a, b]) => daysBetween(a, b))
    .filter((d): d is number => d !== null && d >= 0);
  if (!valid.length) return '—';
  return `${Math.round(valid.reduce((s, v) => s + v, 0) / valid.length)}d`;
}

function weekKey(date: string | null): string {
  if (!date) return 'unknown';
  const d = new Date(date);
  // Monday of that week
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Sub-section: Export link
───────────────────────────────────────────────────────────────────────────── */
function ExportLink({ tab, params }: { tab: string; params: Record<string, string | undefined> }) {
  const qs = new URLSearchParams();
  qs.set('tab', tab);
  for (const [k, v] of Object.entries(params)) {
    if (v) qs.set(k, v);
  }
  return (
    <a
      href={`/api/reports/export?${qs.toString()}`}
      download
      className="pill outline"
      style={{ fontSize: 12, padding: '4px 12px', color: 'var(--ink-2)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      ↓ Export CSV
    </a>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab 1: Funnel
───────────────────────────────────────────────────────────────────────────── */
const FUNNEL_STAGES: Merchant['stage'][] = [
  'new', 'assigned', 'contacted', 'interested',
  'form_sent', 'cta_completed', 'onboarding', 'active',
];

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  assigned: 'Assigned',
  contacted: 'Contacted',
  interested: 'Interested',
  form_sent: 'Form Sent',
  cta_completed: 'CTA Completed',
  onboarding: 'Onboarding',
  active: 'Active',
};

interface FunnelData {
  counts: Record<string, number>;
}

function FunnelTab({ data, exportParams }: { data: FunnelData; exportParams: Record<string, string | undefined> }) {
  const maxCount = Math.max(...FUNNEL_STAGES.map(s => data.counts[s] ?? 0), 1);

  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Stage Funnel</h2>
        <ExportLink tab="funnel" params={exportParams} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FUNNEL_STAGES.map((stage, i) => {
          const count = data.counts[stage] ?? 0;
          const prev = i > 0 ? (data.counts[FUNNEL_STAGES[i - 1]] ?? 0) : count;
          const widthPct = Math.round((count / maxCount) * 100);
          const drop = i > 0 ? dropPct(count, prev) : '';

          return (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Label */}
              <div style={{ width: 120, flexShrink: 0, fontSize: 12.5, color: 'var(--ink-2)', textAlign: 'right' }}>
                {STAGE_LABELS[stage]}
              </div>

              {/* Bar */}
              <div style={{ flex: 1, height: 28, background: 'rgba(0,0,0,.05)', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{
                  width: `${widthPct}%`,
                  height: '100%',
                  background: stage === 'active'
                    ? 'var(--green)'
                    : stage === 'cta_completed' || stage === 'onboarding'
                    ? 'var(--blue)'
                    : 'var(--ink-3)',
                  borderRadius: 6,
                  minWidth: count > 0 ? 4 : 0,
                  transition: 'width .3s ease',
                }} />
              </div>

              {/* Count */}
              <div className="mono" style={{ width: 50, fontSize: 13, fontWeight: 600, color: 'var(--ink)', textAlign: 'right' }}>
                {count.toLocaleString()}
              </div>

              {/* Drop % */}
              <div style={{ width: 48, fontSize: 11.5, color: drop ? 'var(--red)' : 'transparent', textAlign: 'right', flexShrink: 0 }}>
                {drop || '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary stat */}
      <div style={{ marginTop: 24, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {(['new', 'active'] as const).map(stage => (
          <div key={stage} className="stat-tile" style={{ padding: '12px 20px', borderRadius: 10, minWidth: 120 }}>
            <div className="tile-key">{STAGE_LABELS[stage]}</div>
            <div className="tile-value">{(data.counts[stage] ?? 0).toLocaleString()}</div>
          </div>
        ))}
        <div className="stat-tile green" style={{ padding: '12px 20px', borderRadius: 10, minWidth: 120 }}>
          <div className="tile-key">Overall conversion</div>
          <div className="tile-value">
            {pct(data.counts['active'] ?? 0, data.counts['new'] ?? 0)}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab 2: Specialist performance
───────────────────────────────────────────────────────────────────────────── */
function SpecialistsTab({ rows, exportParams }: { rows: VSpecialistPerformance[]; exportParams: Record<string, string | undefined> }) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Specialist Performance</h2>
        <ExportLink tab="specialists" params={exportParams} />
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Open now</th>
              <th style={{ textAlign: 'right' }}>Assigned</th>
              <th style={{ textAlign: 'right' }}>Contacted</th>
              <th style={{ textAlign: 'right' }}>Forms sent</th>
              <th style={{ textAlign: 'right' }}>CTA done</th>
              <th style={{ textAlign: 'right' }}>Lost</th>
              <th style={{ textAlign: 'right' }}>Conversion %</th>
              <th style={{ textAlign: 'right' }}>Avg days → CTA</th>
              <th style={{ textAlign: 'right' }}>Avg days → Contact</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>
                  No data for this period
                </td>
              </tr>
            )}
            {rows.map(r => (
              <tr key={r.user_id}>
                <td style={{ fontWeight: 500 }}>{r.full_name ?? '—'}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.open_now ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.assigned ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.contacted ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.forms_sent ?? 0}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.cta_done ?? 0}</td>
                <td className="num" style={{ textAlign: 'right', color: 'var(--red)' }}>{r.lost ?? 0}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`badge ${parseFloat(r.conversion_pct ?? '0') >= 10 ? 'badge-green' : 'badge-amber'}`}>
                    {r.conversion_pct != null ? `${parseFloat(r.conversion_pct).toFixed(1)}%` : '—'}
                  </span>
                </td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>
                  {r.avg_days_to_cta != null ? `${parseFloat(r.avg_days_to_cta).toFixed(1)}d` : '—'}
                </td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>
                  {r.avg_days_to_contact != null ? `${parseFloat(r.avg_days_to_contact).toFixed(1)}d` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab 3: Source & Batch
───────────────────────────────────────────────────────────────────────────── */
interface SourceRow {
  source: string;
  total: number;
  contacted: number;
  cta: number;
  active: number;
}

interface BatchRow {
  batchId: string;
  batchName: string;
  total: number;
  contacted: number;
  cta: number;
  active: number;
}

function SourceTab({
  sourceRows,
  batchRows,
  exportParams,
}: {
  sourceRows: SourceRow[];
  batchRows: BatchRow[];
  exportParams: Record<string, string | undefined>;
}) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Source &amp; Batch</h2>
        <ExportLink tab="source" params={exportParams} />
      </div>

      {/* By source */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>By Source</h3>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Source</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Contacted %</th>
              <th style={{ textAlign: 'right' }}>CTA %</th>
              <th style={{ textAlign: 'right' }}>Conversion (active)</th>
            </tr>
          </thead>
          <tbody>
            {sourceRows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>No data</td>
              </tr>
            )}
            {sourceRows.map(r => (
              <tr key={r.source}>
                <td>
                  <span className="badge badge-ghost">{r.source}</span>
                </td>
                <td className="num" style={{ textAlign: 'right' }}>{r.total.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{pct(r.contacted, r.total)}</td>
                <td style={{ textAlign: 'right' }}>{pct(r.cta, r.total)}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`badge ${r.active / r.total >= 0.1 ? 'badge-green' : 'badge-amber'}`}>
                    {pct(r.active, r.total)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* By batch */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>By Batch</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Batch</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Contacted %</th>
              <th style={{ textAlign: 'right' }}>CTA %</th>
              <th style={{ textAlign: 'right' }}>Conversion (active)</th>
            </tr>
          </thead>
          <tbody>
            {batchRows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>No batches</td>
              </tr>
            )}
            {batchRows.map(r => (
              <tr key={r.batchId}>
                <td style={{ fontWeight: 500 }}>{r.batchName}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.total.toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>{pct(r.contacted, r.total)}</td>
                <td style={{ textAlign: 'right' }}>{pct(r.cta, r.total)}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`badge ${r.active / r.total >= 0.1 ? 'badge-green' : 'badge-amber'}`}>
                    {pct(r.active, r.total)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab 4: Onboarding
───────────────────────────────────────────────────────────────────────────── */
interface OnboardingStepStat {
  title: string;
  total: number;
  done: number;
  avgDays: string;
}

interface OnboardingData {
  stepStats: OnboardingStepStat[];
  avgCtaToActive: string;
}

function OnboardingTab({ data, exportParams }: { data: OnboardingData; exportParams: Record<string, string | undefined> }) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Onboarding</h2>
        <ExportLink tab="onboarding" params={exportParams} />
      </div>

      {/* CTA → Active stat */}
      <div style={{ marginBottom: 24 }}>
        <div className="stat-tile blue" style={{ display: 'inline-flex', flexDirection: 'column', padding: '12px 20px', borderRadius: 10 }}>
          <div className="tile-key">Avg days: CTA → Active</div>
          <div className="tile-value">{data.avgCtaToActive}</div>
        </div>
      </div>

      {/* Steps table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Step</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Done</th>
              <th style={{ textAlign: 'right' }}>Completion %</th>
              <th style={{ textAlign: 'right' }}>Avg days pending</th>
            </tr>
          </thead>
          <tbody>
            {data.stepStats.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>No onboarding data</td>
              </tr>
            )}
            {data.stepStats.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{s.title}</td>
                <td className="num" style={{ textAlign: 'right' }}>{s.total}</td>
                <td className="num" style={{ textAlign: 'right' }}>{s.done}</td>
                <td style={{ textAlign: 'right' }}>
                  <span className={`badge ${s.done / (s.total || 1) >= 0.8 ? 'badge-green' : s.done / (s.total || 1) >= 0.5 ? 'badge-amber' : 'badge-red'}`}>
                    {pct(s.done, s.total)}
                  </span>
                </td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{s.avgDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tab 5: Shelf throughput
───────────────────────────────────────────────────────────────────────────── */
interface WeekRow {
  week: string;
  ready: number;
  shelved: number;
  avgDaysReadyToShelved: string;
}

interface TopMerchant {
  merchantId: string;
  storeName: string;
  shelvedCount: number;
}

interface ShelfData {
  weekRows: WeekRow[];
  topMerchants: TopMerchant[];
}

function ShelfTab({ data, exportParams }: { data: ShelfData; exportParams: Record<string, string | undefined> }) {
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Shelf Throughput</h2>
        <ExportLink tab="shelf" params={exportParams} />
      </div>

      {/* Weekly table */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>Weekly</h3>
      <div style={{ overflowX: 'auto', marginBottom: 32 }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Week of</th>
              <th style={{ textAlign: 'right' }}>Ready</th>
              <th style={{ textAlign: 'right' }}>Shelved</th>
              <th style={{ textAlign: 'right' }}>Avg days ready→shelved</th>
            </tr>
          </thead>
          <tbody>
            {data.weekRows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>No data</td>
              </tr>
            )}
            {data.weekRows.map(r => (
              <tr key={r.week}>
                <td className="mono" style={{ fontSize: 12 }}>{r.week}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.ready}</td>
                <td className="num" style={{ textAlign: 'right' }}>{r.shelved}</td>
                <td className="mono" style={{ textAlign: 'right', fontSize: 12 }}>{r.avgDaysReadyToShelved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top merchants */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>Top 10 merchants by shelved SKUs</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="nml-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th>Store</th>
              <th style={{ textAlign: 'right' }}>Shelved SKUs</th>
            </tr>
          </thead>
          <tbody>
            {data.topMerchants.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '32px 0' }}>No data</td>
              </tr>
            )}
            {data.topMerchants.map((m, i) => (
              <tr key={m.merchantId}>
                <td className="sub">{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{m.storeName}</td>
                <td className="num" style={{ textAlign: 'right' }}>{m.shelvedCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Page
───────────────────────────────────────────────────────────────────────────── */

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    specialist?: string;
  }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const tab = (params.tab ?? 'funnel') as TabKey;
  const range = params.range ?? 'month';
  const from = params.from;
  const to = params.to;

  const { gte, lte } = getDateRange(range, from, to);

  const supabase = await createClient();

  const exportParams: Record<string, string | undefined> = { range, from, to };

  /* ── Fetch data for the active tab only ─────────────────────────────────── */

  let funnelData: FunnelData | null = null;
  let specialistRows: VSpecialistPerformance[] = [];
  let sourceRows: SourceRow[] = [];
  let batchRows: BatchRow[] = [];
  let onboardingData: OnboardingData | null = null;
  let shelfData: ShelfData | null = null;

  // ── Tab 1: Funnel ──────────────────────────────────────────────────────────
  if (tab === 'funnel') {
    // Fetch all merchants (any stage) so we can compute cumulative funnel counts.
    // Cumulative: stage N count = merchants whose current stage is at index >= N.
    let allQ = supabase
      .from('merchants')
      .select('stage, created_at');
    if (gte) allQ = allQ.gte('created_at', gte);
    if (lte) allQ = allQ.lte('created_at', lte);
    const { data: allRaw } = await allQ;
    const allRows = (allRaw ?? []) as Pick<Merchant, 'stage' | 'created_at'>[];

    const stageIndex = Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s, i]));
    const cumulative: Record<string, number> = {};
    for (const stage of FUNNEL_STAGES) cumulative[stage] = 0;

    for (const r of allRows) {
      const idx = stageIndex[r.stage];
      if (idx === undefined) continue; // lost, on_hold, etc. — skip
      for (let i = 0; i <= idx; i++) {
        cumulative[FUNNEL_STAGES[i]]++;
      }
    }

    funnelData = { counts: cumulative };
  }

  // ── Tab 2: Specialists ─────────────────────────────────────────────────────
  if (tab === 'specialists') {
    const { data } = await supabase
      .from('v_specialist_performance')
      .select('*');
    specialistRows = (data ?? []) as VSpecialistPerformance[];
  }

  // ── Tab 3: Source & Batch ──────────────────────────────────────────────────
  if (tab === 'source') {
    let q = supabase
      .from('merchants')
      .select('source, stage, batch_id, created_at');
    if (gte) q = q.gte('created_at', gte);
    if (lte) q = q.lte('created_at', lte);
    const { data: merchantsRaw } = await q;
    const merchants = (merchantsRaw ?? []) as Pick<Merchant, 'source' | 'stage' | 'batch_id' | 'created_at'>[];

    // Fetch batch names
    const { data: batchesRaw } = await supabase
      .from('lead_batches')
      .select('id, name');
    const batches = (batchesRaw ?? []) as Pick<LeadBatch, 'id' | 'name'>[];
    const batchMap = new Map<string, string>(batches.map(b => [b.id, b.name]));

    // Aggregate by source
    const srcMap = new Map<string, SourceRow>();
    const btchMap = new Map<string, BatchRow>();

    for (const m of merchants) {
      const src = m.source ?? 'unknown';
      const stage = m.stage as string;
      const isContacted = !['new', 'lost'].includes(stage);
      const isCta = ['cta_completed', 'onboarding', 'active'].includes(stage);
      const isActive = stage === 'active';

      // Source row
      if (!srcMap.has(src)) srcMap.set(src, { source: src, total: 0, contacted: 0, cta: 0, active: 0 });
      const sr = srcMap.get(src)!;
      sr.total++;
      if (isContacted) sr.contacted++;
      if (isCta) sr.cta++;
      if (isActive) sr.active++;

      // Batch row
      if (m.batch_id) {
        if (!btchMap.has(m.batch_id)) {
          btchMap.set(m.batch_id, {
            batchId: m.batch_id,
            batchName: batchMap.get(m.batch_id) ?? m.batch_id,
            total: 0, contacted: 0, cta: 0, active: 0,
          });
        }
        const br = btchMap.get(m.batch_id)!;
        br.total++;
        if (isContacted) br.contacted++;
        if (isCta) br.cta++;
        if (isActive) br.active++;
      }
    }

    sourceRows = [...srcMap.values()].sort((a, b) => b.total - a.total);
    batchRows = [...btchMap.values()].sort((a, b) => b.total - a.total);
  }

  // ── Tab 4: Onboarding ──────────────────────────────────────────────────────
  if (tab === 'onboarding') {
    const { data: stepsRaw } = await supabase
      .from('merchant_onboarding_steps')
      .select('title, status, created_at, completed_at');
    const steps = (stepsRaw ?? []) as Pick<MerchantOnboardingStep, 'title' | 'status' | 'created_at' | 'completed_at'>[];

    // Group by title
    const stepMap = new Map<string, { total: number; done: number; durations: number[] }>();
    for (const s of steps) {
      if (!stepMap.has(s.title)) stepMap.set(s.title, { total: 0, done: 0, durations: [] });
      const entry = stepMap.get(s.title)!;
      entry.total++;
      if (s.status === 'done' && s.completed_at) {
        entry.done++;
        const days = daysBetween(s.created_at, s.completed_at);
        if (days !== null && days >= 0) entry.durations.push(days);
      }
    }

    const stepStats: OnboardingStepStat[] = [...stepMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([title, { total, done, durations }]) => ({
        title,
        total,
        done,
        avgDays: durations.length
          ? `${Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)}d`
          : '—',
      }));

    // CTA → Active average
    const { data: activeMerchants } = await supabase
      .from('merchants')
      .select('cta_completed_at, activated_at')
      .eq('stage', 'active')
      .not('cta_completed_at', 'is', null)
      .not('activated_at', 'is', null);

    const avgCtaToActive = avgDays(
      (activeMerchants ?? []).map(m => [m.cta_completed_at, m.activated_at])
    );

    onboardingData = { stepStats, avgCtaToActive };
  }

  // ── Tab 5: Shelf ───────────────────────────────────────────────────────────
  if (tab === 'shelf') {
    let q = supabase
      .from('products')
      .select('merchant_id, ready_at, shelved_at, status');
    if (gte) q = q.gte('ready_at', gte);
    if (lte) q = q.lte('ready_at', lte);
    const { data: products } = await q;

    // Group by week
    const weekMap = new Map<string, { ready: number; shelved: number; durations: number[] }>();
    for (const p of products ?? []) {
      if (!p.ready_at) continue;
      const wk = weekKey(p.ready_at);
      if (!weekMap.has(wk)) weekMap.set(wk, { ready: 0, shelved: 0, durations: [] });
      const entry = weekMap.get(wk)!;
      entry.ready++;
      if (p.shelved_at) {
        entry.shelved++;
        const days = daysBetween(p.ready_at, p.shelved_at);
        if (days !== null && days >= 0) entry.durations.push(days);
      }
    }

    const weekRows: WeekRow[] = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, { ready, shelved, durations }]) => ({
        week,
        ready,
        shelved,
        avgDaysReadyToShelved: durations.length
          ? `${Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)}d`
          : '—',
      }));

    // Top merchants by shelved count
    const shelvedByMerchant = new Map<string, number>();
    for (const p of products ?? []) {
      if (!p.shelved_at || !p.merchant_id) continue;
      shelvedByMerchant.set(p.merchant_id, (shelvedByMerchant.get(p.merchant_id) ?? 0) + 1);
    }

    const topIds = [...shelvedByMerchant.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);

    let topMerchants: TopMerchant[] = [];
    if (topIds.length > 0) {
      const { data: mRows } = await supabase
        .from('merchants')
        .select('id, store_name')
        .in('id', topIds);
      const nameMap = new Map<string, string>((mRows ?? []).map(m => [m.id, m.store_name]));
      topMerchants = topIds.map(id => ({
        merchantId: id,
        storeName: nameMap.get(id) ?? id,
        shelvedCount: shelvedByMerchant.get(id) ?? 0,
      }));
    }

    shelfData = { weekRows, topMerchants };
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ padding: '20px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Reports</h1>
        <p className="sub">Analytics across the merchant pipeline</p>
      </div>

      {/* Glass panel */}
      <div className="glass-panel" style={{ padding: 24 }}>
        {/* Tab switcher (client component) */}
        <ReportsTabs
          activeTab={tab}
          activeRange={range}
          from={from}
          to={to}
          specialist={params.specialist}
        />

        {/* Tab content */}
        {tab === 'funnel' && funnelData && (
          <FunnelTab data={funnelData} exportParams={exportParams} />
        )}
        {tab === 'specialists' && (
          <SpecialistsTab rows={specialistRows} exportParams={exportParams} />
        )}
        {tab === 'source' && (
          <SourceTab sourceRows={sourceRows} batchRows={batchRows} exportParams={exportParams} />
        )}
        {tab === 'onboarding' && onboardingData && (
          <OnboardingTab data={onboardingData} exportParams={exportParams} />
        )}
        {tab === 'shelf' && shelfData && (
          <ShelfTab data={shelfData} exportParams={exportParams} />
        )}
      </div>
    </div>
  );
}
