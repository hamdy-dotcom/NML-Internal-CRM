'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function extractMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'An unexpected error occurred.';
}

function extractUrlKey(url: string): string | null {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ── Create search list ─────────────────────────────────────────────────────
export async function createSearchList(
  formData: FormData,
): Promise<{ id?: string; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return { error: 'Not authenticated.' };

    const name = (formData.get('name') as string | null)?.trim();
    if (!name) return { error: 'Name is required.' };

    const query = (formData.get('query') as string | null)?.trim() || null;

    const filters: Record<string, unknown> = {};
    const category = (formData.get('category') as string | null)?.trim();
    const priceMin = formData.get('price_min');
    const priceMax = formData.get('price_max');
    const city = (formData.get('city') as string | null)?.trim();
    const resultLimit = formData.get('result_limit');

    if (category) filters.category = category;
    if (priceMin) filters.price_min = Number(priceMin);
    if (priceMax) filters.price_max = Number(priceMax);
    if (city) filters.city = city;
    if (resultLimit) filters.result_limit = Number(resultLimit);

    const { data, error } = await supabase
      .from('search_lists')
      .insert({
        name,
        query,
        filters: (Object.keys(filters).length ? filters : null) as import("@/lib/database.types").Json | null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) return { error: error.message };

    revalidatePath('/prospecting');
    return { id: data.id };
  } catch (e) {
    return { error: extractMessage(e) };
  }
}

// ── Import search results ──────────────────────────────────────────────────
export interface ParsedRow {
  product_name: string;
  price: string;
  store_name: string;
  store_url: string;
  salla_store_id?: string;
}

export async function importSearchResults(
  listId: string,
  rows: ParsedRow[],
): Promise<{ inserted: number; error?: string }> {
  try {
    const supabase = await createClient();

    if (!rows.length) return { inserted: 0 };

    // Collect all url keys to batch-check against merchants
    const urlKeys = rows
      .map(r => extractUrlKey(r.store_url))
      .filter(Boolean) as string[];

    // Fetch existing merchants matching any of these url keys
    const { data: matchedMerchants, error: merchantErr } = await supabase
      .from('merchants')
      .select('id, store_url_key')
      .in('store_url_key', urlKeys.length ? urlKeys : ['__no_match__']);

    if (merchantErr) return { inserted: 0, error: merchantErr.message };

    const merchantByKey = new Map<string, string>();
    for (const m of matchedMerchants ?? []) {
      if (m.store_url_key) merchantByKey.set(m.store_url_key, m.id);
    }

    const inserts = rows.map(r => {
      const urlKey = extractUrlKey(r.store_url);
      const matchedMerchant = urlKey ? (merchantByKey.get(urlKey) ?? null) : null;
      return {
        list_id: listId,
        product_name: r.product_name || null,
        price: r.price || null,
        store_name: r.store_name || null,
        store_url: r.store_url || null,
        store_url_key: urlKey,
        salla_store_id: r.salla_store_id || null,
        matched_merchant: matchedMerchant,
        converted: false,
      };
    });

    const { error: insertErr, count } = await supabase
      .from('search_results')
      .insert(inserts, { count: 'exact' });

    if (insertErr) return { inserted: 0, error: insertErr.message };

    revalidatePath(`/prospecting/${listId}`);
    return { inserted: count ?? inserts.length };
  } catch (e) {
    return { inserted: 0, error: extractMessage(e) };
  }
}

// ── Create leads from results ──────────────────────────────────────────────
export async function createLeadsFromResults(
  resultIds: string[],
): Promise<{ created: number; linked: number; error?: string }> {
  try {
    const supabase = await createClient();

    if (!resultIds.length) return { created: 0, linked: 0 };

    const { data: results, error: fetchErr } = await supabase
      .from('search_results')
      .select('*')
      .in('id', resultIds);

    if (fetchErr) return { created: 0, linked: 0, error: fetchErr.message };
    if (!results?.length) return { created: 0, linked: 0 };

    let created = 0;
    let linked = 0;

    const listIds = [...new Set(results.map(r => r.list_id))];

    for (const result of results) {
      // Already has a matched merchant
      if (result.matched_merchant) {
        const { error: upErr } = await supabase
          .from('search_results')
          .update({ converted: true })
          .eq('id', result.id);
        if (upErr) return { created, linked, error: upErr.message };
        linked++;
        continue;
      }

      // No matched merchant — check by url key
      const urlKey = result.store_url_key ?? extractUrlKey(result.store_url ?? '');
      let merchantId: string | null = null;

      if (urlKey) {
        const { data: existing } = await supabase
          .from('merchants')
          .select('id')
          .eq('store_url_key', urlKey)
          .maybeSingle();
        if (existing) merchantId = existing.id;
      }

      if (merchantId) {
        // Link to existing merchant
        const { error: upErr } = await supabase
          .from('search_results')
          .update({ converted: true, matched_merchant: merchantId })
          .eq('id', result.id);
        if (upErr) return { created, linked, error: upErr.message };
        linked++;
      } else {
        // Create new merchant
        const { data: newMerchant, error: createErr } = await supabase
          .from('merchants')
          .insert({
            store_name: result.store_name ?? 'Unknown store',
            store_url: result.store_url ?? null,
            store_url_key: urlKey,
            salla_store_id: result.salla_store_id ?? null,
            source: 'product_search',
            stage: 'new',
          })
          .select('id')
          .single();

        if (createErr) return { created, linked, error: createErr.message };

        merchantId = newMerchant.id;
        const { error: upErr } = await supabase
          .from('search_results')
          .update({ converted: true, matched_merchant: merchantId })
          .eq('id', result.id);
        if (upErr) return { created, linked, error: upErr.message };
        created++;
      }
    }

    for (const lid of listIds) {
      revalidatePath(`/prospecting/${lid}`);
    }
    revalidatePath('/prospecting');

    return { created, linked };
  } catch (e) {
    return { created: 0, linked: 0, error: extractMessage(e) };
  }
}

// ── Delete search list ─────────────────────────────────────────────────────
export async function deleteSearchList(id: string): Promise<{ error?: string }> {
  try {
    const supabase = await createClient();

    // Delete results first (cascade may handle this, but be explicit)
    const { error: resultsErr } = await supabase
      .from('search_results')
      .delete()
      .eq('list_id', id);
    if (resultsErr) return { error: resultsErr.message };

    const { error } = await supabase.from('search_lists').delete().eq('id', id);
    if (error) return { error: error.message };

    revalidatePath('/prospecting');
    return {};
  } catch (e) {
    return { error: extractMessage(e) };
  }
}
