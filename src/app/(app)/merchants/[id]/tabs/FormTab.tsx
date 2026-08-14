'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Merchant, FormLink, FormTemplate, FormSubmission, FormLinkStatus } from '@/lib/database.types';
import { fmtDateTime, fmtDate } from '@/lib/utils';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { sendForm, revokeFormLink } from '../actions';

const STATUS_BADGE: Record<FormLinkStatus, string> = {
  sent:      'badge badge-ghost',
  opened:    'badge badge-blue',
  submitted: 'badge badge-green',
  expired:   'badge badge-amber',
  revoked:   'badge badge-red',
};

const STATUS_LABELS: Record<FormLinkStatus, string> = {
  sent: 'Sent', opened: 'Opened', submitted: 'Submitted', expired: 'Expired', revoked: 'Revoked',
};

interface Props {
  merchant: Merchant;
  formLinks: FormLink[];
  formTemplates: FormTemplate[];
  formSubmissions: FormSubmission[];
}

export default function FormTab({ merchant, formLinks, formTemplates, formSubmissions }: Props) {
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(formTemplates[0]?.id ?? '');
  const [channel, setChannel] = useState<string>('whatsapp');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${origin}/f/${token}`);
    toast.success('Link copied to clipboard.');
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>Form links</h3>
        <button className="pill dark" style={{ fontSize: 12.5 }} onClick={() => setSendOpen(true)}>
          + Send form
        </button>
      </div>

      {formLinks.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No forms sent"
          description="Send a form link to the merchant to collect their information."
          action={
            <button className="pill dark" onClick={() => setSendOpen(true)}>Send form</button>
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {formLinks.map(link => {
            const submission = formSubmissions.find(s => s.form_link_id === link.id);
            return (
              <div key={link.id} className="glass-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span className={STATUS_BADGE[link.status]}>{STATUS_LABELS[link.status]}</span>
                      {link.channel && (
                        <span className="sub">via {link.channel}</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                      <div className="kv" style={{ padding: '2px 0' }}>
                        <span className="k">Sent</span>
                        <span style={{ fontSize: 12 }}>{fmtDateTime(link.sent_at)}</span>
                      </div>
                      <div className="kv" style={{ padding: '2px 0' }}>
                        <span className="k">Opened</span>
                        <span style={{ fontSize: 12 }}>{link.opened_at ? fmtDateTime(link.opened_at) : '—'}</span>
                      </div>
                      <div className="kv" style={{ padding: '2px 0' }}>
                        <span className="k">Submitted</span>
                        <span style={{ fontSize: 12 }}>{link.submitted_at ? fmtDateTime(link.submitted_at) : '—'}</span>
                      </div>
                      <div className="kv" style={{ padding: '2px 0' }}>
                        <span className="k">Expires</span>
                        <span style={{ fontSize: 12 }}>{fmtDate(link.expires_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                    {link.status !== 'revoked' && link.status !== 'submitted' && (
                      <>
                        <button
                          className="pill outline"
                          style={{ fontSize: 11.5 }}
                          onClick={() => copyLink(link.token)}
                        >
                          Copy link
                        </button>
                        <button
                          className="pill danger"
                          style={{ fontSize: 11.5 }}
                          onClick={() => setRevokeId(link.id)}
                        >
                          Revoke
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Submitted data */}
                {submission && submission.data && (
                  <div style={{ marginTop: 14, borderTop: '1px solid var(--g-line)', paddingTop: 12 }}>
                    <div className="field-label" style={{ marginBottom: 8 }}>Submitted answers</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                      {Object.entries(submission.data as Record<string, unknown>).map(([k, v]) => (
                        <div key={k} className="kv" style={{ padding: '3px 0', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <span className="k" style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: 12.5 }}>{v != null ? String(v) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Send form modal */}
      <Modal open={sendOpen} onClose={() => setSendOpen(false)} title="Send form">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">Form template</label>
            {formTemplates.length === 0 ? (
              <p className="sub">No active form templates available.</p>
            ) : (
              <select className="field" value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
                {formTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="field-label">Channel</label>
            <select className="field" value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button className="pill outline" onClick={() => setSendOpen(false)}>Cancel</button>
            <button
              className="pill dark"
              disabled={!selectedTemplate || pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await sendForm(merchant.id, selectedTemplate, channel);
                  if (res.error) toast.error(res.error);
                  else { toast.success('Form link created.'); setSendOpen(false); }
                });
              }}
            >
              {pending ? 'Sending…' : 'Send form'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Revoke confirm */}
      <ConfirmDialog
        open={!!revokeId}
        onClose={() => setRevokeId(null)}
        onConfirm={() => {
          if (!revokeId) return;
          startTransition(async () => {
            const res = await revokeFormLink(revokeId, merchant.id);
            if (res.error) toast.error(res.error);
            else { toast.success('Form link revoked.'); setRevokeId(null); }
          });
        }}
        title="Revoke form link"
        body="The merchant will no longer be able to use this link."
        confirmLabel="Revoke"
        danger
      />
    </div>
  );
}
