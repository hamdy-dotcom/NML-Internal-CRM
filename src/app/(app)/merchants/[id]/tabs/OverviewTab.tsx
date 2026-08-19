'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Merchant, Task } from '@/lib/database.types';
import { fmtDate, isOverdue, waLink, telLink } from '@/lib/utils';
import { updateMerchantField, removeTag, addTag } from '../actions';

interface Props {
  merchant: Merchant;
  tasks: Task[];
}

// ── Inline editable field ──────────────────────────────────────────────────
function EditableField({
  merchantId, field, label, value, type = 'text', multiline = false, display,
}: {
  merchantId: string;
  field: string;
  label: string;
  value: string | null;
  type?: string;
  multiline?: boolean;
  display?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateMerchantField(merchantId, field, draft || null);
      if (res.error) toast.error(res.error);
      else { setEditing(false); toast.success('Saved.'); }
    });
  }

  if (editing) {
    return (
      <div style={{ padding: '4px 0' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 }}>{label}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          {multiline ? (
            <textarea className="field" style={{ flex: 1, fontSize: 12.5 }} value={draft}
              onChange={e => setDraft(e.target.value)} rows={3} autoFocus />
          ) : (
            <input className="field" style={{ flex: 1, height: 30, fontSize: 12.5 }} type={type}
              value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
          )}
          <button className="pill dark" style={{ fontSize: 11.5, height: 30, padding: '0 10px' }} onClick={save} disabled={pending}>
            {pending ? '…' : 'Save'}
          </button>
          <button className="pill outline" style={{ fontSize: 11.5, height: 30, padding: '0 10px' }}
            onClick={() => { setDraft(value ?? ''); setEditing(false); }}>
            ×
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span
        onClick={() => setEditing(true)}
        title="Click to edit"
        style={{
          cursor: 'pointer',
          color: value ? 'var(--ink)' : 'var(--ink-4)',
          padding: '0 3px',
          borderRadius: 4,
          border: '1px solid transparent',
          maxWidth: '60%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        onMouseOver={e => (e.currentTarget.style.border = '1px solid var(--g-line)')}
        onMouseOut={e => (e.currentTarget.style.border = '1px solid transparent')}
      >
        {display ?? value ?? '—'}
      </span>
    </div>
  );
}

// ── Masked field ───────────────────────────────────────────────────────────
function MaskedField({ label, value }: { label: string; value: string | null }) {
  const [revealed, setRevealed] = useState(false);
  if (!value) return (
    <div className="kv">
      <span className="k">{label}</span>
      <span style={{ color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 12.5 }}>Awaiting form</span>
    </div>
  );
  const masked = value.slice(0, 2) + '··········' + value.slice(-4);
  return (
    <div className="kv">
      <span className="k">{label}</span>
      <span
        className="mono"
        style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}
        onClick={() => setRevealed(r => !r)}
        title={revealed ? 'Click to hide' : 'Click to reveal'}
      >
        {revealed ? value : masked}
      </span>
    </div>
  );
}

export default function OverviewTab({ merchant, tasks }: Props) {
  const [newTag, setNewTag] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [pending, startTransition] = useTransition();

  const openTasks = tasks.filter(t => t.status === 'open').slice(0, 3);

  const keyDates = [
    { label: 'Created', value: merchant.created_at },
    { label: 'Assigned', value: merchant.assigned_at },
    { label: 'First contact', value: merchant.first_contact_at },
    { label: 'CTA done', value: merchant.cta_completed_at },
  ];

  const overdue = isOverdue(merchant.next_action_at);

  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* LEFT: Contact card */}
      <div className="glass-panel" style={{ flex: '1 1 320px', padding: 16, minWidth: 260 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 14, marginTop: 0 }}>Contact & details</h3>

        {/* Non-editable display fields */}
        {merchant.owner_name && (
          <div className="kv">
            <span className="k">Owner</span>
            <span style={{ fontSize: 12.5 }}>{merchant.owner_name}</span>
          </div>
        )}
        <div className="kv">
          <span className="k">Phone</span>
          {merchant.phone ? (
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <a href={telLink(merchant.phone) ?? '#'} className="mono" style={{ color: 'var(--ink-2)', fontSize: 12, textDecoration: 'none' }}>{merchant.phone}</a>
              {merchant.whatsapp && <a href={waLink(merchant.whatsapp) ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: '#25D366', fontSize: 12 }}>💬</a>}
            </span>
          ) : <span style={{ color: 'var(--ink-4)', fontSize: 12.5 }}>—</span>}
        </div>

        <EditableField merchantId={merchant.id} field="email" label="Email" value={merchant.email} type="email" />
        <EditableField merchantId={merchant.id} field="city" label="City" value={merchant.city} />
        <EditableField merchantId={merchant.id} field="region" label="Region" value={merchant.region} />
        <EditableField merchantId={merchant.id} field="address" label="Address" value={merchant.address} multiline />
        <EditableField merchantId={merchant.id} field="category" label="Category" value={merchant.category} />
        <EditableField merchantId={merchant.id} field="sub_category" label="Sub-category" value={merchant.sub_category} />
        <EditableField merchantId={merchant.id} field="industry" label="Industry" value={merchant.industry} />
        <EditableField merchantId={merchant.id} field="store_type" label="Store type" value={merchant.store_type} />
        <EditableField merchantId={merchant.id} field="avg_monthly_orders" label="Avg monthly orders" value={merchant.avg_monthly_orders != null ? String(merchant.avg_monthly_orders) : null} type="number" />
        <EditableField merchantId={merchant.id} field="avg_monthly_sales" label="Avg monthly sales" value={merchant.avg_monthly_sales != null ? String(merchant.avg_monthly_sales) : null} type="number" display={merchant.avg_monthly_sales != null ? `SAR ${merchant.avg_monthly_sales.toLocaleString('en-US')}` : undefined} />

        <div className="kv">
          <span className="k">Salla store ID</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>{merchant.salla_store_id ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">Products count</span>
          <span className="num">{merchant.products_count ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">Rating</span>
          <span style={{ fontSize: 12.5 }}>{merchant.rating ?? '—'}</span>
        </div>
        <div className="kv">
          <span className="k">Followers</span>
          <span className="num">{merchant.followers?.toLocaleString('en-US') ?? '—'}</span>
        </div>

        <div style={{ borderTop: '1px solid var(--g-line)', margin: '10px 0' }} />

        {/* Source & batch */}
        <div className="kv">
          <span className="k">Source</span>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{merchant.source}</span>
        </div>
        {merchant.batch_id && (
          <div className="kv">
            <span className="k">Batch</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{merchant.batch_id}</span>
          </div>
        )}

        {/* Tags */}
        <div style={{ borderTop: '1px solid var(--g-line)', margin: '10px 0' }} />
        <div>
          <div className="field-label" style={{ marginBottom: 6 }}>Tags</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
            {merchant.tags.map(tag => (
              <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--blue-bg)', color: 'var(--blue-d)', borderRadius: 99, fontSize: 11.5, padding: '2px 8px' }}>
                {tag}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue-d)', fontSize: 12, lineHeight: 1, padding: '0 0 0 2px' }}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await removeTag(merchant.id, tag);
                      if (res.error) toast.error(res.error);
                    });
                  }}
                >×</button>
              </span>
            ))}
            {addingTag ? (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  className="field"
                  style={{ height: 24, fontSize: 11.5, padding: '0 6px', width: 90 }}
                  value={newTag}
                  onChange={e => setNewTag(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      startTransition(async () => {
                        const res = await addTag(merchant.id, newTag.trim());
                        if (res.error) toast.error(res.error);
                        else { setNewTag(''); setAddingTag(false); }
                      });
                    }
                    if (e.key === 'Escape') { setNewTag(''); setAddingTag(false); }
                  }}
                />
                <button className="pill dark" style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => {
                    if (!newTag.trim()) return;
                    startTransition(async () => {
                      const res = await addTag(merchant.id, newTag.trim());
                      if (res.error) toast.error(res.error);
                      else { setNewTag(''); setAddingTag(false); }
                    });
                  }}
                >Add</button>
                <button className="pill outline" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setNewTag(''); setAddingTag(false); }}>×</button>
              </div>
            ) : (
              <button
                className="pill ghost"
                style={{ fontSize: 11.5, padding: '2px 8px' }}
                onClick={() => setAddingTag(true)}
              >+ Tag</button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: Next action + tasks + key dates */}
      <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Next action card */}
        <div
          className="glass-panel"
          style={{
            padding: 16,
            background: overdue ? 'var(--red-bg)' : undefined,
            border: overdue ? '1px solid rgba(163,48,47,.25)' : undefined,
          }}
        >
          <h3 style={{ fontSize: 13, fontWeight: 500, color: overdue ? 'var(--red)' : 'var(--ink)', marginBottom: 10, marginTop: 0 }}>
            {overdue ? '⚠ Next action overdue' : 'Next action'}
          </h3>
          {merchant.next_action_at ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: overdue ? 'var(--red-d)' : 'var(--ink)' }}>
                {fmtDate(merchant.next_action_at)}
              </div>
              {overdue && (
                <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>
                  Log an activity to update the next action date.
                </div>
              )}
            </div>
          ) : (
            <span style={{ color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 12.5 }}>Not scheduled</span>
          )}
        </div>

        {/* Open tasks */}
        <div className="glass-panel" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 10, marginTop: 0 }}>Open tasks</h3>
          {openTasks.length === 0 ? (
            <p className="sub">No open tasks.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {openTasks.map(t => (
                <div key={t.id} style={{ fontSize: 12.5, color: 'var(--ink-2)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ color: isOverdue(t.due_at) ? 'var(--red)' : 'var(--blue)' }}>•</span>
                  <div>
                    <div>{t.title}</div>
                    {t.due_at && (
                      <div className="sub" style={{ color: isOverdue(t.due_at) ? 'var(--red)' : undefined }}>
                        Due {fmtDate(t.due_at)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Key dates */}
        <div className="glass-panel" style={{ padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', marginBottom: 10, marginTop: 0 }}>Key dates</h3>
          {keyDates.map(d => (
            <div key={d.label} className="kv">
              <span className="k">{d.label}</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{fmtDate(d.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
