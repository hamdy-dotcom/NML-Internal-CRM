import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import type { LeadSource } from "@/lib/database.types";

// ── Normalisation (same logic as preview route) ────────────────────────────
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
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.toLowerCase().trim();
  }
}

interface RawRow {
  [key: string]: string;
}

interface RunRequest {
  batchName: string;
  source: LeadSource;
  rows: RawRow[];
  columnMap: Record<string, string>;
  duplicateHandling: "skip" | "enrich";
}

function applyMap(row: RawRow, columnMap: Record<string, string>) {
  const mapped: Record<string, string> = {};
  for (const [fileHeader, crmField] of Object.entries(columnMap)) {
    if (crmField && row[fileHeader] !== undefined) {
      mapped[crmField] = String(row[fileHeader]).trim();
    }
  }
  return mapped;
}

const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as RunRequest;
  const { batchName, source, rows, columnMap, duplicateHandling } = body;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(msg: object) {
        controller.enqueue(encoder.encode(JSON.stringify(msg) + "\n"));
      }

      try {
        // 1. Create lead_batch record
        const { data: batch, error: batchErr } = await adminClient
          .from("lead_batches")
          .insert({
            name: batchName,
            source,
            total_rows: rows.length,
            imported_rows: 0,
            duplicate_rows: 0,
            invalid_rows: 0,
          })
          .select("id")
          .single();

        if (batchErr || !batch) {
          send({ error: batchErr?.message ?? "Failed to create batch" });
          controller.close();
          return;
        }

        const batchId: string = batch.id;

        // 2. Process rows
        const mapped = rows.map((r) => applyMap(r, columnMap));

        // Gather keys for dedup
        const sallaIds = mapped.map((r) => r.salla_store_id).filter(Boolean);
        const urlKeys = mapped
          .map((r) => (r.store_url ? normaliseUrl(r.store_url) : null))
          .filter(Boolean);
        const phoneKeys = mapped
          .map((r) => (r.phone ? normalisePhone(r.phone) : null))
          .filter(Boolean);

        const [sallaRes, urlRes, phoneRes] = await Promise.all([
          sallaIds.length > 0
            ? adminClient
                .from("merchants")
                .select("id, salla_store_id")
                .in("salla_store_id", sallaIds)
            : { data: [] },
          urlKeys.length > 0
            ? adminClient
                .from("merchants")
                .select("id, store_url_key")
                .in("store_url_key", urlKeys)
            : { data: [] },
          phoneKeys.length > 0
            ? adminClient
                .from("merchants")
                .select("id, phone_key")
                .in("phone_key", phoneKeys)
            : { data: [] },
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

        let imported = 0;
        let skipped = 0;
        let errors = 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toInsert: Record<string, any>[] = [];
        const toEnrich: { id: string; fields: Record<string, string> }[] = [];

        for (const row of mapped) {
          if (!row.store_name) {
            skipped++;
            continue;
          }

          const phoneKey = row.phone ? normalisePhone(row.phone) : null;
          const urlKey = row.store_url ? normaliseUrl(row.store_url) : null;

          // Find existing
          let existingId: string | null = null;
          let matchedOn: string | null = null;

          if (row.salla_store_id && sallaMap.has(row.salla_store_id)) {
            existingId = sallaMap.get(row.salla_store_id)!;
            matchedOn = "salla_store_id";
          } else if (urlKey && urlMap.has(urlKey)) {
            existingId = urlMap.get(urlKey)!;
            matchedOn = "store_url_key";
          } else if (phoneKey && phoneMap.has(phoneKey)) {
            existingId = phoneMap.get(phoneKey)!;
            matchedOn = "phone_key";
          }

          if (existingId) {
            if (duplicateHandling === "skip") {
              skipped++;
              continue;
            }
            // enrich: collect non-empty fields
            const enrichFields: Record<string, string> = {};
            for (const [k, v] of Object.entries(row)) {
              if (v && k !== "store_name" && matchedOn !== k) {
                enrichFields[k] = v;
              }
            }
            if (phoneKey) enrichFields.phone_key = phoneKey;
            if (urlKey) enrichFields.store_url_key = urlKey;
            toEnrich.push({ id: existingId, fields: enrichFields });
          } else {
            const insertRow: Record<string, string | number | null> = {
              store_name: row.store_name,
              store_url: row.store_url || null,
              store_url_key: urlKey,
              salla_store_id: row.salla_store_id || null,
              owner_name: row.owner_name || null,
              phone: row.phone || null,
              phone_key: phoneKey,
              whatsapp: row.whatsapp || null,
              email: row.email || null,
              city: row.city || null,
              region: row.region || null,
              category: row.category || null,
              products_count: row.products_count ? parseInt(row.products_count, 10) || null : null,
              rating: row.rating || null,
              stage: "new",
              source,
              batch_id: batchId,
            };
            toInsert.push(insertRow);
          }
        }

        const total = toInsert.length + toEnrich.length;

        // Insert in batches
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const chunk = toInsert.slice(i, i + BATCH_SIZE);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await adminClient.from("merchants").insert(chunk as any);
          if (error) {
            errors += chunk.length;
          } else {
            imported += chunk.length;
          }
          send({ progress: imported + skipped + errors, total: rows.length });
        }

        // Enrich existing merchants
        for (const { id, fields } of toEnrich) {
          // Build update: only set fields that are currently null/empty
          const { data: existing } = await adminClient
            .from("merchants")
            .select("*")
            .eq("id", id)
            .single();

          if (existing) {
            const update: Record<string, string> = {};
            for (const [k, v] of Object.entries(fields)) {
              const current = (existing as Record<string, unknown>)[k];
              if (!current && v) update[k] = v;
            }
            if (Object.keys(update).length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await adminClient
                .from("merchants")
                .update(update as any)
                .eq("id", id);
              if (error) errors++;
              else imported++;
            } else {
              skipped++;
            }
          } else {
            skipped++;
          }
          send({ progress: imported + skipped + errors, total: rows.length });
        }

        // Update batch record
        await adminClient
          .from("lead_batches")
          .update({
            imported_rows: imported,
            duplicate_rows: skipped,
            invalid_rows: errors,
          })
          .eq("id", batchId);

        send({
          result: { imported, skipped, errors, batchId },
          progress: rows.length,
          total: rows.length,
        });
      } catch (e: unknown) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              error: e instanceof Error ? e.message : "Import failed",
            }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
