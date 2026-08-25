import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import StatTile from "@/components/ui/StatTile";
import ProgressRing from "@/components/ui/ProgressRing";
import EmptyState from "@/components/ui/EmptyState";
import type { MerchantStage, UserRole, VSpecialistPerformance } from "@/lib/database.types";
import { STAGE_LABELS, fmtDate } from "@/lib/utils";

// ── Date range helpers ─────────────────────────────────────────────────────

type Range = "week" | "month" | "30d";

function getDateStart(range: Range): string {
  const d = new Date();
  if (range === "week")  { d.setDate(d.getDate() - 7);  d.setHours(0, 0, 0, 0); }
  if (range === "30d")   { d.setDate(d.getDate() - 30); d.setHours(0, 0, 0, 0); }
  if (range === "month") { d.setDate(1);                 d.setHours(0, 0, 0, 0); }
  return d.toISOString();
}

const RANGE_LABELS: Record<Range, string> = {
  week:  "This week",
  month: "This month",
  "30d": "Last 30 days",
};

// ── Shared helper — cast Supabase partial selects ─────────────────────────

// Supabase's TypeScript inference collapses to `never` for partial column
// selects when the Database Row types use mapped types. Casting through
// `unknown` is the standard workaround; the runtime data is always correct.
function castRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

// ── Date-range picker (server-rendered links) ──────────────────────────────

function RangePicker({ current }: { current: Range }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {(["week", "month", "30d"] as Range[]).map((r) => (
        <Link
          key={r}
          href={`?range=${r}`}
          className={`pill${current === r ? " active" : " outline"}`}
          style={{ fontSize: 12, padding: "4px 12px" }}
        >
          {RANGE_LABELS[r]}
        </Link>
      ))}
    </div>
  );
}

// ── Stat tile row ──────────────────────────────────────────────────────────

function TileRow({ tiles }: {
  tiles: { label: string; value: number | string; tint?: "blue" | "green" | "amber" | "red" }[]
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length},1fr)`, gap: 12, marginBottom: 20 }}>
      {tiles.map((t) => <StatTile key={t.label} label={t.label} value={t.value} tint={t.tint} />)}
    </div>
  );
}

// ── Funnel bar ─────────────────────────────────────────────────────────────

const FUNNEL_STAGES: MerchantStage[] = [
  "new", "assigned", "contacted", "interested",
  "form_sent", "cta_completed", "onboarding", "active",
];

function FunnelBar({ counts }: { counts: Partial<Record<MerchantStage, number>> }) {
  const total = Math.max(counts["new"] ?? 0, 1);
  return (
    <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 10 }}>Pipeline funnel</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {FUNNEL_STAGES.map((s) => {
          const n   = counts[s] ?? 0;
          const pct = Math.round((n / total) * 100);
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 90, fontSize: 11.5, color: "var(--ink-3)", flexShrink: 0 }}>{STAGE_LABELS[s]}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(120,135,160,.15)", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--blue)", transition: "width .4s ease" }} />
              </div>
              <span className="num" style={{ width: 32, fontSize: 12 }}>{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Role dashboards
// ─────────────────────────────────────────────────────────────────────────────

// Shapes for partial-select results
type StageRow    = { stage: MerchantStage };
type DueNowRow   = { id: string; store_name: string; phone: string | null; next_action_at: string | null; stage: MerchantStage };
type StaleRow    = { id: string; store_name: string; stage: MerchantStage; last_activity_at: string | null };
type OnboardingProgressRow = { id: string; merchant_id: string; progress: number };
type OverdueStepRow = { id: string; title: string; merchant_id: string; due_at: string | null };
type OnboardingMerchantRow = { id: string; store_name: string; cta_completed_at: string | null };

async function SpecialistDashboard({ userId, dateStart: _dateStart }: { userId: string; dateStart: string }) {
  const supabase   = await createClient();
  const now        = new Date().toISOString();
  const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); })();

  const [
    { count: myMerchants },
    { count: dueToday },
    { count: formsSent },
    { count: converted },
    rawDueNow,
    rawStageRows,
  ] = await Promise.all([
    supabase.from("merchants").select("*", { count: "exact", head: true })
      .eq("acquisition_owner_id", userId).not("stage", "in", "(active,lost,not_interested)"),
    supabase.from("merchants").select("*", { count: "exact", head: true })
      .eq("acquisition_owner_id", userId).lte("next_action_at", now).not("stage", "in", "(active,lost,not_interested)"),
    supabase.from("merchants").select("*", { count: "exact", head: true })
      .eq("acquisition_owner_id", userId).eq("stage", "form_sent"),
    supabase.from("merchants").select("*", { count: "exact", head: true })
      .eq("acquisition_owner_id", userId).gte("cta_completed_at", monthStart),
    supabase.from("merchants").select("id, store_name, phone, next_action_at, stage")
      .eq("acquisition_owner_id", userId).lte("next_action_at", now).not("stage", "in", "(active,lost,not_interested)")
      .order("next_action_at", { ascending: true }).limit(20),
    supabase.from("merchants").select("stage")
      .eq("acquisition_owner_id", userId).not("stage", "in", "(active,lost,not_interested)"),
  ]);

  const dueNow   = castRows<DueNowRow>(rawDueNow.data);
  const stageRows = castRows<StageRow>(rawStageRows.data);

  const stageCounts: Partial<Record<MerchantStage, number>> = {};
  for (const r of stageRows) {
    stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;
  }

  return (
    <>
      <TileRow tiles={[
        { label: "My merchants",         value: myMerchants ?? 0 },
        { label: "Due today",            value: dueToday ?? 0,   tint: (dueToday ?? 0) > 0 ? "amber" : undefined },
        { label: "Forms awaiting",       value: formsSent ?? 0,  tint: "blue" },
        { label: "Converted this month", value: converted ?? 0,  tint: "green" },
      ]} />

      <FunnelBar counts={stageCounts} />

      <div className="glass-panel" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 10 }}>Due now</div>
        {!dueNow.length ? (
          <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0 }}>No merchants due right now.</p>
        ) : (
          <table className="nml-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Phone</th>
                <th>Days overdue</th>
                <th>Stage</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dueNow.map((m) => {
                const daysOverdue = m.next_action_at
                  ? Math.floor((Date.now() - new Date(m.next_action_at).getTime()) / 86_400_000)
                  : 0;
                return (
                  <tr key={m.id} className={daysOverdue > 0 ? "warn" : undefined}>
                    <td style={{ fontWeight: 500 }}>{m.store_name}</td>
                    <td><span className="mono">{m.phone ?? "—"}</span></td>
                    <td><span style={{ color: daysOverdue > 0 ? "var(--red)" : "var(--ink-2)" }}>{daysOverdue > 0 ? `${daysOverdue}d` : "Today"}</span></td>
                    <td><span className="badge badge-ghost">{STAGE_LABELS[m.stage]}</span></td>
                    <td>
                      <Link href={`/merchants/${m.id}`} target="_blank" rel="noreferrer" className="pill outline" style={{ padding: "3px 10px", fontSize: 12 }}>Open</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

async function ManagerDashboard({ userId: _userId, dateStart: _dateStart }: { userId: string; dateStart: string }) {
  const supabase = await createClient();

  const staleDate = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    rawStageRows,
    rawSpecialists,
    { count: unassigned },
    rawStale,
  ] = await Promise.all([
    supabase.from("merchants").select("stage").not("stage", "in", "(lost,not_interested)").limit(10000),
    supabase.from("v_specialist_performance").select("*"),
    supabase.from("merchants").select("*", { count: "exact", head: true }).eq("stage", "new"),
    supabase.from("merchants").select("id, store_name, stage, last_activity_at")
      .lt("last_activity_at", staleDate).not("stage", "in", "(active,lost,on_hold,not_interested)")
      .order("last_activity_at", { ascending: true }).limit(20),
  ]);

  const stageRows   = castRows<StageRow>(rawStageRows.data);
  const specialists = castRows<VSpecialistPerformance>(rawSpecialists.data);
  const stale       = castRows<StaleRow>(rawStale.data);

  const stageCounts: Partial<Record<MerchantStage, number>> = {};
  for (const r of stageRows) {
    stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;
  }

  return (
    <>
      {(unassigned ?? 0) > 0 && (
        <div className="glass-card" style={{ padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 500, fontSize: 14, color: "var(--ink)" }}>{unassigned} unassigned leads</span>
            <span style={{ fontSize: 12.5, color: "var(--ink-3)", marginLeft: 8 }}>waiting in the queue</span>
          </div>
          <Link href="/leads" className="pill dark" style={{ fontSize: 12 }}>View leads</Link>
        </div>
      )}

      <FunnelBar counts={stageCounts} />

      {specialists.length > 0 && (
        <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 10 }}>Specialist performance</div>
          <div style={{ overflowX: "auto" }}>
            <table className="nml-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Open now</th>
                  <th>Assigned</th>
                  <th>Contacts</th>
                  <th>Forms sent</th>
                  <th>CTA done</th>
                  <th>Conversion %</th>
                  <th>Avg days to CTA</th>
                </tr>
              </thead>
              <tbody>
                {specialists.map((s) => (
                  <tr key={s.user_id}>
                    <td style={{ fontWeight: 500 }}>{s.full_name ?? "—"}</td>
                    <td><span className="num">{s.open_now}</span></td>
                    <td><span className="num">{s.assigned}</span></td>
                    <td><span className="num">{s.contacted}</span></td>
                    <td><span className="num">{s.forms_sent}</span></td>
                    <td><span className="num">{s.cta_done}</span></td>
                    <td><span className="num">{s.conversion_pct ? `${Number(s.conversion_pct).toFixed(1)}%` : "—"}</span></td>
                    <td><span className="num">{s.avg_days_to_cta ? `${Number(s.avg_days_to_cta).toFixed(1)}d` : "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {stale.length > 0 && (
        <div className="glass-panel" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--amber)", marginBottom: 10 }}>
            Stale merchants <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>(no activity in 7+ days)</span>
          </div>
          <table className="nml-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Stage</th>
                <th>Last activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {stale.map((m) => (
                <tr key={m.id} className="warn">
                  <td style={{ fontWeight: 500 }}>{m.store_name}</td>
                  <td><span className="badge badge-ghost">{STAGE_LABELS[m.stage]}</span></td>
                  <td><span className="sub">{m.last_activity_at ? fmtDate(m.last_activity_at) : "Never"}</span></td>
                  <td>
                    <Link href={`/merchants/${m.id}`} target="_blank" rel="noreferrer" className="pill outline" style={{ padding: "3px 10px", fontSize: 12 }}>Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function AccountManagerDashboard({ userId, dateStart: _dateStart }: { userId: string; dateStart: string }) {
  const supabase   = await createClient();
  const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.toISOString(); })();

  const rawMerchants = await supabase
    .from("merchants")
    .select("id, store_name, cta_completed_at")
    .eq("account_manager_id", userId)
    .eq("stage", "onboarding");

  const onboardingMerchants = castRows<OnboardingMerchantRow>(rawMerchants.data);
  const merchantIds = onboardingMerchants.map((m) => m.id);

  const [
    rawOnboardings,
    rawOverdueSteps,
    { count: activatedThisMonth },
  ] = await Promise.all([
    merchantIds.length
      ? supabase.from("merchant_onboarding").select("id, merchant_id, progress")
          .in("merchant_id", merchantIds).is("completed_at", null)
      : Promise.resolve({ data: [] as unknown }),
    merchantIds.length
      ? supabase.from("merchant_onboarding_steps")
          .select("id, title, merchant_id, due_at")
          .in("merchant_id", merchantIds)
          .not("status", "in", "(done,skipped)")
          .lt("due_at", new Date().toISOString())
          .order("due_at", { ascending: true })
      : Promise.resolve({ data: [] as unknown }),
    supabase.from("merchants").select("*", { count: "exact", head: true })
      .eq("account_manager_id", userId).eq("stage", "active").gte("activated_at", monthStart),
  ]);

  const onboardings   = castRows<OnboardingProgressRow>(rawOnboardings.data);
  const overdueSteps  = castRows<OverdueStepRow>(rawOverdueSteps.data);

  const progressMap = Object.fromEntries(onboardings.map((o) => [o.merchant_id, o.progress]));
  const nextStepMap = overdueSteps.reduce<Record<string, string>>((acc, s) => {
    if (!acc[s.merchant_id]) acc[s.merchant_id] = s.title;
    return acc;
  }, {});

  const daysSinceCTA = (date: string | null) => {
    if (!date) return "—";
    const days = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
    return `${days}d`;
  };

  return (
    <>
      <TileRow tiles={[
        { label: "Activated this month", value: activatedThisMonth ?? 0, tint: "green" },
        { label: "In onboarding",        value: onboardingMerchants.length, tint: "blue" },
        { label: "Overdue steps",        value: overdueSteps.length, tint: overdueSteps.length > 0 ? "red" : undefined },
      ]} />

      {onboardingMerchants.length > 0 ? (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)", marginBottom: 10 }}>Merchants in onboarding</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12, marginBottom: 20 }}>
            {onboardingMerchants.map((m) => (
              <Link key={m.id} href={`/merchants/${m.id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                <div className="glass-card" style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{m.store_name}</span>
                    <ProgressRing value={progressMap[m.id] ?? 0} size={44} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    CTA <span style={{ color: "var(--ink-2)" }}>{daysSinceCTA(m.cta_completed_at)} ago</span>
                  </div>
                  {nextStepMap[m.id] && (
                    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, fontStyle: "italic" }}>
                      {nextStepMap[m.id]}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState icon="📦" title="No merchants in onboarding" description="All your merchants are active or not yet started." />
      )}

      {overdueSteps.length > 0 && (
        <div className="glass-panel" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--red)", marginBottom: 10 }}>Overdue steps</div>
          <table className="nml-table">
            <thead>
              <tr>
                <th>Merchant</th>
                <th>Step</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {overdueSteps.map((s) => (
                <tr key={s.id} className="warn">
                  <td>
                    <Link href={`/merchants/${s.merchant_id}`} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 500 }}>
                      {onboardingMerchants.find((m) => m.id === s.merchant_id)?.store_name ?? "—"}
                    </Link>
                  </td>
                  <td>{s.title}</td>
                  <td><span style={{ fontSize: 12.5, color: "var(--red)" }}>{s.due_at ? fmtDate(s.due_at) : "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

async function CatalogOpsDashboard({ dateStart: _dateStart }: { dateStart: string }) {
  const supabase  = await createClient();
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d.toISOString(); })();

  const [
    { count: readyCount },
    { count: inReviewCount },
    { count: shelvedWeek },
    rawTopMerchants,
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "ready_for_shelf"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "in_review"),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("status", "shelved").gte("shelved_at", weekStart),
    supabase.from("products").select("merchant_id").eq("status", "ready_for_shelf").limit(100000),
  ]);

  // Count by merchant, then join store names
  const merchantIdCounts: Record<string, number> = {};
  for (const r of castRows<{ merchant_id: string }>(rawTopMerchants.data)) {
    merchantIdCounts[r.merchant_id] = (merchantIdCounts[r.merchant_id] ?? 0) + 1;
  }
  const topIds = Object.entries(merchantIdCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);

  const nameMap: Record<string, string> = {};
  if (topIds.length) {
    const rawNames = await supabase.from("merchants").select("id, store_name").in("id", topIds);
    for (const r of castRows<{ id: string; store_name: string }>(rawNames.data)) {
      nameMap[r.id] = r.store_name;
    }
  }

  const sorted = topIds.map((id) => ({ id, name: nameMap[id] ?? id, count: merchantIdCounts[id] }));
  const maxCount = sorted[0]?.count ?? 1;

  return (
    <>
      <TileRow tiles={[
        { label: "Ready for shelf",   value: readyCount    ?? 0, tint: "blue" },
        { label: "In review",         value: inReviewCount ?? 0, tint: "amber" },
        { label: "Shelved this week", value: shelvedWeek   ?? 0, tint: "green" },
      ]} />

      <div className="glass-panel" style={{ padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
            Top merchants by ready-for-shelf products
          </span>
          <Link href="/products" className="pill outline" style={{ fontSize: 12, padding: "3px 10px" }}>
            All products →
          </Link>
        </div>
        {sorted.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-3)" }}>No products ready for shelf.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Link href={`/merchants/${m.id}`} target="_blank" rel="noreferrer" style={{ width: 180, fontSize: 12.5, color: "var(--blue)", textDecoration: "none", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.name}
                </Link>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: "rgba(120,135,160,.15)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.round((m.count / maxCount) * 100)}%`, height: "100%", borderRadius: 999, background: "var(--blue)" }} />
                </div>
                <span className="num" style={{ width: 36, fontSize: 12 }}>{m.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

interface Props {
  searchParams: Promise<{ range?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const { range: rawRange } = await searchParams;
  const range     = (["week", "month", "30d"].includes(rawRange ?? "") ? rawRange : "month") as Range;
  const dateStart = getDateStart(range);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const rawProfile = await supabase.from("profiles").select("role, full_name").eq("id", user!.id).single();
  const profile    = rawProfile.data as { role: UserRole; full_name: string | null } | null;

  const role = profile?.role;

  return (
    <div style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 500, margin: "0 0 2px", color: "var(--ink)" }}>
            {profile?.full_name ? `Hi, ${profile.full_name.split(" ")[0]}` : "Dashboard"}
          </h1>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)" }}>{RANGE_LABELS[range]}</p>
        </div>
        <RangePicker current={range} />
      </div>

      {role === "acq_specialist" && (
        <SpecialistDashboard userId={user!.id} dateStart={dateStart} />
      )}
      {(role === "acq_manager" || role === "admin") && (
        <ManagerDashboard userId={user!.id} dateStart={dateStart} />
      )}
      {role === "account_manager" && (
        <AccountManagerDashboard userId={user!.id} dateStart={dateStart} />
      )}
      {role === "catalog_ops" && (
        <CatalogOpsDashboard dateStart={dateStart} />
      )}
      {role === "viewer" && (
        <EmptyState icon="👀" title="Viewer access" description="You have read-only access. Contact your admin to get a full role." />
      )}
    </div>
  );
}
