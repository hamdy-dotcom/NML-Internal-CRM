"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PhoneCell from "@/components/ui/PhoneCell";
import EmptyState from "@/components/ui/EmptyState";
import AssignDrawer from "./AssignDrawer";
import { timeAgo } from "@/lib/utils";
import type { VMerchantList, LeadBatch } from "@/lib/database.types";

interface Filters {
  q?: string;
  batch?: string;
  city?: string;
  category?: string;
}

interface Props {
  merchants: VMerchantList[];
  total: number;
  page: number;
  pageSize: number;
  batches: Pick<LeadBatch, "id" | "name">[];
  cities: string[];
  categories: string[];
  filters: Filters;
}

export default function LeadsTable({
  merchants,
  total,
  page,
  pageSize,
  batches,
  cities,
  categories,
  filters,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const totalPages = Math.ceil(total / pageSize);
  const allChecked = merchants.length > 0 && selected.size === merchants.length;

  function buildUrl(updates: Partial<Filters & { page: string }>) {
    const merged = { ...filters, ...updates };
    const sp = new URLSearchParams();
    if (merged.q) sp.set("q", merged.q);
    if (merged.batch) sp.set("batch", merged.batch);
    if (merged.city) sp.set("city", merged.city);
    if (merged.category) sp.set("category", merged.category);
    if ((updates as { page?: string }).page) sp.set("page", (updates as { page?: string }).page!);
    return `/leads?${sp.toString()}`;
  }

  function nav(updates: Partial<Filters & { page: string }>) {
    startTransition(() => router.push(buildUrl(updates)));
  }

  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(merchants.map((m) => m.id)));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCities = Array.from(
    new Set(
      merchants
        .filter((m) => selected.has(m.id))
        .map((m) => m.city)
        .filter(Boolean) as string[],
    ),
  );

  return (
    <>
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 500 }}>Leads</h1>
        <span
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-3)" }}
        >
          {total.toLocaleString("en-US")}
        </span>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          {selected.size > 0 && (
            <button
              className="pill ghost"
              onClick={() => setDrawerOpen(true)}
            >
              Assign {selected.size} selected
            </button>
          )}
          <Link href="/leads/import" className="pill dark">
            ↑ Import leads
          </Link>
        </div>
      </div>

      {/* ── Filters ── */}
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <input
          className="field"
          placeholder="Search store, owner, phone…"
          defaultValue={filters.q ?? ""}
          style={{ width: 240 }}
          onChange={(e) => nav({ q: e.target.value || undefined, page: undefined } as Partial<Filters>)}
        />
        <select
          className="field"
          style={{ width: 160 }}
          value={filters.batch ?? ""}
          onChange={(e) =>
            nav({ batch: e.target.value || undefined, page: undefined } as Partial<Filters>)
          }
        >
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          style={{ width: 140 }}
          value={filters.city ?? ""}
          onChange={(e) =>
            nav({ city: e.target.value || undefined, page: undefined } as Partial<Filters>)
          }
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="field"
          style={{ width: 160 }}
          value={filters.category ?? ""}
          onChange={(e) =>
            nav({ category: e.target.value || undefined, page: undefined } as Partial<Filters>)
          }
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* ── Bulk bar ── */}
      {selected.size > 0 && (
        <div className="bulk-bar" style={{ marginBottom: 10 }}>
          <span className="count">{selected.size} selected</span>
          <button onClick={() => setDrawerOpen(true)}>Assign →</button>
          <button
            onClick={() => setSelected(new Set())}
            className="close"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Table ── */}
      {merchants.length === 0 ? (
        <EmptyState
          title="The pool is empty"
          description="Import leads to get started."
          action={
            <Link href="/leads/import" className="pill dark">
              ↑ Import leads
            </Link>
          }
        />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="nml-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                    style={{ accentColor: "var(--blue)", cursor: "pointer" }}
                  />
                </th>
                <th>Store name</th>
                <th>Owner</th>
                <th>Phone</th>
                <th>City</th>
                <th>Category</th>
                <th style={{ textAlign: "end" }}>SKUs</th>
                <th>Batch</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} className={selected.has(m.id) ? "sel" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggleRow(m.id)}
                      style={{ accentColor: "var(--blue)", cursor: "pointer" }}
                    />
                  </td>
                  <td>
                    {m.store_url ? (
                      <a
                        href={m.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "var(--blue)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        {m.store_name}
                      </a>
                    ) : (
                      <span style={{ fontWeight: 500 }}>{m.store_name}</span>
                    )}
                  </td>
                  <td style={{ color: "var(--ink-2)" }}>
                    {m.owner_name ?? "—"}
                  </td>
                  <td>
                    <PhoneCell phone={m.phone} whatsapp={m.whatsapp} />
                  </td>
                  <td style={{ color: "var(--ink-2)" }}>{m.city ?? "—"}</td>
                  <td style={{ color: "var(--ink-2)" }}>
                    {m.category ?? "—"}
                  </td>
                  <td className="num">
                    {m.products_count != null ? (
                      <span className="mono">{m.products_count}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="sub">{m.batch_name ?? "—"}</td>
                  <td className="sub">{timeAgo(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginTop: 16,
          }}
        >
          <button
            className="pill outline"
            disabled={page <= 1}
            onClick={() => nav({ page: String(page - 1) })}
          >
            ← Prev
          </button>
          <span
            style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 100, textAlign: "center" }}
          >
            Page {page} of {totalPages}
          </span>
          <button
            className="pill outline"
            disabled={page >= totalPages}
            onClick={() => nav({ page: String(page + 1) })}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Assign drawer ── */}
      <AssignDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        merchantIds={Array.from(selected)}
        cities={selectedCities}
        onSuccess={() => {
          setSelected(new Set());
          setDrawerOpen(false);
        }}
      />
    </>
  );
}
