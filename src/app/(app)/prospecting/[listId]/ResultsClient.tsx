'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import { importSearchResults, createLeadsFromResults } from '../actions';
import type { ParsedRow } from '../actions';
import type { EnrichedResult } from './page';

interface Props {
  results: EnrichedResult[];
  allResults: EnrichedResult[];
  listId: string;
  activeFilter: string;
}

function parseImportText(text: string): ParsedRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim());
  return lines.map(line => {
    const cols = line.split('\t');
    return {
      product_name: cols[0]?.trim() ?? '',
      price: cols[1]?.trim() ?? '',
      store_name: cols[2]?.trim() ?? '',
      store_url: cols[3]?.trim() ?? '',
      salla_store_id: cols[4]?.trim() || undefined,
    };
  }).filter(r => r.store_url);
}

export default function ResultsClient({ results, allResults, listId, activeFilter }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importText, setImportText] = useState('');
  const [importErr, setImportErr] = useState<string | null>(null);

  const parsedRows = parseImportText(importText);

  function toggleRow(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (checked) {
      setSelected(new Set(results.map(r => r.id)));
    } else {
      setSelected(new Set());
    }
  }

  function selectAllNew() {
    const newIds = allResults
      .filter(r => !r.matched_merchant && !r.converted)
      .map(r => r.id);
    setSelected(new Set(newIds));
  }

  function handleFilterChange(f: string) {
    const url = new URL(window.location.href);
    if (f === 'all') url.searchParams.delete('filter');
    else url.searchParams.set('filter', f);
    router.push(url.pathname + url.search);
  }

  function handleCreateLeads() {
    const ids = [...selected];
    startTransition(async () => {
      const res = await createLeadsFromResults(ids);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Done — ${res.created} merchant${res.created !== 1 ? 's' : ''} created, ${res.linked} linked.`,
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  function handleImport() {
    if (!parsedRows.length) return;
    setImportErr(null);
    startTransition(async () => {
      const res = await importSearchResults(listId, parsedRows);
      if (res.error) {
        setImportErr(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Imported ${res.inserted} result${res.inserted !== 1 ? 's' : ''}.`);
      setImportText('');
      router.refresh();
    });
  }

  const allOnPageSelected = results.length > 0 && results.every(r => selected.has(r.id));

  return (
    <>
      {/* Filter + actions bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['all', 'new', 'existing'] as const).map(f => (
            <button
              key={f}
              className={`pill ${activeFilter === f ? 'dark' : 'outline'}`}
              style={{ fontSize: 12.5 }}
              onClick={() => handleFilterChange(f)}
            >
              {f === 'all' ? 'All' : f === 'new' ? 'New only' : 'Existing only'}
            </button>
          ))}
        </div>
        <button className="pill outline" style={{ fontSize: 12.5 }} onClick={selectAllNew}>
          Select all new
        </button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="sub">{selected.size} selected</span>
          <button
            className="pill dark"
            disabled={pending}
            onClick={handleCreateLeads}
          >
            {pending ? 'Working…' : `Create ${selected.size} lead${selected.size !== 1 ? 's' : ''}`}
          </button>
          <button
            className="pill outline"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* Results table */}
      {results.length === 0 ? (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          <EmptyState
            icon="📭"
            title="No results"
            description="Import product data below to populate this list."
          />
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
          <table className="nml-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={e => toggleAll(e.target.checked)}
                  />
                </th>
                <th style={{ width: 56 }}>Image</th>
                <th>Product</th>
                <th>Price</th>
                <th>Store</th>
                <th>Store URL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.id} style={{ opacity: r.converted ? 0.6 : 1 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      disabled={r.converted}
                      onChange={() => toggleRow(r.id)}
                    />
                  </td>
                  <td>
                    {r.image_url ? (
                      <div style={{ width: 48, height: 48, borderRadius: 6, overflow: 'hidden', background: 'var(--g-line)', flexShrink: 0 }}>
                        <Image
                          src={r.image_url}
                          alt={r.product_name ?? 'Product'}
                          width={48}
                          height={48}
                          style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                          unoptimized
                        />
                      </div>
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 6, background: 'var(--g-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        🛍️
                      </div>
                    )}
                  </td>
                  <td>
                    {r.product_url ? (
                      <a
                        href={r.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ellipsis"
                        style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13, maxWidth: 220, display: 'block' }}
                      >
                        {r.product_name ?? r.product_url}
                      </a>
                    ) : (
                      <span className="ellipsis" style={{ fontSize: 13, maxWidth: 220, display: 'block' }}>
                        {r.product_name ?? '—'}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: 12.5 }}>{r.price ?? '—'}</span>
                  </td>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{r.store_name ?? '—'}</td>
                  <td>
                    {r.store_url ? (
                      <a
                        href={r.store_url.startsWith('http') ? r.store_url : 'https://' + r.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono ellipsis"
                        style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 11.5, maxWidth: 160, display: 'block' }}
                      >
                        {r.store_url_key ?? r.store_url}
                      </a>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td>
                    {r.matched_merchant ? (
                      <Link href={`/merchants/${r.merchant_id}`} style={{ textDecoration: 'none' }}>
                        <span className="badge badge-blue" style={{ cursor: 'pointer' }}>
                          Existing · {r.merchant_stage ?? 'Unknown'}
                        </span>
                      </Link>
                    ) : r.converted ? (
                      <span className="badge badge-green">Lead created</span>
                    ) : (
                      <span className="badge badge-ghost">New</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Import section */}
      <div className="glass-panel" style={{ padding: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
          Import results
        </h3>
        <p className="sub" style={{ margin: '0 0 12px', fontSize: 12.5 }}>
          Paste TSV data (tab-separated columns):{' '}
          <span className="mono" style={{ fontSize: 11 }}>product_name · price · store_name · store_url · salla_store_id (optional)</span>
        </p>
        <textarea
          value={importText}
          onChange={e => { setImportText(e.target.value); setImportErr(null); }}
          rows={6}
          placeholder={'Kids hoodie\t149\tLittle Stars\thttps://little-stars.com\t123456\nOrganic soap\t89\tNatur\thttps://natur.sa'}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }}
        />
        {importErr && (
          <p style={{ fontSize: 12.5, color: 'var(--red)', margin: '6px 0 0' }}>{importErr}</p>
        )}
        {parsedRows.length > 0 && (
          <p className="sub" style={{ margin: '6px 0 0', fontSize: 12 }}>
            {parsedRows.length} row{parsedRows.length !== 1 ? 's' : ''} parsed
          </p>
        )}
        <div style={{ marginTop: 12 }}>
          <button
            className="pill dark"
            disabled={parsedRows.length === 0 || pending}
            onClick={handleImport}
          >
            {pending ? 'Importing…' : `Import ${parsedRows.length > 0 ? parsedRows.length : ''} row${parsedRows.length !== 1 ? 's' : ''}`}
          </button>
        </div>

        {/* Re-run info */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--g-line)' }}>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-3)' }}>
            <strong style={{ color: 'var(--ink-2)' }}>Re-run search:</strong> Re-running is a manual step — run your search externally, then paste the new results above.
          </p>
        </div>
      </div>
    </>
  );
}
