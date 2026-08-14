import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

// ── Normalisation helpers ─────────────────────────────────────────────────────
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("966")) return digits;
  if (digits.startsWith("0")) return `966${digits.slice(1)}`;
  return `966${digits}`;
}

function normaliseUrl(raw: string): string {
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    // Return host without www, lowercased
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.toLowerCase().trim();
  }
}

interface IncomingRow {
  [key: string]: string;
}

interface PreviewRequest {
  rows: IncomingRow[];
  columnMap: Record<string, string>; // fileHeader → crmField
}

interface MappedRow {
  store_name?: string;
  store_url?: string;
  salla_store_id?: string;
  phone?: string;
  phone_key?: string;
  store_url_key?: string;
  [key: string]: string | undefined;
}

function applyMap(row: IncomingRow, columnMap: Record<string, string>): MappedRow {
  const mapped: MappedRow = {};
  for (const [fileHeader, crmField] of Object.entries(columnMap)) {
    if (crmField && row[fileHeader] !== undefined) {
      mapped[crmField] = String(row[fileHeader]).trim();
    }
  }
  // Compute derived keys
  if (mapped.phone) mapped.phone_key = normalisePhone(mapped.phone);
  if (mapped.store_url) mapped.store_url_key = normaliseUrl(mapped.store_url);
  return mapped;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PreviewRequest;
  const { rows, columnMap } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ new: [], duplicates: [], invalid: [] });
  }

  const mapped: MappedRow[] = rows.map((r) => applyMap(r, columnMap));

  // Collect unique keys for batch lookups
  const sallaIds = mapped.map((r) => r.salla_store_id).filter(Boolean) as string[];
  const urlKeys = mapped.map((r) => r.store_url_key).filter(Boolean) as string[];
  const phoneKeys = mapped.map((r) => r.phone_key).filter(Boolean) as string[];

  // Batch DB lookups
  const [sallaRes, urlRes, phoneRes] = await Promise.all([
    sallaIds.length > 0
      ? adminClient
          .from("merchants")
          .select("id, salla_store_id")
          .in("salla_store_id", sallaIds)
      : Promise.resolve({ data: [] }),
    urlKeys.length > 0
      ? adminClient
          .from("merchants")
          .select("id, store_url_key")
          .in("store_url_key", urlKeys)
      : Promise.resolve({ data: [] }),
    phoneKeys.length > 0
      ? adminClient
          .from("merchants")
          .select("id, phone_key")
          .in("phone_key", phoneKeys)
      : Promise.resolve({ data: [] }),
  ]);

  const sallaMap = new Map<string, string>(
    (sallaRes.data ?? []).map((m) => [m.salla_store_id!, m.id]),
  );
  const urlMap = new Map<string, string>(
    (urlRes.data ?? []).map((m) => [m.store_url_key!, m.id]),
  );
  const phoneMap = new Map<string, string>(
    (phoneRes.data ?? []).map((m) => [m.phone_key!, m.id]),
  );

  const newRows: MappedRow[] = [];
  const duplicates: { row: MappedRow; matched_on: string; existing_merchant_id: string }[] = [];
  const invalid: { row: MappedRow; reason: string }[] = [];

  for (const row of mapped) {
    // Validation
    if (!row.store_name) {
      invalid.push({ row, reason: "Missing store name" });
      continue;
    }

    // Deduplication (priority: salla_store_id > store_url_key > phone_key)
    if (row.salla_store_id && sallaMap.has(row.salla_store_id)) {
      duplicates.push({
        row,
        matched_on: "salla_store_id",
        existing_merchant_id: sallaMap.get(row.salla_store_id)!,
      });
      continue;
    }
    if (row.store_url_key && urlMap.has(row.store_url_key)) {
      duplicates.push({
        row,
        matched_on: "store_url_key",
        existing_merchant_id: urlMap.get(row.store_url_key)!,
      });
      continue;
    }
    if (row.phone_key && phoneMap.has(row.phone_key)) {
      duplicates.push({
        row,
        matched_on: "phone_key",
        existing_merchant_id: phoneMap.get(row.phone_key)!,
      });
      continue;
    }

    newRows.push(row);
  }

  return NextResponse.json({ new: newRows, duplicates, invalid });
}
