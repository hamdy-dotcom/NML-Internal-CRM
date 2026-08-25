import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/database.types";
import UsersTab from "./UsersTab";
import TeamsTab from "./TeamsTab";
import FormTemplatesTab from "./FormTemplatesTab";
import OnboardingTemplatesTab from "./OnboardingTemplatesTab";
import LookupsTab from "./LookupsTab";
import CategoriesTab from "./CategoriesTab";

const TABS = [
  { key: "users", label: "Users" },
  { key: "teams", label: "Teams" },
  { key: "forms", label: "Form templates" },
  { key: "onboarding", label: "Onboarding templates" },
  { key: "lookups", label: "Lookups" },
  { key: "categories", label: "Categories" },
] as const;

type Tab = typeof TABS[number]["key"];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = profile?.role as UserRole;
  if (!["admin", "acq_manager"].includes(role)) redirect("/");

  const sp = await searchParams;
  const tab = (sp.tab as Tab) ?? "users";

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: "var(--ink)", marginBottom: 16 }}>Settings</div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--g-line)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <a
            key={t.key}
            href={`?tab=${t.key}`}
            style={{
              padding: "8px 14px",
              fontSize: 13.5,
              fontWeight: tab === t.key ? 500 : 400,
              color: tab === t.key ? "var(--nml-red)" : "var(--ink-2)",
              borderBottom: tab === t.key ? "2px solid var(--nml-red)" : "2px solid transparent",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      {tab === "users" && <UsersTab currentUserId={user.id} currentRole={role} />}
      {tab === "teams" && <TeamsTab currentRole={role} />}
      {tab === "forms" && <FormTemplatesTab currentRole={role} />}
      {tab === "onboarding" && <OnboardingTemplatesTab currentRole={role} />}
      {tab === "lookups" && <LookupsTab currentRole={role} />}
      {tab === "categories" && <CategoriesTab />}
    </div>
  );
}
