'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, Merchant, Profile, ProductStatus } from '@/lib/database.types';
import { fmtCurrency, fmtDate, PRODUCT_STATUS_LABELS, productStatusBadgeClass } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import ProductImportModal from '@/components/products/ProductImportModal';

const STATUS_ORDER: ProductStatus[] = ['discovered', 'ready_for_shelf', 'in_review', 'shelved', 'rejected', 'archived'];

interface Props {
  merchant: Merchant;
  products: Product[];
  currentProfile: Profile | null;
}

export default function ProductsTab({ merchant, products, currentProfile }: Props) {
  const router = useRouter();
  const [filter,       setFilter]       = useState<ProductStatus | 'all'>('all');
  const [importOpen,   setImportOpen]   = useState(false);

  const counts = STATUS_ORDER.reduce((acc, s) => {
    acc[s] = products.filter(p => p.status === s).length;
    return acc;
  }, {} as Record<ProductStatus, number>);

  const visible = filter === 'all' ? products : products.filter(p => p.status === filter);

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
          All ({products.length})
        </button>
        {STATUS_ORDER.map(s => counts[s] > 0 && (
          <button
            key={s}
            className={`pill${filter === s ? ' active' : ' ghost'}`}
            style={{ fontSize: 12 }}
            onClick={() => setFilter(s)}
          >
            {PRODUCT_STATUS_LABELS[s]} ({counts[s]})
          </button>
        ))}
      </div>

        <button className="pill outline" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => setImportOpen(true)}>
          ↑ Upload products
        </button>
      </div>

      {visible.length === 0 ? (
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
                {visible.map(p => (
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

      <ProductImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        merchantId={merchant.id}
        merchantStage={merchant.stage}
        onImportDone={() => { setImportOpen(false); router.refresh(); }}
      />
    </div>
  );
}
