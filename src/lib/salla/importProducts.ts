// Shared import logic — used by both the import API route and the salla worker.
// Upserts on (merchant_id, salla_product_id) so re-fetching updates existing rows.

import { adminClient } from '../supabase/admin';
import type { NormalizedProduct } from './types';

const READY_STAGES = new Set(['cta_completed', 'onboarding', 'active']);

export async function importProducts(
  merchantId: string,
  products: NormalizedProduct[],
): Promise<{ imported: number; updated: number }> {
  if (!products.length) return { imported: 0, updated: 0 };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = adminClient as any;

  const { data: merchant } = await adminDb
    .from('merchants')
    .select('stage')
    .eq('id', merchantId)
    .single();

  const productStatus = READY_STAGES.has(merchant?.stage) ? 'ready_for_shelf' : 'discovered';

  const { data: existing } = await adminDb
    .from('products')
    .select('salla_product_id')
    .eq('merchant_id', merchantId)
    .not('salla_product_id', 'is', null);

  const existingSet = new Set(
    (existing ?? []).map((r: { salla_product_id: string }) => r.salla_product_id),
  );

  const now = new Date().toISOString();
  const rows = products.map(p => ({
    merchant_id:      merchantId,
    salla_product_id: String(p.salla_id),
    name:             p.name,
    sku:              p.sku || null,
    image_url:        p.image || null,
    images:           Array.isArray(p.images) && p.images.length ? p.images.map(String) : null,
    external_url:     p.external_url || null,
    url:              p.external_url || null,
    category:         p.category || null,
    brand:            p.brand || null,
    price:            p.price,
    nml_cost:         null,
    stock:            null,
    raw: {
      in_stock:    p.in_stock,
      has_options: p.has_options,
      found_via:   p.found_via,
      specs:       p.specs,
    },
    source:     'store_fetch',
    status:     productStatus,
    fetched_at: now,
  }));

  const { error } = await adminDb.from('products').upsert(rows, {
    onConflict: 'merchant_id,salla_product_id',
    ignoreDuplicates: false,
  });

  if (error) throw new Error(error.message);

  const imported = products.filter(p => !existingSet.has(String(p.salla_id))).length;
  const updated  = products.length - imported;

  return { imported, updated };
}
