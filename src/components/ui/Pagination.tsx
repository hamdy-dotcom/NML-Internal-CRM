'use client';

export const PAGE_SIZE = 100;

interface Props {
  page: number;      // 0-indexed
  total: number;
  pageSize?: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, pageSize = PAGE_SIZE, onChange }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  if (total === 0 || totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to   = Math.min((page + 1) * pageSize, total);

  // Build page-number list: always show first, last, current±1, ellipsis otherwise
  const nums: (number | '…')[] = [];
  const seen = new Set<number>();
  function push(n: number) {
    if (n >= 0 && n < totalPages && !seen.has(n)) { seen.add(n); nums.push(n); }
  }
  push(0);
  if (page > 2) nums.push('…');
  for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) push(i);
  if (page < totalPages - 3) nums.push('…');
  push(totalPages - 1);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '3px 9px', height: 30, minWidth: 30,
    cursor: active ? 'default' : 'pointer',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--ink-3)', fontSize: 12.5, flex: 1, whiteSpace: 'nowrap' }}>
        {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
      </span>
      <button
        className="pill ghost"
        style={btnStyle(false)}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        ← Prev
      </button>
      {nums.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ color: 'var(--ink-4)', padding: '0 2px', fontSize: 12 }}>…</span>
        ) : (
          <button
            key={p}
            className={`pill${p === page ? ' active' : ' ghost'}`}
            style={btnStyle(p === page)}
            onClick={() => p !== page && onChange(p as number)}
          >
            {(p as number) + 1}
          </button>
        )
      )}
      <button
        className="pill ghost"
        style={btnStyle(false)}
        disabled={page >= totalPages - 1}
        onClick={() => onChange(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}
