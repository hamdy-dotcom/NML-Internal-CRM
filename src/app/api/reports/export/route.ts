import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { VSpecialistPerformance, Merchant, MerchantOnboardingStep, Product, LeadBatch } from '@/lib/database.types';

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const body = rows.map(r =>
    keys.map(k => {
      const v = r[k];
      if (v == null) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  );
  return [header, ...body].join('\r\n');
}

function getDateRange(range: string, from?: string, to?: string): { gte?: string; lte?: string } {
  const now = new Date();
  if (range === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return { gte: start.toISOString() };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { gte: start.toISOString() };
  }
  if (range === 'last30') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { gte: start.toISOString() };
  }
  if (range === 'custom') {
    return { gte: from, lte: to };
  }
  return {};
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tab = searchParams.get('tab') ?? 'funnel';
  const range = searchParams.get('range') ?? 'month';
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;

  const { gte, lte } = getDateRange(range, from, to);
  const supabase = await createClient();

  let csv = '';
  let filename = `reports-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;

  if (tab === 'funnel') {
    let q = supabase.from('merchants').select('stage, created_at');
    if (gte) q = q.gte('created_at', gte);
    if (lte) q = q.lte('created_at', lte);
    const { data } = await q;
    const counts: Record<string, number> = {};
    for (const r of data ?? []) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    csv = toCSV(Object.entries(counts).map(([stage, count]) => ({ stage, count })));
  }

  else if (tab === 'specialists') {
    const { data } = await supabase.from('v_specialist_performance').select('*');
    csv = toCSV((data ?? []) as unknown as Record<string, unknown>[]);
  }

  else if (tab === 'source') {
    let q = supabase.from('merchants').select('source, stage, batch_id, created_at');
    if (gte) q = q.gte('created_at', gte);
    if (lte) q = q.lte('created_at', lte);
    const { data } = await q;
    const { data: batches } = await supabase.from('lead_batches').select('id, name');
    const batchMap = new Map<string, string>((batches ?? []).map(b => [b.id, b.name]));

    const rows = (data ?? []).map(m => ({
      source: m.source,
      stage: m.stage,
      batch: m.batch_id ? (batchMap.get(m.batch_id) ?? m.batch_id) : '',
      created_at: m.created_at,
    }));
    csv = toCSV(rows as unknown as Record<string, unknown>[]);
  }

  else if (tab === 'onboarding') {
    const { data } = await supabase
      .from('merchant_onboarding_steps')
      .select('title, status, created_at, completed_at');
    csv = toCSV((data ?? []) as unknown as Record<string, unknown>[]);
  }

  else if (tab === 'shelf') {
    let q = supabase.from('products').select('merchant_id, ready_at, shelved_at, status');
    if (gte) q = q.gte('ready_at', gte);
    if (lte) q = q.lte('ready_at', lte);
    const { data } = await q;
    csv = toCSV((data ?? []) as unknown as Record<string, unknown>[]);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
