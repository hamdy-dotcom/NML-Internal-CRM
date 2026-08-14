'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { createSearchList, deleteSearchList } from './actions';
import type { SearchList } from '@/lib/database.types';

interface ListWithMeta extends SearchList {
  result_count: number;
  converted_count: number;
  creator_name: string | null;
}

interface Props {
  lists: ListWithMeta[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function ProspectingClient({ lists }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // New search modal
  const [showNew, setShowNew] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ListWithMeta | null>(null);
  const [deleting, setDeleting] = useState(false);

  function handleNewSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormErr(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createSearchList(fd);
      if (res.error) {
        setFormErr(res.error);
        return;
      }
      toast.success('Search list created.');
      setShowNew(false);
      router.refresh();
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await deleteSearchList(deleteTarget.id);
    setDeleting(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Search list deleted.');
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>Prospecting</h1>
          <p className="sub" style={{ marginTop: 2 }}>Search lists of products to find merchants</p>
        </div>
        <button className="pill dark" onClick={() => setShowNew(true)}>+ New search</button>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No search lists yet"
          description="Create one to find merchants by product."
          action={<button className="pill dark" onClick={() => setShowNew(true)}>New search</button>}
        />
      ) : (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="nml-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Query</th>
                <th style={{ textAlign: 'right' }}>Results</th>
                <th style={{ textAlign: 'right' }}>Leads created</th>
                <th>Created by</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lists.map(list => (
                <tr
                  key={list.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/prospecting/${list.id}`)}
                >
                  <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{list.name}</td>
                  <td>
                    {list.query ? (
                      <span className="mono" style={{ fontSize: 12 }}>{list.query}</span>
                    ) : (
                      <span className="sub">—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="num">{list.result_count}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="num">{list.converted_count}</span>
                  </td>
                  <td className="sub">{list.creator_name ?? '—'}</td>
                  <td className="sub">{fmtDate(list.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      className="pill outline"
                      style={{ fontSize: 12, padding: '2px 10px', color: 'var(--red)' }}
                      onClick={() => setDeleteTarget(list)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New search modal */}
      <Modal open={showNew} onClose={() => { setShowNew(false); setFormErr(null); }} title="New search list">
        <form onSubmit={handleNewSubmit}>
          <div className="field">
            <label className="field-label">Name *</label>
            <input name="name" required autoFocus placeholder="e.g. Kids clothing on Salla" />
          </div>
          <div className="field">
            <label className="field-label">Search query</label>
            <textarea name="query" rows={2} placeholder="Product keywords used in the search…" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label className="field-label">Category</label>
              <input name="category" placeholder="e.g. clothing" />
            </div>
            <div className="field">
              <label className="field-label">City</label>
              <input name="city" placeholder="e.g. Riyadh" />
            </div>
            <div className="field">
              <label className="field-label">Min price</label>
              <input name="price_min" type="number" min={0} placeholder="0" />
            </div>
            <div className="field">
              <label className="field-label">Max price</label>
              <input name="price_max" type="number" min={0} placeholder="9999" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Result limit</label>
            <input name="result_limit" type="number" min={1} defaultValue={100} />
          </div>
          {formErr && (
            <p style={{ fontSize: 12.5, color: 'var(--red)', margin: '0 0 12px' }}>{formErr}</p>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="pill outline" onClick={() => { setShowNew(false); setFormErr(null); }}>
              Cancel
            </button>
            <button type="submit" className="pill dark" disabled={pending}>
              {pending ? 'Creating…' : 'Create list'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete search list"
        body={`Delete "${deleteTarget?.name}"? All imported results will also be removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        danger
      />
    </>
  );
}
