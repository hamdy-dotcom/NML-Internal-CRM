'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  Merchant, Activity, Task, FormLink, FormTemplate, FormSubmission,
  MerchantOnboarding, MerchantOnboardingStep, Product, AuditLog, Attachment, Profile,
  MerchantStage, MerchantPriority,
} from '@/lib/database.types';
import StageBadge from '@/components/ui/StageBadge';
import StageRail from '@/components/ui/StageRail';
import Modal from '@/components/ui/Modal';
import UserPicker from '@/components/ui/UserPicker';
import PhoneCell from '@/components/ui/PhoneCell';
import { waLink, telLink, STAGE_LABELS, PRIORITY_LABELS } from '@/lib/utils';
import OverviewTab from './tabs/OverviewTab';
import ActivityTab from './tabs/ActivityTab';
import ProductsTab from './tabs/ProductsTab';
import FormTab from './tabs/FormTab';
import OnboardingTab from './tabs/OnboardingTab';
import TasksTab from './tabs/TasksTab';
import FilesTab from './tabs/FilesTab';
import {
  changeStage, putOnHold, markLost, reassignMerchant, updateMerchantField,
} from './actions';

const TABS = [
  { key: 'overview',   label: 'Overview' },
  { key: 'activity',   label: 'Activity' },
  { key: 'products',   label: 'Products' },
  { key: 'form',       label: 'Form' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'tasks',      label: 'Tasks' },
  { key: 'files',      label: 'Files' },
];

const STAGES_ORDER: MerchantStage[] = [
  'new', 'assigned', 'contacted', 'interested',
  'form_sent', 'cta_completed', 'onboarding', 'active', 'on_hold', 'lost',
];

interface Props {
  merchant: Merchant;
  activities: Activity[];
  tasks: Task[];
  formLinks: FormLink[];
  formTemplates: FormTemplate[];
  formSubmissions: FormSubmission[];
  onboarding: MerchantOnboarding | null;
  onboardingSteps: MerchantOnboardingStep[];
  products: Product[];
  auditLogs: AuditLog[];
  attachments: Attachment[];
  currentUserId: string | null;
  currentProfile: Profile | null;
}

export default function MerchantDetailClient({
  merchant,
  activities,
  tasks,
  formLinks,
  formTemplates,
  formSubmissions,
  onboarding,
  onboardingSteps,
  products,
  auditLogs,
  attachments,
  currentUserId,
  currentProfile,
}: Props) {
  const [tab, setTab] = useState<string>('overview');
  const [codeCopied, setCodeCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  // Overflow menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [newOwner, setNewOwner] = useState<string | null>(null);
  const [newStage, setNewStage] = useState<MerchantStage>(merchant.stage);

  // Audit log panel
  const [auditOpen, setAuditOpen] = useState(false);

  function copyCode() {
    navigator.clipboard.writeText(merchant.merchant_code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 1500);
  }

  function priorityColor(p: MerchantPriority) {
    if (p === 'high') return 'var(--red)';
    if (p === 'medium') return 'var(--amber)';
    return 'var(--ink-3)';
  }

  return (
    <div style={{ paddingTop: 16, maxWidth: 1100, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="glass-panel" style={{ padding: '16px 20px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          {/* Store icon */}
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: 'var(--blue-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>
            🏪
          </div>

          {/* Title block */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
                {merchant.store_name}
              </h1>
              {merchant.store_url && (
                <a href={merchant.store_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--ink-3)', fontSize: 13, textDecoration: 'none' }}
                  title="Open store">↗</a>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span className="mono" style={{ color: 'var(--ink-3)', fontSize: 12 }}>{merchant.merchant_code}</span>
              <button
                onClick={copyCode}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-4)', fontSize: 11, padding: 0 }}
              >
                {codeCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <StageBadge stage={merchant.stage} />
              {/* Priority selector */}
              <select
                className="pill"
                style={{ fontSize: 11.5, padding: '2px 10px', color: priorityColor(merchant.priority), background: 'var(--g-card)', border: '1px solid var(--g-line)', cursor: 'pointer' }}
                value={merchant.priority}
                onChange={e => {
                  startTransition(async () => {
                    const res = await updateMerchantField(merchant.id, 'priority', e.target.value);
                    if (res.error) toast.error(res.error);
                  });
                }}
              >
                {(['high', 'medium', 'low'] as MerchantPriority[]).map(p => (
                  <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                ))}
              </select>
              {merchant.city && (
                <span className="sub">{merchant.city}{merchant.category ? ` · ${merchant.category}` : ''}</span>
              )}
            </div>
          </div>

          {/* Action pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            {(merchant.whatsapp || merchant.phone) && (
              <a
                href={waLink(merchant.whatsapp ?? merchant.phone) ?? '#'}
                target="_blank" rel="noopener noreferrer"
                className="pill"
                style={{ textDecoration: 'none', fontSize: 12.5, color: '#25D366' }}
              >
                💬 WhatsApp
              </a>
            )}
            {merchant.phone && (
              <a href={telLink(merchant.phone) ?? '#'} className="pill" style={{ textDecoration: 'none', fontSize: 12.5 }}>
                📞 Call
              </a>
            )}
            <button className="pill" style={{ fontSize: 12.5 }} onClick={() => setTab('form')}>
              Send form
            </button>
            <button className="pill dark" style={{ fontSize: 12.5 }} onClick={() => setTab('activity')}>
              Log activity
            </button>
            {/* Overflow */}
            <div style={{ position: 'relative' }}>
              <button className="pill" style={{ fontSize: 14, padding: '4px 12px' }} onClick={() => setMenuOpen(o => !o)}>
                ···
              </button>
              {menuOpen && (
                <div
                  className="glass-card"
                  style={{ position: 'absolute', right: 0, top: 36, zIndex: 30, width: 180, padding: '6px 0', boxShadow: 'var(--shadow)' }}
                >
                  {[
                    { label: 'Change stage', action: () => { setNewStage(merchant.stage); setStageOpen(true); setMenuOpen(false); } },
                    { label: 'Put on hold', action: () => { setHoldOpen(true); setMenuOpen(false); } },
                    { label: 'Mark lost', action: () => { setLostOpen(true); setMenuOpen(false); } },
                    { label: 'Reassign', action: () => { setReassignOpen(true); setMenuOpen(false); } },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', fontSize: 12.5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}
                      onMouseOver={e => (e.currentTarget.style.background = 'var(--blue-bg)')}
                      onMouseOut={e => (e.currentTarget.style.background = 'none')}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stage rail */}
        <div style={{ marginTop: 14 }}>
          <StageRail merchant={merchant} />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const badge = t.key === 'products' ? products.length
            : t.key === 'tasks' ? tasks.filter(tk => tk.status === 'open').length
            : t.key === 'files' ? attachments.length
            : null;
          return (
            <button
              key={t.key}
              className={`pill${tab === t.key ? ' active' : ''}`}
              style={{ fontSize: 12.5, position: 'relative' }}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {badge != null && badge > 0 && (
                <span style={{
                  marginLeft: 5, background: tab === t.key ? 'var(--blue)' : 'var(--g-line)',
                  color: tab === t.key ? '#fff' : 'var(--ink-2)',
                  borderRadius: 99, fontSize: 10, padding: '1px 5px', fontFamily: 'JetBrains Mono, monospace',
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {tab === 'overview' && (
            <OverviewTab merchant={merchant} tasks={tasks} />
          )}
          {tab === 'activity' && (
            <ActivityTab
              merchant={merchant}
              activities={activities}
              currentUserId={currentUserId}
            />
          )}
          {tab === 'products' && (
            <ProductsTab merchant={merchant} products={products} currentProfile={currentProfile} />
          )}
          {tab === 'form' && (
            <FormTab
              merchant={merchant}
              formLinks={formLinks}
              formTemplates={formTemplates}
              formSubmissions={formSubmissions}
            />
          )}
          {tab === 'onboarding' && (
            <OnboardingTab
              merchant={merchant}
              onboarding={onboarding}
              steps={onboardingSteps}
            />
          )}
          {tab === 'tasks' && (
            <TasksTab merchant={merchant} tasks={tasks} currentUserId={currentUserId} />
          )}
          {tab === 'files' && (
            <FilesTab merchant={merchant} attachments={attachments} currentUserId={currentUserId} />
          )}
        </div>

        {/* ── Right rail: audit log ────────────────────────────────────── */}
        <div style={{ width: 260, flexShrink: 0 }}>
          <div className="glass-panel" style={{ padding: 12 }}>
            <button
              className="pill ghost"
              style={{ width: '100%', fontSize: 12.5, justifyContent: 'space-between', display: 'flex' }}
              onClick={() => setAuditOpen(o => !o)}
            >
              <span>Audit log</span>
              <span>{auditOpen ? '▲' : '▼'}</span>
            </button>
            {auditOpen && (
              <div style={{ marginTop: 10, maxHeight: 400, overflowY: 'auto' }}>
                {auditLogs.length === 0 && (
                  <p className="sub" style={{ textAlign: 'center', marginTop: 12 }}>No audit entries.</p>
                )}
                {auditLogs.map(log => (
                  <div key={log.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--g-line)' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--ink-2)' }}>
                      {log.action}
                    </div>
                    <div className="sub">{log.entity}</div>
                    <div className="sub">{new Date(log.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      {/* Change stage */}
      <Modal open={stageOpen} onClose={() => setStageOpen(false)} title="Change stage">
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">New stage</label>
          <select className="field" value={newStage} onChange={e => setNewStage(e.target.value as MerchantStage)}>
            {STAGES_ORDER.map(s => (
              <option key={s} value={s}>{STAGE_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="pill outline" onClick={() => setStageOpen(false)}>Cancel</button>
          <button
            className="pill dark"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const res = await changeStage(merchant.id, newStage);
                if (res.error) toast.error(res.error);
                else { toast.success('Stage updated.'); setStageOpen(false); }
              });
            }}
          >
            {pending ? 'Saving…' : 'Update stage'}
          </button>
        </div>
      </Modal>

      {/* Put on hold */}
      <Modal open={holdOpen} onClose={() => setHoldOpen(false)} title="Put on hold" danger>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Reason</label>
          <textarea className="field" value={holdReason} onChange={e => setHoldReason(e.target.value)} placeholder="Why is this merchant on hold?" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="pill outline" onClick={() => setHoldOpen(false)}>Cancel</button>
          <button
            className="pill danger"
            disabled={!holdReason.trim() || pending}
            onClick={() => {
              startTransition(async () => {
                const res = await putOnHold(merchant.id, holdReason);
                if (res.error) toast.error(res.error);
                else { toast.success('Merchant put on hold.'); setHoldOpen(false); }
              });
            }}
          >
            {pending ? 'Saving…' : 'Put on hold'}
          </button>
        </div>
      </Modal>

      {/* Mark lost */}
      <Modal open={lostOpen} onClose={() => setLostOpen(false)} title="Mark as lost" danger>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Lost reason</label>
          <textarea className="field" value={lostReason} onChange={e => setLostReason(e.target.value)} placeholder="Why was this merchant lost?" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="pill outline" onClick={() => setLostOpen(false)}>Cancel</button>
          <button
            className="pill danger"
            disabled={!lostReason.trim() || pending}
            onClick={() => {
              startTransition(async () => {
                const res = await markLost(merchant.id, lostReason);
                if (res.error) toast.error(res.error);
                else { toast.success('Merchant marked lost.'); setLostOpen(false); }
              });
            }}
          >
            {pending ? 'Saving…' : 'Mark lost'}
          </button>
        </div>
      </Modal>

      {/* Reassign */}
      <Modal open={reassignOpen} onClose={() => setReassignOpen(false)} title="Reassign merchant">
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">New acquisition owner</label>
          <UserPicker
            value={newOwner}
            onChange={setNewOwner}
            roles={['acq_specialist', 'acq_manager', 'admin']}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="pill outline" onClick={() => setReassignOpen(false)}>Cancel</button>
          <button
            className="pill dark"
            disabled={!newOwner || pending}
            onClick={() => {
              if (!newOwner) return;
              startTransition(async () => {
                const res = await reassignMerchant(merchant.id, newOwner);
                if (res.error) toast.error(res.error);
                else { toast.success('Merchant reassigned.'); setReassignOpen(false); }
              });
            }}
          >
            {pending ? 'Saving…' : 'Reassign'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
