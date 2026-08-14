"use client";
import { useState, useEffect, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import Drawer from "@/components/ui/Drawer";
import { toast } from "sonner";
import type { Profile } from "@/lib/database.types";
import type { VSpecialistPerformance } from "@/lib/database.types";
import {
  bulkAssignManual,
  bulkAssignRoundRobin,
  bulkAssignByCity,
} from "./actions";

type Tab = "manual" | "round-robin" | "by-city";

interface Props {
  open: boolean;
  onClose: () => void;
  merchantIds: string[];
  cities: string[];
  onSuccess: () => void;
}

export default function AssignDrawer({
  open,
  onClose,
  merchantIds,
  cities,
  onSuccess,
}: Props) {
  const [tab, setTab] = useState<Tab>("manual");
  const [specialistId, setSpecialistId] = useState<string>("");
  const [selectedSpecialists, setSelectedSpecialists] = useState<string[]>([]);
  const [cityMap, setCityMap] = useState<Record<string, string>>({});
  const [specialists, setSpecialists] = useState<Profile[]>([]);
  const [perf, setPerf] = useState<VSpecialistPerformance[]>([]);
  const [isPending, startTransition] = useTransition();

  const supabase = createClient();

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .in("role", ["acq_specialist", "acq_manager"])
        .eq("is_active", true)
        .order("full_name"),
      supabase.from("v_specialist_performance").select("*"),
    ]).then(([{ data: s }, { data: p }]) => {
      if (s) setSpecialists(s as Profile[]);
      if (p) setPerf(p as VSpecialistPerformance[]);
    });
  }, [open]);

  // Round-robin preview: count how many each specialist would receive
  const rrPreview: Record<string, number> = {};
  if (selectedSpecialists.length > 0) {
    merchantIds.forEach((_, i) => {
      const sid = selectedSpecialists[i % selectedSpecialists.length];
      rrPreview[sid] = (rrPreview[sid] ?? 0) + 1;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      try {
        if (tab === "manual") {
          if (!specialistId) {
            toast.error("Select a specialist first");
            return;
          }
          await bulkAssignManual(merchantIds, specialistId);
        } else if (tab === "round-robin") {
          if (selectedSpecialists.length === 0) {
            toast.error("Select at least one specialist");
            return;
          }
          await bulkAssignRoundRobin(merchantIds, selectedSpecialists);
        } else {
          await bulkAssignByCity(merchantIds, cityMap);
        }
        toast.success(
          `${merchantIds.length} lead${merchantIds.length === 1 ? "" : "s"} assigned`,
        );
        onSuccess();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Assignment failed");
      }
    });
  }

  const labelCount = merchantIds.length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Assign ${labelCount} lead${labelCount === 1 ? "" : "s"}`}
      width={520}
    >
      {/* Segmented control */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 22,
          background: "rgba(255,255,255,.6)",
          borderRadius: 11,
          padding: 4,
        }}
      >
        {(["manual", "round-robin", "by-city"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              border: "none",
              cursor: "pointer",
              padding: "6px 0",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              background: tab === t ? "#fff" : "transparent",
              color: tab === t ? "var(--ink)" : "var(--ink-3)",
              boxShadow:
                tab === t ? "0 1px 4px rgba(40,60,110,.1)" : "none",
              transition: "all 0.12s",
            }}
          >
            {t === "manual"
              ? "Manual"
              : t === "round-robin"
                ? "Round-robin"
                : "By city"}
          </button>
        ))}
      </div>

      {/* ── Manual tab ── */}
      {tab === "manual" && (
        <div>
          <label className="field-label">
            Assign all {labelCount} leads to
          </label>
          <select
            className="field"
            value={specialistId}
            onChange={(e) => setSpecialistId(e.target.value)}
          >
            <option value="">Select specialist…</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.email}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Round-robin tab ── */}
      {tab === "round-robin" && (
        <div>
          <label className="field-label" style={{ marginBottom: 10 }}>
            Distribute among specialists
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {specialists.map((s) => {
              const sp = perf.find((p) => p.user_id === s.id);
              const openNow = sp?.open_now ?? 0;
              const checked = selectedSpecialists.includes(s.id);
              return (
                <label
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 10,
                    background: checked
                      ? "rgba(226,237,251,.85)"
                      : "rgba(255,255,255,.7)",
                    cursor: "pointer",
                    border: `1px solid ${checked ? "rgba(63,127,214,.2)" : "transparent"}`,
                    transition: "background 0.1s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelectedSpecialists((prev) =>
                        e.target.checked
                          ? [...prev, s.id]
                          : prev.filter((id) => id !== s.id),
                      )
                    }
                    style={{ width: 15, height: 15, accentColor: "var(--blue)" }}
                  />
                  <span style={{ flex: 1, fontSize: 13 }}>
                    {s.full_name ?? s.email}
                  </span>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "var(--ink-3)",
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                  >
                    {openNow}/{s.max_open_merchants}
                  </span>
                  {checked && rrPreview[s.id] && (
                    <span
                      style={{
                        fontSize: 11,
                        background: "var(--blue-bg)",
                        color: "var(--blue-d)",
                        borderRadius: 99,
                        padding: "2px 8px",
                        fontWeight: 500,
                      }}
                    >
                      +{rrPreview[s.id]}
                    </span>
                  )}
                </label>
              );
            })}
          </div>

          {selectedSpecialists.length > 0 && (
            <div
              style={{
                marginTop: 14,
                padding: "10px 14px",
                borderRadius: 10,
                background: "rgba(255,255,255,.7)",
                fontSize: 12.5,
                color: "var(--ink-2)",
                lineHeight: 1.7,
              }}
            >
              <span style={{ color: "var(--ink-3)", marginRight: 4 }}>
                Preview:
              </span>
              {Object.entries(rrPreview)
                .map(([sid, count]) => {
                  const name =
                    specialists.find((s) => s.id === sid)?.full_name ??
                    "Unknown";
                  return `${count} → ${name}`;
                })
                .join(", ")}
            </div>
          )}
        </div>
      )}

      {/* ── By city tab ── */}
      {tab === "by-city" && (
        <div>
          <label className="field-label" style={{ marginBottom: 12 }}>
            Map cities to specialists
          </label>
          {cities.length === 0 ? (
            <p style={{ color: "var(--ink-3)", fontSize: 12.5 }}>
              No city data found in selected leads.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cities.map((city) => (
                <div
                  key={city}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <span
                    style={{
                      width: 130,
                      fontSize: 13,
                      color: "var(--ink)",
                      flexShrink: 0,
                      fontWeight: 500,
                    }}
                  >
                    {city}
                  </span>
                  <select
                    className="field"
                    value={cityMap[city] ?? ""}
                    onChange={(e) =>
                      setCityMap((prev) => ({
                        ...prev,
                        [city]: e.target.value,
                      }))
                    }
                  >
                    <option value="">Not assigned</option>
                    {specialists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name ?? s.email}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      <div
        style={{
          marginTop: 28,
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          borderTop: "1px solid var(--g-line)",
          paddingTop: 16,
        }}
      >
        <button className="pill outline" onClick={onClose} disabled={isPending}>
          Cancel
        </button>
        <button
          className="pill dark"
          onClick={handleConfirm}
          disabled={isPending || merchantIds.length === 0}
        >
          {isPending
            ? "Assigning…"
            : `Assign ${labelCount} lead${labelCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </Drawer>
  );
}
