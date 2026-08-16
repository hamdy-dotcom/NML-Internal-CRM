"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import FetchPopup from "./FetchPopup";

interface Merchant {
  id:         string;
  store_name: string;
  store_url:  string;
}

interface Job {
  id:         string;
  merchant_id: string;
  status:     "pending" | "running" | "done" | "error";
  error:      string | null;
  created_at: string;
  progress:   { products_found?: number };
}

export default function FetchPanel() {
  const supabase = createClient();

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [jobs,      setJobs]      = useState<Job[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [fetchFor,  setFetchFor]  = useState<Merchant | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: ms } = await db.from("merchants")
        .select("id, store_name, store_url")
        .not("store_url", "is", null)
        .order("store_name");

      if (!ms?.length) { setMerchants([]); return; }

      const { data: js } = await db.from("salla_fetch_jobs")
        .select("id, merchant_id, status, error, created_at, progress")
        .in("merchant_id", ms.map((m: Merchant) => m.id))
        .order("created_at", { ascending: false });

      setMerchants(ms);
      setJobs(js ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  if (!loading && merchants.length === 0) return null;

  function latestJob(merchantId: string): Job | undefined {
    return jobs.find(j => j.merchant_id === merchantId);
  }

  function MerchantCard({ m }: { m: Merchant }) {
    const job = latestJob(m.id);

    const statusNode = !job ? null : job.status === "pending" || job.status === "running" ? (
      <span style={{ fontSize: 11.5, color: "var(--blue)" }}>
        Fetching… {job.progress?.products_found ? `${job.progress.products_found} found` : ""}
      </span>
    ) : job.status === "done" ? (
      <span style={{ fontSize: 11.5, color: "var(--green)" }}>
        ✓ {job.progress?.products_found ?? "?"} products fetched
      </span>
    ) : (
      <span style={{ fontSize: 11.5, color: "var(--red)" }} title={job.error ?? undefined}>
        Error — {job.error?.slice(0, 60) ?? "unknown"}
      </span>
    );

    const fetching = job?.status === "pending" || job?.status === "running";

    return (
      <div className="glass-card" style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 500, fontSize: 13, color: "var(--ink)", marginBottom: 2 }}>
            {m.store_name}
          </div>
          <a href={m.store_url} target="_blank" rel="noreferrer"
            style={{ fontSize: 11.5, color: "var(--ink-3)", textDecoration: "none" }}>
            {m.store_url}
          </a>
          {statusNode && <div style={{ marginTop: 4 }}>{statusNode}</div>}
        </div>
        <button
          className="pill outline"
          style={{ fontSize: 12, flexShrink: 0, opacity: fetching ? 0.5 : 1 }}
          disabled={fetching}
          onClick={() => setFetchFor(m)}
        >
          {job?.status === "done" ? "Re-fetch" : fetching ? "Fetching…" : "Fetch products"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>
          Fetch from Salla stores
        </h2>
        <button onClick={() => setCollapsed(c => !c)}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--ink-4)", padding: 0 }}>
          {collapsed ? "▶ show" : "▼ hide"}
        </button>
      </div>

      {!collapsed && (
        loading ? (
          <div style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "8px 0" }}>Loading…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 8 }}>
            {merchants.map(m => <MerchantCard key={m.id} m={m} />)}
          </div>
        )
      )}

      {fetchFor && (
        <FetchPopup
          merchant={fetchFor}
          onClose={() => { setFetchFor(null); load(); }}
        />
      )}
    </div>
  );
}
