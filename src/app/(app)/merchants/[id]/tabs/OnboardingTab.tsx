'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Merchant, MerchantOnboarding, MerchantOnboardingStep, StepStatus } from '@/lib/database.types';
import { fmtDate, STEP_STATUS_LABELS } from '@/lib/utils';
import ProgressRing from '@/components/ui/ProgressRing';
import UserPicker from '@/components/ui/UserPicker';
import { updateOnboardingStep, activateMerchant } from '../actions';

const STAGE_ORDER_IDX: Record<string, number> = {
  new: 0, assigned: 1, contacted: 2, interested: 3,
  form_sent: 4, cta_completed: 5, onboarding: 6, active: 7,
  on_hold: -1, lost: -1,
};

const STATUS_COLORS: Record<StepStatus, string> = {
  pending:     'var(--ink-4)',
  in_progress: 'var(--blue)',
  done:        'var(--green)',
  skipped:     'var(--ink-3)',
  blocked:     'var(--red)',
};

interface Props {
  merchant: Merchant;
  onboarding: MerchantOnboarding | null;
  steps: MerchantOnboardingStep[];
}

export default function OnboardingTab({ merchant, onboarding, steps }: Props) {
  const stageIdx = STAGE_ORDER_IDX[merchant.stage] ?? -1;
  const locked = stageIdx < 5; // before cta_completed (idx 5)
  const [pending, startTransition] = useTransition();

  const doneCount = steps.filter(s => s.status === 'done' || s.status === 'skipped').length;
  const requiredOpen = steps.filter(s => s.is_required && s.status !== 'done' && s.status !== 'skipped');
  const progress = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  if (locked) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
          Onboarding not yet available
        </div>
        <p className="sub">
          Onboarding begins after the merchant submits the partnership form (CTA completed stage).
        </p>
      </div>
    );
  }

  if (!onboarding || steps.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-2)', marginBottom: 6 }}>
          No onboarding plan
        </div>
        <p className="sub">No onboarding template has been applied to this merchant.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Progress header */}
      <div className="glass-panel" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <ProgressRing value={progress} size={56} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                {doneCount} of {steps.length} steps done
              </div>
              <div className="sub">{requiredOpen.length > 0 ? `${requiredOpen.length} required step${requiredOpen.length !== 1 ? 's' : ''} open` : 'All required steps complete'}</div>
            </div>
          </div>

          {/* Activate button */}
          {merchant.stage !== 'active' && (
            <div>
              <button
                className="pill dark"
                style={{ fontSize: 12.5 }}
                disabled={requiredOpen.length > 0 || pending}
                title={requiredOpen.length > 0 ? `${requiredOpen.length} required step${requiredOpen.length !== 1 ? 's' : ''} still open: ${requiredOpen.map(s => s.title).join(', ')}` : ''}
                onClick={() => {
                  startTransition(async () => {
                    const res = await activateMerchant(merchant.id);
                    if (res.error) toast.error(res.error);
                    else toast.success('Merchant activated!');
                  });
                }}
              >
                {pending ? 'Activating…' : 'Mark merchant active'}
              </button>
              {requiredOpen.length > 0 && (
                <p className="sub" style={{ marginTop: 4, textAlign: 'right' }}>
                  {requiredOpen.length} required step{requiredOpen.length !== 1 ? 's' : ''} open
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Steps list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map(step => (
          <StepRow key={step.id} step={step} merchantId={merchant.id} />
        ))}
      </div>
    </div>
  );
}

function StepRow({ step, merchantId }: { step: MerchantOnboardingStep; merchantId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<StepStatus>(step.status);
  const [notes, setNotes] = useState(step.notes ?? '');
  const [ownerId, setOwnerId] = useState<string | null>(step.owner_id);
  const [dueAt, setDueAt] = useState(step.due_at ? step.due_at.slice(0, 10) : '');
  const [blockedReason, setBlockedReason] = useState(step.blocked_reason ?? '');
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateOnboardingStep(step.id, merchantId, {
        status,
        notes: notes || undefined,
        owner_id: ownerId,
        due_at: dueAt ? dueAt : undefined,
        blocked_reason: status === 'blocked' ? (blockedReason || undefined) : undefined,
      });
      if (res.error) toast.error(res.error);
      else { toast.success('Step updated.'); setExpanded(false); }
    });
  }

  const statusColor = STATUS_COLORS[status];

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      {/* Summary row */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Status dot */}
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: step.is_required ? 500 : 400, color: 'var(--ink)' }}>
              {step.order_index + 1}. {step.title}
            </span>
            {step.is_required && (
              <span style={{ fontSize: 10.5, color: 'var(--red)', background: 'var(--red-bg)', borderRadius: 99, padding: '1px 6px' }}>Required</span>
            )}
          </div>
          {step.description && (
            <div className="sub" style={{ marginTop: 2 }}>{step.description}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {step.due_at && (
            <span className="sub">{fmtDate(step.due_at)}</span>
          )}
          <span style={{ fontSize: 11.5, color: statusColor, fontWeight: 500 }}>{STEP_STATUS_LABELS[step.status]}</span>
          <span style={{ color: 'var(--ink-4)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--g-line)', padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="field-label">Status</label>
            <select className="field" value={status} onChange={e => setStatus(e.target.value as StepStatus)}>
              {(['pending', 'in_progress', 'done', 'skipped', 'blocked'] as StepStatus[]).map(s => (
                <option key={s} value={s}>{STEP_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Due date</label>
            <input className="field" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Owner</label>
            <UserPicker value={ownerId} onChange={setOwnerId} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="field-label">Notes</label>
            <textarea
              className="field"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes…"
            />
          </div>
          {status === 'blocked' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="field-label" style={{ color: 'var(--red)' }}>Blocked reason (required)</label>
              <input
                className="field"
                value={blockedReason}
                onChange={e => setBlockedReason(e.target.value)}
                placeholder="Why is this step blocked?"
              />
            </div>
          )}
          {step.completed_at && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span className="sub">Completed {fmtDate(step.completed_at)}</span>
            </div>
          )}
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="pill outline" style={{ fontSize: 12 }} onClick={() => setExpanded(false)}>Cancel</button>
            <button
              className="pill dark"
              style={{ fontSize: 12 }}
              disabled={pending || (status === 'blocked' && !blockedReason.trim())}
              onClick={save}
            >
              {pending ? 'Saving…' : 'Save step'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
