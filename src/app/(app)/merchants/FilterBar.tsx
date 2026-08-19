'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MerchantStage } from '@/lib/database.types';
import { STAGE_LABELS } from '@/lib/utils';

const ALL_STAGES: MerchantStage[] = [
  'new', 'assigned', 'contacted', 'interested',
  'form_sent', 'cta_completed', 'onboarding', 'active', 'on_hold', 'lost',
];

interface Props {
  currentQ: string;
  currentStages: string[];
  currentCity: string;
  currentPriority: string;
  currentIndustry: string;
  currentStoreType: string;
  industryOptions: string[];
  storeTypeOptions: string[];
  view: string;
}

export default function FilterBar({ currentQ, currentStages, currentCity, currentPriority, currentIndustry, currentStoreType, industryOptions, storeTypeOptions, view }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pending, startTransition] = useTransition();

  // Local state
  const [q, setQ] = useState(currentQ);
  const [stages, setStages] = useState<string[]>(currentStages);
  const [city, setCity] = useState(currentCity);
  const [priority, setPriority] = useState(currentPriority);
  const [industry, setIndustry] = useState(currentIndustry);
  const [storeType, setStoreType] = useState(currentStoreType);

  // Active filter count
  const activeCount = (currentStages.length > 0 ? 1 : 0) + (currentCity ? 1 : 0) + (currentPriority ? 1 : 0) + (currentIndustry ? 1 : 0) + (currentStoreType ? 1 : 0);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function apply() {
    const next = new URLSearchParams();
    if (view !== 'all') next.set('view', view);
    if (q.trim()) next.set('q', q.trim());
    stages.forEach(s => next.append('stage', s));
    if (city.trim()) next.set('city', city.trim());
    if (priority) next.set('priority', priority);
    if (industry) next.set('industry', industry);
    if (storeType) next.set('store_type', storeType);
    next.delete('page');
    startTransition(() => {
      router.push(`/merchants?${next.toString()}`);
      setOpen(false);
    });
  }

  function clear() {
    setStages([]); setCity(''); setPriority(''); setIndustry(''); setStoreType('');
    const next = new URLSearchParams();
    if (view !== 'all') next.set('view', view);
    if (q.trim()) next.set('q', q.trim());
    startTransition(() => { router.push(`/merchants?${next.toString()}`); setOpen(false); });
  }

  function handleSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') apply();
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Search */}
      <input
        className="field"
        style={{ width: 220, height: 32, padding: '0 10px', fontSize: 12.5 }}
        placeholder="Search merchants…"
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={handleSearch}
      />

      {/* Filters pill */}
      <div style={{ position: 'relative' }} ref={dropRef}>
        <button
          className={`pill${activeCount > 0 ? ' active' : ' outline'}`}
          style={{ fontSize: 12.5, height: 32 }}
          onClick={() => setOpen(o => !o)}
        >
          Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
        </button>

        {open && (
          <div
            className="glass-card"
            style={{
              position: 'absolute', top: 38, left: 0, zIndex: 50, width: 300,
              padding: 16, boxShadow: 'var(--shadow)',
            }}
          >
            {/* Stage multi-select */}
            <div style={{ marginBottom: 12 }}>
              <div className="field-label">Stage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ALL_STAGES.map(s => (
                  <button
                    key={s}
                    className={`pill${stages.includes(s) ? ' active' : ' ghost'}`}
                    style={{ fontSize: 11.5, padding: '2px 10px' }}
                    onClick={() => setStages(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                  >
                    {STAGE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* City */}
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">City</label>
              <input
                className="field"
                placeholder="e.g. Riyadh"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
            </div>

            {/* Priority */}
            <div style={{ marginBottom: 12 }}>
              <label className="field-label">Priority</label>
              <select className="field" value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">Any</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            {/* Industry */}
            {industryOptions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Industry</label>
                <select className="field" value={industry} onChange={e => setIndustry(e.target.value)}>
                  <option value="">Any</option>
                  {industryOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}

            {/* Store type */}
            {storeTypeOptions.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label className="field-label">Store type</label>
                <select className="field" value={storeType} onChange={e => setStoreType(e.target.value)}>
                  <option value="">Any</option>
                  {storeTypeOptions.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="pill outline" style={{ fontSize: 12 }} onClick={clear}>Clear</button>
              <button className="pill dark" style={{ fontSize: 12 }} onClick={apply} disabled={pending}>
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search button */}
      <button className="pill dark" style={{ fontSize: 12.5, height: 32 }} onClick={apply} disabled={pending}>
        {pending ? 'Searching…' : 'Search'}
      </button>
    </div>
  );
}
