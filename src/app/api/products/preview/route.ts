import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

// ── Template column → field name mapping ─────────────────────────────────────

function get(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k]?.trim();
    if (v !== undefined) return v;
  }
  return "";
}

function parseNum(raw: string): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

function parseInt2(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw.replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

export interface ParsedProductRow {
  _raw: Record<string, string>;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  price: number | null;
  nml_cost: number | null;
  stock: number | null;
  url: string;
  image_url: string;
  notes: string;
}

export function parseProductRow(r: Record<string, string>): ParsedProductRow {
  return {
    _raw:      r,
    name:      get(r, "Product name", "product_name", "name"),
    sku:       get(r, "SKU", "sku"),
    barcode:   get(r, "Barcode", "barcode"),
    category:  get(r, "Category", "category"),
    brand:     get(r, "Brand", "brand"),
    price:     parseNum(get(r, "Merchant price", "merchant_price", "price")),
    nml_cost:  parseNum(get(r, "NML cost", "nml_cost")),
    stock:     parseInt2(get(r, "Stock", "stock")),
    url:       get(r, "Product URL", "product_url", "url"),
    image_url: get(r, "Image URL", "image_url"),
    notes:     get(r, "Notes", "notes"),
  };
}

function validate(p: ParsedProductRow): string | null {
  if (!p.name) return "Missing product name";
  const priceRaw = get(p._raw, "Merchant price", "merchant_price", "price");
  if (!priceRaw) return "Missing price";
  if (p.price === null) return "Invalid price";
  const costRaw = get(p._raw, "NML cost", "nml_cost");
  if (costRaw && p.nml_cost === null) return "Invalid NML cost";
  const stockRaw = get(p._raw, "Stock", "stock");
  if (stockRaw && p.stock === null) return "Invalid stock";
  return null;
}

// ── Route handler ─────────────────────────────────────────────────────────────

interface PreviewRequest {
  merchantId: string;
  rows: Record<string, string>[];
}

export async function POST(req: NextRequest) {
  const { merchantId, rows } = (await req.json()) as PreviewRequest;

  if (!merchantId || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ new: [], updates: [], invalid: [] });
  }

  const parsed = rows.map(parseProductRow);

  // Fetch existing SKUs for this merchant
  const skus = parsed.map(p => p.sku).filter(Boolean);
  const existingSkuSet = new Set<string>();
  if (skus.length) {
    const { data } = await adminClient
      .from("products")
      .select("sku")
      .eq("merchant_id", merchantId)
      .in("sku", skus);
    for (const p of (data ?? []) as { sku: string | null }[]) {
      if (p.sku) existingSkuSet.add(p.sku);
    }
  }

  const newRows: ParsedProductRow[] = [];
  const updates: ParsedProductRow[] = [];
  const invalid: { row: ParsedProductRow; reason: string }[] = [];

  for (const p of parsed) {
    const err = validate(p);
    if (err) { invalid.push({ row: p, reason: err }); continue; }
    if (p.sku && existingSkuSet.has(p.sku)) {
      updates.push(p);
    } else {
      newRows.push(p);
    }
  }

  return NextResponse.json({ new: newRows, updates, invalid });
}
