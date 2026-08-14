import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import StepQueue from "./StepQueue";
import OnboardingBoard from "./OnboardingBoard";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

export default async function OnboardingPage({ searchParams }: Props) {
  const { view } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isBoard = view === "board";

  return (
    <div style={{ paddingTop: 16 }}>
      <Suspense fallback={<div style={{ padding: "20px 0", color: "var(--ink-3)" }}>Loading…</div>}>
        {isBoard ? (
          <OnboardingBoard currentUserId={user?.id ?? ""} />
        ) : (
          <StepQueue currentUserId={user?.id ?? ""} />
        )}
      </Suspense>
    </div>
  );
}
