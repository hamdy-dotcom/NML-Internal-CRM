'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import StageBadge from '@/components/ui/StageBadge';
import FetchPopup from '../products/FetchPopup';
import { fmtDate, STAGE_LABELS } from '@/lib/utils';
import type { MerchantStage } from '@/lib/database.types';

export type ExtractionRow = {
  id: string;
  store_name: string;
  store_url: string | null;
  salla_store_id: string | null;
  stage: MerchantStage;
  product_count: number;
  latest_job: {
    id: string;
    status: 'pending' | 'running' | 'done' | 'error';
    created_at: string;
    products_found: number;
    error: string | null;
  } | null;
};

type FilterStatus = 'all' | 'never' | 'running' | 'fetched' | 'failed';

const ALL_STAGES: MerchantStage[] = [
  'new', 'assigned', 'contacted', 'interested',
  'form_sent', 'cta_completed', 'onboarding', 'active', 'on_hold', 'lost', 'not_interested',
];

const STATUS_RANK: Record<string, number> = {
  never:   0,
  error:   1,
  pending: 2,
  running: 2,
  done:    3,
};

function statusOf(row: ExtractionRow): 'never' | 'running' | 'done' | 'error' {
  if (!row.latest_job) return 'never';
  if (row.latest_job.status === 'pending' || row.latest_job.status === 'running') return 'running';
  return row.latest_job.status;
}

function getRowBg(status: ReturnType<typeof statusOf>): string | undefined {
  if (status === 'running') return 'rgba(59,130,246,0.07)';
  if (status === 'done')    return 'rgba(34,197,94,0.07)';
  if (status === 'error')   return 'rgba(239,68,68,0.07)';
  return undefined;
}

export default function ExtractionTable({ rows: initialRows }: { rows: ExtractionRow[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient() as any;

  const [liveJobs, setLiveJobs] = useState<Map<string, ExtractionRow['latest_job']>>(() => {
    const m = new Map<string, ExtractionRow['latest_job']>();
    for (const r of initialRows) m.set(r.id, r.latest_job);
    return m;
  });
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus]     = useState<FilterStatus>('all');
  const [filterStage, setFilterStage]       = useState<string>('');
  const [filterMerchant, setFilterMerchant] = useState<string>('');
  const [search, setSearch]                 = useState('');
  const [fetchFor, setFetchFor]           = useState<ExtractionRow | null>(null);
  const [bulkExtracting, setBulkExtracting] = useState(false);

  const merchantNameOptions = useMemo(
    () => [...new Set(initialRows.map(r => r.store_name))].sort((a, b) => a.localeCompare(b)),
    [initialRows],
  );

  const liveJobsRef = useRef(liveJobs);
  liveJobsRef.current = liveJobs;

  const refreshJobs = useCallback(async () => {
    const merchantIds = initialRows.map(r => r.id);
    if (!merchantIds.length) return;

    const { data: jobs } = await supabase
      .from('salla_fetch_jobs')
      .select('id, merchant_id, status, error, created_at, progress')
      .in('merchant_id', merchantIds)
      .order('created_at', { ascending: false });

    if (!jobs) return;

    const latestByMerchant = new Map<string, ExtractionRow['latest_job']>();
    for (const j of jobs as Array<{ id: string; merchant_id: string; status: 'pending' | 'running' | 'done' | 'error'; error: string | null; created_at: string; progress: { products_found?: number } | null }>) {
      if (!latestByMerchant.has(j.merchant_id)) {
        latestByMerchant.set(j.merchant_id, {
          id: j.id,
          status: j.status,
          created_at: j.created_at,
          products_found: j.progress?.products_found ?? 0,
          error: j.error,
        });
      }
    }

    setLiveJobs(prev => {
      const next = new Map(prev);
      for (const id of merchantIds) {
        next.set(id, latestByMerchant.get(id) ?? null);
      }
      return next;
    });
  }, [initialRows, supabase]);

  // Poll every 2 s — only runs fetch when jobs are active
  useEffect(() => {
    const iv = setInterval(() => {
      const hasRunning = Array.from(liveJobsRef.current.values()).some(
        j => j?.status === 'pending' || j?.status === 'running',
      );
      if (hasRunning) refreshJobs();
    }, 2_000);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge live job data over initial rows
  const liveRows = initialRows.map(r => ({
    ...r,
    latest_job: liveJobs.has(r.id) ? liveJobs.get(r.id)! : r.latest_job,
  }));

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = liveRows.filter(row => {
    const s = statusOf(row);
    if (filterStatus === 'never'   && s !== 'never')   return false;
    if (filterStatus === 'running' && s !== 'running') return false;
    if (filterStatus === 'fetched' && s !== 'done')    return false;
    if (filterStatus === 'failed'  && s !== 'error')   return false;
    if (filterStage    && row.stage       !== filterStage)    return false;
    if (filterMerchant && row.store_name  !== filterMerchant) return false;
    if (search) {
      const q = search.toLowerCase();
      const nameMatch = row.store_name.toLowerCase().includes(q);
      const urlMatch  = (row.store_url ?? '').toLowerCase().includes(q);
      if (!nameMatch && !urlMatch) return false;
    }
    return true;
  });

  // ── Sort: never-fetched first, then oldest fetch ──────────────────────────
  const sorted = [...filtered].sort((a, b) => {
    const ra = STATUS_RANK[a.latest_job?.status ?? 'never'] ?? 0;
    const rb = STATUS_RANK[b.latest_job?.status ?? 'never'] ?? 0;
    if (ra !== rb) return ra - rb;
    const da = a.latest_job?.created_at ?? '';
    const db2 = b.latest_job?.created_at ?? '';
    return da < db2 ? -1 : da > db2 ? 1 : 0;
  });

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggleAll() {
    if (selected.size === sorted.length && sorted.length > 0) setSelected(new Set());
    else setSelected(new Set(sorted.map(r => r.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  // ── Bulk extract ──────────────────────────────────────────────────────────
  async function bulkExtract() {
    const ids = [...selected].filter(id => {
      const row = liveRows.find(r => r.id === id);
      return row && (row.store_url || row.salla_store_id);
    });
    if (!ids.length) {
      toast.error('None of the selected merchants have a store URL or Salla ID');
      return;
    }

    setBulkExtracting(true);
    let success = 0;
    let failed  = 0;

    for (const id of ids) {
      try {
        const res = await fetch(`/api/merchants/${id}/fetch-products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auto_import: true }),
        });
        if (res.ok) success++;
        else failed++;
      } catch {
        failed++;
      }
    }

    setBulkExtracting(false);
    await refreshJobs();
    setSelected(new Set());

    if (failed === 0) {
      toast.success(`${success} extraction job${success !== 1 ? 's' : ''} queued`);
    } else {
      toast.error(`${success} queued · ${failed} failed to start`);
    }
  }

  // ── Sub-components ────────────────────────────────────────────────────────
  function StatusCell({ row }: { row: ExtractionRow }) {
    const s = statusOf(row);

    if (s === 'never') {
      return <span style={{ color: 'var(--ink-4)', fontSize: 12.5 }}>Never fetched</span>;
    }
    if (s === 'running') {
      const n = row.latest_job?.products_found ?? 0;
      return (
        <span style={{ color: 'var(--blue)', fontSize: 12.5 }}>
          Fetching…{n > 0 ? ` ${n} found` : ''}
        </span>
      );
    }
    if (s === 'done') {
      const n     = row.latest_job?.products_found ?? 0;
      const dt    = row.latest_job?.created_at ? fmtDate(row.latest_job.created_at) : '';
      const inCRM = row.product_count;
      return (
        <div style={{ fontSize: 12.5 }}>
          <span style={{ color: 'var(--green)' }}>
            Fetched {n} from Salla{dt ? ` · ${dt}` : ''}
          </span>
          <br />
          <span style={{ color: inCRM > 0 ? 'var(--ink-3)' : 'var(--orange, var(--red))', fontWeight: inCRM === 0 ? 500 : undefined }}>
            {inCRM > 0 ? `${inCRM.toLocaleString('en-US')} in CRM` : '0 in CRM — not imported'}
          </span>
        </div>
      );
    }
    // error
    const err = row.latest_job?.error ?? '';
    return (
      <span style={{ color: 'var(--red)', fontSize: 12.5 }} title={err || undefined}>
        Failed{err ? ` · ${err.slice(0, 55)}` : ''}
      </span>
    );
  }

  function ActionBtn({ row }: { row: ExtractionRow }) {
    const canExtract = !!(row.store_url || row.salla_store_id);
    const s          = statusOf(row);
    const isRunning  = s === 'running';
    const hasPrev    = s === 'done' || s === 'error';
    const label      = isRunning ? 'Fetching…' : hasPrev ? 'Re-extract' : 'Extract';
    const disabled   = !canExtract || isRunning;
    const tooltip    = !canExtract
      ? 'No store URL or Salla store ID set for this merchant'
      : undefined;

    return (
      <button
        className="pill outline"
        style={{ fontSize: 12, opacity: disabled ? 0.45 : 1, whiteSpace: 'nowrap' }}
        disabled={disabled}
        title={tooltip}
        onClick={e => { e.stopPropagation(); setFetchFor(row); }}
      >
        {label}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {/* Merchant name dropdown */}
        <select
          className="field"
          style={{ height: 32, fontSize: 12.5, minWidth: 180 }}
          value={filterMerchant}
          onChange={e => setFilterMerchant(e.target.value)}
        >
          <option value="">All merchants</option>
          {merchantNameOptions.map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>

        {/* URL / name search */}
        <input
          className="field"
          placeholder="Search by name or URL…"
          style={{ width: 200, height: 32, padding: '0 10px', fontSize: 12.5 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {/* Merchant stage dropdown */}
        <select
          className="field"
          style={{ height: 32, fontSize: 12.5, minWidth: 140 }}
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
        >
          <option value="">Any stage</option>
          {ALL_STAGES.map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>

        {/* Extraction status pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'never', 'running', 'fetched', 'failed'] as FilterStatus[]).map(s => {
            const labels: Record<FilterStatus, string> = {
              all: 'All', never: 'Never', running: 'Running', fetched: 'Fetched', failed: 'Failed',
            };
            return (
              <button
                key={s}
                className={`pill${filterStatus === s ? ' active' : ' ghost'}`}
                style={{ fontSize: 12, padding: '3px 10px', height: 32 }}
                onClick={() => setFilterStatus(s)}
              >
                {labels[s]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar" style={{ marginBottom: 10 }}>
          <span className="count">{selected.size} selected</span>
          <button disabled={bulkExtracting} onClick={bulkExtract}>
            {bulkExtracting ? 'Queuing…' : `Extract selected (${selected.size})`}
          </button>
          <span className="close" onClick={() => setSelected(new Set())}>Clear ×</span>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="nml-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input
                  type="checkbox"
                  checked={selected.size === sorted.length && sorted.length > 0}
                  onChange={toggleAll}
                  ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < sorted.length; }}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th>Merchant</th>
              <th>Store URL</th>
              <th>Stage</th>
              <th style={{ textAlign: 'end' }}>In CRM</th>
              <th>Last fetched</th>
              <th>Extraction status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const s  = statusOf(row);
              const bg = getRowBg(s);
              return (
                <tr key={row.id} style={{ background: bg }}>
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <a href={`/merchants/${row.id}`} target="_blank" rel="noreferrer"
                      style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 13, textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}>
                      {row.store_name}
                    </a>
                  </td>
                  <td>
                    {row.store_url ? (
                      <a
                        href={row.store_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--blue)', fontSize: 12.5, textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {row.store_url.replace(/^https?:\/\//, '')}
                      </a>
                    ) : row.salla_store_id ? (
                      <span style={{ color: 'var(--ink-4)', fontSize: 12.5 }}>
                        Salla ID {row.salla_store_id}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ink-5)', fontSize: 12.5 }}>—</span>
                    )}
                  </td>
                  <td><StageBadge stage={row.stage} /></td>
                  <td className="num">
                    {row.product_count > 0 ? row.product_count.toLocaleString('en-US') : '—'}
                  </td>
                  <td>
                    <span style={{ color: 'var(--ink-3)', fontSize: 12.5 }}>
                      {row.latest_job ? fmtDate(row.latest_job.created_at) : '—'}
                    </span>
                  </td>
                  <td><StatusCell row={row} /></td>
                  <td><ActionBtn row={row} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--ink-4)', fontSize: 13 }}>
          No merchants match the current filters.
        </div>
      )}

      {/* Popup */}
      {fetchFor && (
        <FetchPopup
          merchant={{
            id:         fetchFor.id,
            store_name: fetchFor.store_name,
            store_url:  fetchFor.store_url ?? '',
          }}
          onClose={() => {
            setFetchFor(null);
            refreshJobs();
          }}
        />
      )}
    </>
  );
}
