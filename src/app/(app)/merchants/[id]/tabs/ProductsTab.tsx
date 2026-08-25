'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Product, Merchant, Profile, ProductStatus } from '@/lib/database.types';
import { fmtCurrency, fmtDate, PRODUCT_STATUS_LABELS, productStatusBadgeClass } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import SkeletonRows from '@/components/ui/SkeletonRows';
import Pagination, { PAGE_SIZE } from '@/components/ui/Pagination';
import ProductImportModal from '@/components/products/ProductImportModal';

const STATUS_ORDER: ProductStatus[] = ['discovered', 'ready_for_shelf', 'in_review', 'shelved', 'rejected', 'archived'];

interface Props {
  merchant: Merchant;
  currentProfile: Profile | null;
}

export default function ProductsTab({ merchant, currentProfile }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [products,     setProducts]     = useState<Product[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(0);
  const [filter,       setFilter]       = useState<ProductStatus | 'all'>('all');
  const [loading,      setLoading]      = useState(true);
  const [importOpen,   setImportOpen]   = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase.from('products') as any)
        .select('*', { count: 'exact' })
        .eq('merchant_id', merchant.id)
        .order('created_at', { ascending: false });
      if (filter !== 'all') q = q.eq('status', filter);
      const from = page * PAGE_SIZE;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error, count } = await (q.range(from, from + PAGE_SIZE - 1) as any);
      if (!error) {
        setProducts((data ?? []) as Product[]);
        setTotal(count ?? 0);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant.id, filter, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { setPage(0); }, [filter]);

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        {/* Status strip */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            className={`pill${filter === 'all' ? ' active' : ' ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => setFilter('all')}
          >
            All ({total.toLocaleString('en-US')})
          </button>
          {STATUS_ORDER.map(s => (
            <button
              key={s}
              className={`pill${filter === s ? ' active' : ' ghost'}`}
              style={{ fontSize: 12 }}
              onClick={() => setFilter(s)}
            >
              {PRODUCT_STATUS_LABELS[s]}{filter === s ? ` (${total.toLocaleString('en-US')})` : ''}
            </button>
          ))}
        </div>

        <button className="pill outline" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setImportOpen(true)}>
          ↑ Upload products
        </button>
      </div>

      {loading ? (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="nml-table" style={{ marginBottom: 0 }}>
            <tbody><SkeletonRows cols={8} rows={10} /></tbody>
          </table>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No products"
          description={filter === 'all' ? 'No products imported for this merchant yet.' : `No ${PRODUCT_STATUS_LABELS[filter as ProductStatus]} products.`}
        />
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="nml-table" style={{ marginBottom: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 56 }}>Image</th>
                  <th>Name</th>
                  <th>SKU</th>
                  <th style={{ textAlign: 'end' }}>Price</th>
                  <th style={{ textAlign: 'end' }}>Stock</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Added</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      ) : (
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--g-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, maxWidth: 220 }} className="ellipsis">{p.name}</div>
                      {p.name_ar && <div className="sub">{p.name_ar}</div>}
                    </td>
                    <td><span className="mono" style={{ fontSize: 11 }}>{p.sku ?? '—'}</span></td>
                    <td className="num">{fmtCurrency(p.price)}</td>
                    <td className="num">{p.stock ?? '—'}</td>
                    <td><span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{p.category ?? '—'}</span></td>
                    <td><span className={productStatusBadgeClass(p.status)}>{PRODUCT_STATUS_LABELS[p.status]}</span></td>
                    <td><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtDate(p.created_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination page={page} total={total} onChange={setPage} />

      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        merchantId={merchant.id}
        merchantStage={merchant.stage}
        onImportDone={() => { setImportOpen(false); router.refresh(); fetchProducts(); }}
      />
    </div>
  );
}
