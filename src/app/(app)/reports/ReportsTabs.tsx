'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

export const TABS = [
  { key: 'funnel',      label: 'Funnel' },
  { key: 'specialists', label: 'Specialists' },
  { key: 'source',      label: 'Source & Batch' },
  { key: 'onboarding',  label: 'Onboarding' },
  { key: 'shelf',       label: 'Shelf Throughput' },
] as const;

export type TabKey = (typeof TABS)[number]['key'];

const RANGES = [
  { key: 'week',    label: 'This week' },
  { key: 'month',   label: 'This month' },
  { key: 'last30',  label: 'Last 30 days' },
  { key: 'custom',  label: 'Custom' },
] as const;

interface ReportsTabsProps {
  activeTab: TabKey;
  activeRange: string;
  from?: string;
  to?: string;
  specialist?: string;
}

export default function ReportsTabs({ activeTab, activeRange, from, to, specialist }: ReportsTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const push = useCallback((updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    router.push(`${pathname}?${next.toString()}`);
  }, [router, pathname, sp]);

  return (
    <div>
      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            className={`pill${activeTab === t.key ? ' active' : ''}`}
            style={{ fontSize: 13, padding: '5px 14px', cursor: 'pointer', border: 'none', background: activeTab === t.key ? 'var(--g-solid)' : 'transparent', color: activeTab === t.key ? 'var(--ink)' : 'var(--ink-2)' }}
            onClick={() => push({ tab: t.key })}
          >
            {t.label}
          </button>
        ))}

        {/* spacer */}
        <div style={{ flex: 1 }} />

        {/* ── Range selector ── */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {RANGES.map(r => (
            <button
              key={r.key}
              className={`pill${activeRange === r.key ? ' active' : ''}`}
              style={{ fontSize: 12, padding: '4px 11px', cursor: 'pointer', border: 'none', background: activeRange === r.key ? 'var(--g-solid)' : 'transparent', color: activeRange === r.key ? 'var(--ink)' : 'var(--ink-3)' }}
              onClick={() => push({ range: r.key, from: undefined, to: undefined })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Custom date inputs (only when range=custom) ── */}
      {activeRange === 'custom' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>From</label>
          <input
            type="date"
            className="pill outline"
            style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
            defaultValue={from ?? ''}
            onChange={e => push({ from: e.target.value })}
          />
          <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>To</label>
          <input
            type="date"
            className="pill outline"
            style={{ fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
            defaultValue={to ?? ''}
            onChange={e => push({ to: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
