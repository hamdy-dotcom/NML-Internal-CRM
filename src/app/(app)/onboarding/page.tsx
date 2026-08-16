import { createClient } from "@/lib/supabase/server";
import OnboardingList from "./OnboardingList";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div style={{ paddingTop: 16 }}>
      <OnboardingList currentUserId={user?.id ?? ""} />
    </div>
  );
}
