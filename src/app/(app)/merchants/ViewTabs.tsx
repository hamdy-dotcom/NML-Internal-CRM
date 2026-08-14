'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface View { key: string; label: string; }
interface Props { views: View[]; current: string; }

export default function ViewTabs({ views, current }: Props) {
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
      {views.map(v => (
        <button
          key={v.key}
          className={`pill${current === v.key ? ' active' : ''}`}
          style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}
          onClick={() => go(v.key)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
