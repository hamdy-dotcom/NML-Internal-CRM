'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MerchantStage, ActivityType, ActivityOutcome, MerchantPriority, StepStatus, TaskStatus } from '@/lib/database.types';

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred.';
}

function revalidate(id: string) {
  revalidatePath(`/merchants/${id}`);
  revalidatePath('/merchants');
}

// ── Generic field update ───────────────────────────────────────────────────
export async function updateMerchantField(
  id: string,
  field: string,
  value: unknown,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('merchants') as any).update({ [field]: value }).eq('id', id);
    if (error) return { error: error.message };
    revalidate(id);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Stage change ───────────────────────────────────────────────────────────
export async function changeStage(
  merchantId: string,
  stage: MerchantStage,
  reason?: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = { stage };
    if (reason) {
      if (stage === 'lost') patch.lost_reason = reason;
      if (stage === 'on_hold') patch.hold_reason = reason;
    }
    const { error } = await supabase.from('merchants').update(patch).eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Put on hold ────────────────────────────────────────────────────────────
export async function putOnHold(
  merchantId: string,
  reason: string,
): Promise<{ error?: string }> {
  if (!reason.trim()) return { error: 'Hold reason is required.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ stage: 'on_hold', hold_reason: reason.trim() })
      .eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Mark lost ──────────────────────────────────────────────────────────────
export async function markLost(
  merchantId: string,
  reason: string,
): Promise<{ error?: string }> {
  if (!reason.trim()) return { error: 'Lost reason is required.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ stage: 'lost', lost_reason: reason.trim() })
      .eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Mark not interested ────────────────────────────────────────────────────
export async function markNotInterested(
  merchantId: string,
  reason: string,
): Promise<{ error?: string }> {
  if (!reason.trim()) return { error: 'Reason is required.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ stage: 'not_interested', lost_reason: reason.trim() })
      .eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Log activity ───────────────────────────────────────────────────────────
const LogActivitySchema = z.object({
  merchantId: z.string().uuid(),
  type: z.enum(['call', 'whatsapp', 'email', 'meeting', 'visit', 'note']),
  outcome: z.enum(['answered', 'no_answer', 'busy', 'wrong_number', 'interested', 'not_interested', 'callback', 'deal_agreed']).nullable().optional(),
  body: z.string().min(1, 'Body is required.'),
  nextActionAt: z.string().nullable().optional(),
});

export async function logActivity(
  merchantId: string,
  type: ActivityType,
  outcome: ActivityOutcome | null,
  body: string,
  nextActionAt: string | null,
): Promise<{ error?: string }> {
  const parsed = LogActivitySchema.safeParse({ merchantId, type, outcome, body, nextActionAt });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('activities').insert({
      merchant_id: merchantId,
      user_id: user?.id ?? null,
      type: type as ActivityType,
      outcome: outcome ?? null,
      body,
    });
    if (error) return { error: error.message };
    // Update next_action_at if provided
    if (nextActionAt) {
      await supabase
        .from('merchants')
        .update({ next_action_at: nextActionAt, last_activity_at: new Date().toISOString() })
        .eq('id', merchantId);
    } else {
      await supabase
        .from('merchants')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', merchantId);
    }
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Update activity ────────────────────────────────────────────────────────
export async function updateActivity(
  activityId: string,
  merchantId: string,
  body: string,
): Promise<{ error?: string }> {
  if (!body.trim()) return { error: 'Body cannot be empty.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('activities').update({ body }).eq('id', activityId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Delete activity ────────────────────────────────────────────────────────
export async function deleteActivity(
  activityId: string,
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('activities').delete().eq('id', activityId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Send form ──────────────────────────────────────────────────────────────
export async function sendForm(
  merchantId: string,
  templateId: string,
  channel: string,
): Promise<{ error?: string }> {
  if (!merchantId || !templateId) return { error: 'Missing merchant or template.' };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('form_links').insert({
      merchant_id: merchantId,
      template_id: templateId,
      token,
      status: 'sent',
      channel,
      sent_by: user?.id ?? null,
      expires_at: expiresAt,
    });
    if (error) return { error: error.message };
    // Advance stage to form_sent if not already past that
    await supabase.from('merchants').update({ stage: 'form_sent', form_sent_at: new Date().toISOString() }).eq('id', merchantId).in('stage', ['new', 'assigned', 'contacted', 'interested']);
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Revoke form link ───────────────────────────────────────────────────────
export async function revokeFormLink(
  linkId: string,
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('form_links').update({ status: 'revoked' }).eq('id', linkId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Delete form link ───────────────────────────────────────────────────────
export async function deleteFormLink(
  linkId: string,
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('form_links').delete().eq('id', linkId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Onboarding step update ─────────────────────────────────────────────────
export async function updateOnboardingStep(
  stepId: string,
  merchantId: string,
  updates: {
    status?: StepStatus;
    notes?: string | null;
    owner_id?: string | null;
    due_at?: string | null;
    blocked_reason?: string | null;
  },
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = { ...updates };
    if (updates.status === 'done') {
      const { data: { user } } = await supabase.auth.getUser();
      patch.completed_at = new Date().toISOString();
      patch.completed_by = user?.id ?? null;
    } else if (updates.status) {
      patch.completed_at = null;
      patch.completed_by = null;
    }
    const { error } = await supabase.from('merchant_onboarding_steps').update(patch).eq('id', stepId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Activate merchant ──────────────────────────────────────────────────────
export async function activateMerchant(
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ stage: 'active', activated_at: new Date().toISOString() })
      .eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Create task ────────────────────────────────────────────────────────────
const CreateTaskSchema = z.object({
  merchant_id: z.string().uuid(),
  title: z.string().min(1, 'Title is required.'),
  description: z.string().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_at: z.string().nullable().optional(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

export async function createTask(task: {
  merchant_id: string;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  due_at?: string | null;
  priority?: MerchantPriority;
}): Promise<{ error?: string }> {
  const parsed = CreateTaskSchema.safeParse(task);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('tasks').insert({
      ...parsed.data,
      status: 'open' as TaskStatus,
      created_by: user?.id ?? null,
    });
    if (error) return { error: error.message };
    revalidate(task.merchant_id);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Complete task ──────────────────────────────────────────────────────────
export async function completeTask(
  taskId: string,
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('tasks').update({
      status: 'done' as TaskStatus,
      completed_at: new Date().toISOString(),
      completed_by: user?.id ?? null,
    }).eq('id', taskId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Reopen task ────────────────────────────────────────────────────────────
export async function reopenTask(
  taskId: string,
  merchantId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('tasks').update({
      status: 'open' as TaskStatus,
      completed_at: null,
      completed_by: null,
    }).eq('id', taskId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Remove tag ────────────────────────────────────────────────────────────
export async function removeTag(
  merchantId: string,
  tag: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { data, error: fetchErr } = await supabase
      .from('merchants').select('tags').eq('id', merchantId).single();
    if (fetchErr) return { error: fetchErr.message };
    const tags = (data?.tags ?? []).filter((t: string) => t !== tag);
    const { error } = await supabase.from('merchants').update({ tags }).eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Add tag ────────────────────────────────────────────────────────────────
export async function addTag(
  merchantId: string,
  tag: string,
): Promise<{ error?: string }> {
  if (!tag.trim()) return { error: 'Tag cannot be empty.' };
  try {
    const supabase = await createClient();
    const { data, error: fetchErr } = await supabase
      .from('merchants').select('tags').eq('id', merchantId).single();
    if (fetchErr) return { error: fetchErr.message };
    const existing = data?.tags ?? [];
    if (existing.includes(tag)) return {};
    const { error } = await supabase.from('merchants').update({ tags: [...existing, tag] }).eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Reassign merchant ──────────────────────────────────────────────────────
export async function reassignMerchant(
  merchantId: string,
  acquisitionOwnerId: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ acquisition_owner_id: acquisitionOwnerId })
      .eq('id', merchantId);
    if (error) return { error: error.message };
    revalidate(merchantId);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}
