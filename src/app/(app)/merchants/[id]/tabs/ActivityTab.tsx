'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Activity, ActivityType, ActivityOutcome, Merchant } from '@/lib/database.types';
import { timeAgo, fmtDateTime } from '@/lib/utils';
import { logActivity, updateActivity, deleteActivity } from '../actions';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const TYPES: { key: ActivityType; icon: string }[] = [
  { key: 'call',      icon: '📞' },
  { key: 'whatsapp',  icon: '💬' },
  { key: 'email',     icon: '📧' },
  { key: 'meeting',   icon: '🤝' },
  { key: 'visit',     icon: '🏪' },
  { key: 'note',      icon: '📝' },
];

const OUTCOMES: { key: ActivityOutcome; label: string }[] = [
  { key: 'answered',       label: 'Answered' },
  { key: 'no_answer',      label: 'No answer' },
  { key: 'busy',           label: 'Busy' },
  { key: 'wrong_number',   label: 'Wrong number' },
  { key: 'interested',     label: 'Interested' },
  { key: 'not_interested', label: 'Not interested' },
  { key: 'callback',       label: 'Callback' },
  { key: 'deal_agreed',    label: 'Deal agreed' },
];

const TYPE_ICONS: Record<ActivityType, string> = {
  call: '📞', whatsapp: '💬', email: '📧', meeting: '🤝', visit: '🏪', note: '📝', system: '⚙️',
};

interface Props {
  merchant: Merchant;
  activities: Activity[];
  currentUserId: string | null;
}

export default function ActivityTab({ merchant, activities, currentUserId }: Props) {
  const [type, setType] = useState<ActivityType>('call');
  const [outcome, setOutcome] = useState<ActivityOutcome | ''>('');
  const [body, setBody] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [pending, startTransition] = useTransition();
  const [filterType, setFilterType] = useState<ActivityType | 'all'>('all');
  const [visibleCount, setVisibleCount] = useState(20);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function submit() {
    if (!body.trim()) { toast.error('Activity body is required.'); return; }
    startTransition(async () => {
      const res = await logActivity(
        merchant.id, type,
        (type === 'call' && outcome) ? outcome as ActivityOutcome : null,
        body.trim(),
        nextAction || null,
      );
      if (res.error) toast.error(res.error);
      else {
        toast.success('Activity logged.');
        setBody(''); setOutcome(''); setNextAction('');
      }
    });
  }

  const filtered = activities.filter(a => filterType === 'all' || a.type === filterType);
  const visible = filtered.slice(0, visibleCount);

  return (
    <div>
      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 14 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 12, marginTop: 0 }}>Log activity</h3>

        {/* Type pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button
              key={t.key}
              className={`pill${type === t.key ? ' active' : ' ghost'}`}
              style={{ fontSize: 12, padding: '4px 12px' }}
              onClick={() => { setType(t.key); setOutcome(''); }}
            >
              {t.icon} {t.key.charAt(0).toUpperCase() + t.key.slice(1)}
            </button>
          ))}
        </div>

        {/* Outcome (calls only) */}
        {type === 'call' && (
          <div style={{ marginBottom: 12 }}>
            <label className="field-label">Outcome</label>
            <select className="field" value={outcome} onChange={e => setOutcome(e.target.value as ActivityOutcome)}>
              <option value="">Select outcome…</option>
              {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
        )}

        {/* Body */}
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Notes</label>
          <textarea
            className="field"
            placeholder="What happened? What was discussed?"
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={3}
          />
        </div>

        {/* Next action */}
        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Next action date</label>
          <input
            className="field"
            type="datetime-local"
            value={nextAction}
            onChange={e => setNextAction(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="pill dark" onClick={submit} disabled={pending || !body.trim()}>
            {pending ? 'Saving…' : 'Log activity'}
          </button>
        </div>
      </div>

      {/* ── Filter chips ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`pill${filterType === 'all' ? ' active' : ' ghost'}`} style={{ fontSize: 11.5 }} onClick={() => setFilterType('all')}>All</button>
        {TYPES.map(t => (
          <button key={t.key} className={`pill${filterType === t.key ? ' active' : ' ghost'}`} style={{ fontSize: 11.5 }} onClick={() => setFilterType(t.key)}>
            {t.icon} {t.key.charAt(0).toUpperCase() + t.key.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.length === 0 && (
          <p className="sub" style={{ textAlign: 'center', padding: 24 }}>No activities yet.</p>
        )}
        {visible.map(a => {
          const isSystem = a.type === 'system';
          const isMine = a.user_id === currentUserId;

          if (editId === a.id) {
            return (
              <div key={a.id} className="glass-card" style={{ padding: 12 }}>
                <textarea
                  className="field"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="pill outline" style={{ fontSize: 12 }} onClick={() => setEditId(null)}>Cancel</button>
                  <button className="pill dark" style={{ fontSize: 12 }} onClick={() => {
                    startTransition(async () => {
                      const res = await updateActivity(a.id, merchant.id, editBody);
                      if (res.error) toast.error(res.error);
                      else { toast.success('Updated.'); setEditId(null); }
                    });
                  }}>Save</button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={a.id}
              className="glass-card"
              style={{
                padding: '12px 14px',
                opacity: isSystem ? 0.7 : 1,
                borderLeft: `3px solid ${isSystem ? 'var(--ink-5)' : 'var(--blue)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICONS[a.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>
                        {a.type.charAt(0).toUpperCase() + a.type.slice(1)}
                      </span>
                      {a.outcome && (
                        <span className="badge badge-ghost" style={{ fontSize: 10.5 }}>
                          {OUTCOMES.find(o => o.key === a.outcome)?.label ?? a.outcome}
                        </span>
                      )}
                    </div>
                    {a.body && (
                      <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{a.body}</p>
                    )}
                    <div className="sub" style={{ marginTop: 4 }}>
                      {timeAgo(a.created_at)}
                    </div>
                  </div>
                </div>
                {!isSystem && isMine && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: 12 }}
                      onClick={() => { setEditId(a.id); setEditBody(a.body ?? ''); }}
                    >Edit</button>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12 }}
                      onClick={() => setDeleteId(a.id)}
                    >Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length < filtered.length && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="pill outline" style={{ fontSize: 12.5 }} onClick={() => setVisibleCount(n => n + 20)}>
            Load more ({filtered.length - visible.length} remaining)
          </button>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) return;
          startTransition(async () => {
            const res = await deleteActivity(deleteId, merchant.id);
            if (res.error) toast.error(res.error);
            else { toast.success('Activity deleted.'); setDeleteId(null); }
          });
        }}
        title="Delete activity"
        body="This cannot be undone."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
