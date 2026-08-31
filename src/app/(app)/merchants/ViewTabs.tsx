'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface View { key: string; label: string; }
interface Props { views: View[]; current: string; counts: Record<string, number>; }

export default function ViewTabs({ views, current, counts }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(view: string) {
    const next = new URLSearchParams(sp.toString());
    if (view === 'all') next.delete('view'); else next.set('view', view);
    next.delete('page');
    router.push(`/merchants?${next.toString()}`);
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
      {views.map(v => {
        const n = counts[v.key];
        return (
          <button
            key={v.key}
            className={`pill${current === v.key ? ' active' : ''}`}
            style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
            onClick={() => go(v.key)}
          >
            {v.label}
            {n != null && (
              <span style={{
                fontSize: 10.5, fontVariantNumeric: 'tabular-nums',
                background: current === v.key ? 'rgba(255,255,255,.25)' : 'rgba(120,135,160,.15)',
                borderRadius: 99, padding: '1px 6px', lineHeight: 1.4,
              }}>
                {n.toLocaleString('en-US')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
