'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { MerchantStage, MerchantPriority } from '@/lib/database.types';

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred.';
}

// ── Stage update ───────────────────────────────────────────────────────────
export async function updateMerchantStage(
  id: string,
  stage: MerchantStage,
  reason?: string,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const patch: Record<string, unknown> = { stage };
    if (reason) patch.lost_reason = reason;
    const { error } = await supabase.from('merchants').update(patch).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/merchants');
    revalidatePath(`/merchants/${id}`);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Priority update ────────────────────────────────────────────────────────
export async function updateMerchantPriority(
  id: string,
  priority: MerchantPriority,
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('merchants').update({ priority }).eq('id', id);
    if (error) return { error: error.message };
    revalidatePath('/merchants');
    revalidatePath(`/merchants/${id}`);
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Bulk assign ───────────────────────────────────────────────────────────
const BulkAssignSchema = z.object({
  ids: z.array(z.string().uuid()),
  acquisitionOwnerId: z.string().uuid(),
});

export async function bulkAssign(
  ids: string[],
  acquisitionOwnerId: string,
): Promise<{ error?: string }> {
  const parsed = BulkAssignSchema.safeParse({ ids, acquisitionOwnerId });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ acquisition_owner_id: acquisitionOwnerId })
      .in('id', ids);
    if (error) return { error: error.message };
    revalidatePath('/merchants');
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Bulk priority ─────────────────────────────────────────────────────────
export async function bulkSetPriority(
  ids: string[],
  priority: MerchantPriority,
): Promise<{ error?: string }> {
  if (!ids.length) return { error: 'No merchants selected.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from('merchants')
      .update({ priority })
      .in('id', ids);
    if (error) return { error: error.message };
    revalidatePath('/merchants');
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Bulk add tag ──────────────────────────────────────────────────────────
export async function bulkAddTag(
  ids: string[],
  tag: string,
): Promise<{ error?: string }> {
  if (!ids.length) return { error: 'No merchants selected.' };
  if (!tag.trim()) return { error: 'Tag cannot be empty.' };
  try {
    const supabase = await createClient();
    // Fetch existing tags and append
    const { data, error: fetchErr } = await supabase
      .from('merchants')
      .select('id, tags')
      .in('id', ids);
    if (fetchErr) return { error: fetchErr.message };

    // Update each merchant's tags array
    await Promise.all(
      (data ?? []).map(m => {
        const tags = Array.isArray(m.tags) ? m.tags : [];
        if (tags.includes(tag)) return Promise.resolve();
        return supabase
          .from('merchants')
          .update({ tags: [...tags, tag] })
          .eq('id', m.id);
      }),
    );
    revalidatePath('/merchants');
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}
