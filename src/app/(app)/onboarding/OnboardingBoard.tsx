"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import ProgressRing from "@/components/ui/ProgressRing";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { activateMerchant } from "./actions";

interface BoardCard {
  merchant_id:          string;
  store_name:           string;
  account_manager_name: string | null;
  progress:             number;
  cta_completed_at:     string | null;
  next_step_title:      string | null;
}

interface Props {
  currentUserId: string;
}

const BUCKETS = [0, 50, 100] as const;
type Bucket = typeof BUCKETS[number];

function bucketLabel(b: Bucket) {
  if (b === 0)   return "Not started";
  if (b === 100) return "Ready to activate";
  return "In progress";
}

type MerchantRow = { id: string; store_name: string; cta_completed_at: string | null; account_manager_id: string | null };
type OnboardingRow = { id: string; merchant_id: string; progress: number };
type ProfileRow = { id: string; full_name: string | null };
type StepRow = { merchant_id: string; title: string; order_index: number };

export default function OnboardingBoard({ currentUserId: _currentUserId }: Props) {
  const supabase  = createClient();
  const router    = useRouter();
  const pathname  = usePathname();
  const [, startTransition] = useTransition();

  const [cards,     setCards]     = useState<BoardCard[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [working,   setWorking]   = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawMerchants, error: me } = await (supabase.from("merchants") as any)
        .select("id, store_name, cta_completed_at, account_manager_id")
        .eq("stage", "onboarding");
      if (me) { toast.error((me as { message: string }).message); return; }

      const merchants = (rawMerchants ?? []) as MerchantRow[];
      if (!merchants.length) { setCards([]); return; }

      const merchantIds = merchants.map((m) => m.id);

      // Fetch onboarding progress
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawOnboarding, error: oe } = await (supabase.from("merchant_onboarding") as any)
        .select("id, merchant_id, progress")
        .in("merchant_id", merchantIds)
        .is("completed_at", null);
      if (oe) { toast.error((oe as { message: string }).message); return; }
      const onboardings = (rawOnboarding ?? []) as OnboardingRow[];

      // Fetch account managers
      const managerIds = [...new Set(merchants.map((m) => m.account_manager_id).filter(Boolean))] as string[];
      const profileMap: Record<string, string | null> = {};
      if (managerIds.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rawProfiles } = await (supabase.from("profiles") as any)
          .select("id, full_name")
          .in("id", managerIds);
        for (const p of (rawProfiles ?? []) as ProfileRow[]) {
          profileMap[p.id] = p.full_name;
        }
      }

      // Fetch next open step per merchant
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rawSteps } = await (supabase.from("merchant_onboarding_steps") as any)
        .select("merchant_id, title, order_index")
        .in("merchant_id", merchantIds)
        .in("status", ["pending", "in_progress", "blocked"])
        .order("order_index", { ascending: true });
      const steps = (rawSteps ?? []) as StepRow[];
      const nextStepMap = steps.reduce<Record<string, string>>((acc, s) => {
        if (!acc[s.merchant_id]) acc[s.merchant_id] = s.title;
        return acc;
      }, {});

      const onboardingMap = Object.fromEntries(onboardings.map((o) => [o.merchant_id, o]));

      const result: BoardCard[] = merchants.map((m) => ({
        merchant_id:          m.id,
        store_name:           m.store_name,
        account_manager_name: m.account_manager_id ? (profileMap[m.account_manager_id] ?? null) : null,
        progress:             onboardingMap[m.id]?.progress ?? 0,
        cta_completed_at:     m.cta_completed_at,
        next_step_title:      nextStepMap[m.id] ?? null,
      }));

      setCards(result);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const handleActivate = async () => {
    if (!confirmId) return;
    setWorking(true);
    try {
      await activateMerchant(confirmId);
      toast.success("Merchant activated");
      setConfirmId(null);
      fetchCards();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const daysSince = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
    return `${days}d`;
  };

  const switchView = () => {
    startTransition(() => { router.push(pathname); });
  };

  const grouped = BUCKETS.map((bucket) => ({
    bucket,
    label:  bucketLabel(bucket),
    cards:  cards.filter((c) => {
      if (bucket === 0)   return c.progress === 0;
      if (bucket === 100) return c.progress === 100;
      return c.progress > 0 && c.progress < 100;
    }),
  }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ fontSize: 17, fontWeight: 500, margin: 0, color: "var(--ink)" }}>Onboarding</h1>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,.55)", borderRadius: 999, padding: 3 }}>
          <button className="pill" onClick={switchView} style={{ padding: "4px 10px", fontSize: 12 }}>Step queue</button>
          <button className="pill active" style={{ padding: "4px 10px", fontSize: 12 }}>Board</button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--ink-3)", padding: "40px 0", textAlign: "center" }}>Loading…</div>
      ) : cards.length === 0 ? (
        <EmptyState icon="🎉" title="No merchants in onboarding" description="All merchants are active or not yet started." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, alignItems: "start" }}>
          {grouped.map(({ bucket, label, cards: colCards }) => (
            <div key={bucket}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>{label}</span>
                <span style={{
                  fontSize: 11, padding: "1px 7px", borderRadius: 999, fontWeight: 500,
                  background: bucket === 100 ? "var(--green-bg)" : "rgba(255,255,255,.6)",
                  color:      bucket === 100 ? "var(--green)"    : "var(--ink-3)",
                }}>
                  {colCards.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {colCards.length === 0 ? (
                  <div style={{ padding: "24px 0", textAlign: "center", color: "var(--ink-4)", fontSize: 12 }}>Empty</div>
                ) : colCards.map((card) => (
                  <div key={card.merchant_id} className="glass-card" style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <a href={`/merchants/${card.merchant_id}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", textDecoration: "none", display: "block", marginBottom: 2 }}>
                          {card.store_name}
                        </a>
                        {card.account_manager_name && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{card.account_manager_name}</div>
                        )}
                      </div>
                      <ProgressRing value={card.progress} size={44} />
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
                      CTA <span style={{ color: "var(--ink-2)" }}>{daysSince(card.cta_completed_at)} ago</span>
                    </div>
                    {card.next_step_title && (
                      <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: bucket === 100 ? 12 : 0, fontStyle: "italic" }}>
                        {card.next_step_title}
                      </div>
                    )}
                    {bucket === 100 && (
                      <button
                        className="pill dark"
                        style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
                        onClick={() => setConfirmId(card.merchant_id)}
                      >
                        Activate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={handleActivate}
        loading={working}
        title="Activate merchant"
        body="This will move the merchant to active stage. All onboarding steps must be completed."
        confirmLabel="Activate"
      />
    </div>
  );
}
