'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { VMerchantList, MerchantPriority } from '@/lib/database.types';
import StageBadge from '@/components/ui/StageBadge';
import PhoneCell from '@/components/ui/PhoneCell';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import UserPicker from '@/components/ui/UserPicker';
import { isOverdue, fmtDate, PRIORITY_LABELS } from '@/lib/utils';
import { bulkAssign, bulkSetPriority, bulkAddTag } from './actions';

interface Props {
  rows: VMerchantList[];
  view: string;
}

type SortKey = 'store_name' | 'city' | 'stage' | 'priority' | 'next_action_at' | 'product_total';
type SortDir = 'asc' | 'desc';

export default function MerchantsTable({ rows, view }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('store_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Bulk action modals
  const [reassignOpen, setReassignOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState<string | null>(null);
  const [newPriority, setNewPriority] = useState<MerchantPriority>('medium');
  const [newTag, setNewTag] = useState('');

  const [pending, startTransition] = useTransition();

  // ── Sort rows ──────────────────────────────────────────────────────────
  const sorted = [...rows].sort((a, b) => {
    let av: string | number | null = null;
    let bv: string | number | null = null;
    if (sortKey === 'store_name') { av = a.store_name; bv = b.store_name; }
    else if (sortKey === 'city') { av = a.city; bv = b.city; }
    else if (sortKey === 'stage') { av = a.stage; bv = b.stage; }
    else if (sortKey === 'priority') { av = a.priority; bv = b.priority; }
    else if (sortKey === 'next_action_at') { av = a.next_action_at; bv = b.next_action_at; }
    else if (sortKey === 'product_total') { av = a.product_total; bv = b.product_total; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleAll() {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map(r => r.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const ids = Array.from(selected);

  function SortArrow({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: 'var(--ink-5)' }}> ↕</span>;
    return <span style={{ color: 'var(--blue)' }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>;
  }

  if (!rows.length) {
    const messages: Record<string, string> = {
      my:         'You have no merchants assigned to you.',
      needs:      'No merchants need action right now.',
      form_pending: 'No forms are pending submission.',
      onboarding: 'No merchants in onboarding.',
      active:     'No active merchants.',
      on_hold:    'No merchants on hold.',
      lost:       'No lost merchants.',
      all:        'No merchants found. Try adjusting your filters.',
    };
    return (
      <EmptyState
        icon="🏪"
        title="No merchants"
        description={messages[view] ?? 'No merchants found.'}
      />
    );
  }

  return (
    <>
      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="bulk-bar" style={{ marginBottom: 10 }}>
          <span className="count">{selected.size} selected</span>
          <button onClick={() => setReassignOpen(true)}>Reassign</button>
          <button onClick={() => setPriorityOpen(true)}>Set priority</button>
          <button onClick={() => setTagOpen(true)}>Add tag</button>
          <button
            onClick={() => {
              const csv = [
                ['Code', 'Store', 'City', 'Stage', 'Owner', 'SKUs'],
                ...sorted.filter(r => selected.has(r.id)).map(r => [
                  r.merchant_code, r.store_name, r.city ?? '', r.stage,
                  r.acquisition_owner_name ?? '', String(r.product_total),
                ]),
              ].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = 'merchants.csv'; a.click();
            }}
          >
            Export
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
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th onClick={() => toggleSort('store_name')} style={{ cursor: 'pointer' }}>
                Store<SortArrow col="store_name" />
              </th>
              <th>Phone</th>
              <th onClick={() => toggleSort('city')} style={{ cursor: 'pointer' }}>
                City<SortArrow col="city" />
              </th>
              <th onClick={() => toggleSort('stage')} style={{ cursor: 'pointer' }}>
                Stage<SortArrow col="stage" />
              </th>
              <th>Owner</th>
              <th onClick={() => toggleSort('product_total')} style={{ cursor: 'pointer', textAlign: 'end' }}>
                SKUs<SortArrow col="product_total" />
              </th>
              <th onClick={() => toggleSort('next_action_at')} style={{ cursor: 'pointer' }}>
                Next action<SortArrow col="next_action_at" />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const overdue = isOverdue(row.next_action_at);
              return (
                <tr
                  key={row.id}
                  className={selected.has(row.id) ? 'sel' : overdue ? 'warn' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={e => {
                    if ((e.target as HTMLElement).tagName === 'INPUT') return;
                    router.push(`/merchants/${row.id}`);
                  }}
                >
                  <td onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--ink)', maxWidth: 200 }} className="ellipsis">
                      {row.store_name}
                    </div>
                    <div className="sub mono">{row.merchant_code}</div>
                  </td>
                  <td><PhoneCell phone={row.phone} whatsapp={row.whatsapp} /></td>
                  <td>
                    <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>{row.city ?? '—'}</span>
                  </td>
                  <td><StageBadge stage={row.stage} /></td>
                  <td>
                    <span style={{ color: 'var(--ink-2)', fontSize: 12.5 }}>
                      {row.acquisition_owner_name ?? '—'}
                    </span>
                  </td>
                  <td className="num">{row.product_total}</td>
                  <td>
                    {row.next_action_at ? (
                      <span style={{ color: overdue ? 'var(--red)' : 'var(--ink-2)', fontSize: 12.5 }}>
                        {fmtDate(row.next_action_at)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ink-4)' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reassign modal */}
      <Modal open={reassignOpen} onClose={() => setReassignOpen(false)} title="Reassign merchants" footer={<>
        <button className="pill outline" onClick={() => setReassignOpen(false)}>Cancel</button>
        <button className="pill dark" disabled={!newOwnerId || pending} onClick={() => {
          if (!newOwnerId) return;
          startTransition(async () => {
            const result = await bulkAssign(ids, newOwnerId);
            if (result.error) { toast.error(result.error); }
            else { toast.success('Merchants reassigned.'); setSelected(new Set()); setReassignOpen(false); }
          });
        }}>{pending ? 'Saving…' : 'Reassign'}</button>
      </>}>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 12px' }}>Reassigning {ids.length} merchant{ids.length !== 1 ? 's' : ''} to:</p>
        <UserPicker value={newOwnerId} onChange={setNewOwnerId} roles={['acq_specialist', 'acq_manager', 'admin']} />
      </Modal>

      {/* Priority modal */}
      <Modal open={priorityOpen} onClose={() => setPriorityOpen(false)} title="Set priority" footer={<>
        <button className="pill outline" onClick={() => setPriorityOpen(false)}>Cancel</button>
        <button className="pill dark" disabled={pending} onClick={() => {
          startTransition(async () => {
            const result = await bulkSetPriority(ids, newPriority);
            if (result.error) { toast.error(result.error); }
            else { toast.success('Priority updated.'); setSelected(new Set()); setPriorityOpen(false); }
          });
        }}>{pending ? 'Saving…' : 'Apply'}</button>
      </>}>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 12px' }}>Set priority for {ids.length} merchant{ids.length !== 1 ? 's' : ''}:</p>
        <select className="field" value={newPriority} onChange={e => setNewPriority(e.target.value as MerchantPriority)}>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </Modal>

      {/* Tag modal */}
      <Modal open={tagOpen} onClose={() => setTagOpen(false)} title="Add tag" footer={<>
        <button className="pill outline" onClick={() => setTagOpen(false)}>Cancel</button>
        <button className="pill dark" disabled={!newTag.trim() || pending} onClick={() => {
          startTransition(async () => {
            const result = await bulkAddTag(ids, newTag.trim());
            if (result.error) { toast.error(result.error); }
            else { toast.success('Tag added.'); setSelected(new Set()); setTagOpen(false); setNewTag(''); }
          });
        }}>{pending ? 'Saving…' : 'Add tag'}</button>
      </>}>
        <p style={{ fontSize: 12.5, color: 'var(--ink-3)', margin: '0 0 12px' }}>Add a tag to {ids.length} merchant{ids.length !== 1 ? 's' : ''}:</p>
        <input className="field" placeholder="Tag name…" value={newTag} onChange={e => setNewTag(e.target.value)} />
      </Modal>
    </>
  );
}
