"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserRole } from "@/lib/database.types";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: UserRole[];
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/",            label: "Dashboard",   icon: "⊞" },
  { href: "/leads",       label: "Leads",        icon: "⬇", roles: ["admin","acq_manager","acq_specialist"] },
  { href: "/merchants",   label: "Merchants",    icon: "🏪" },
  { href: "/pipeline",    label: "Pipeline",     icon: "≡", roles: ["admin","acq_manager","acq_specialist"] },
  { href: "/onboarding",  label: "Onboarding",   icon: "✓", roles: ["admin","acq_manager","account_manager"] },
  { href: "/products",    label: "Products",     icon: "📦", roles: ["admin","acq_manager","account_manager","catalog_ops"] },
  { href: "/faq",         label: "FAQ",           icon: "?" },
  { href: "/settings",    label: "Settings",     icon: "⚙", roles: ["admin"] },
];

interface Props {
  role: UserRole;
  collapsed?: boolean;
  onToggle?: () => void;
  leadCount?: number;
  productCount?: number;
}

export default function Sidebar({ role, collapsed = false, onToggle, leadCount, productCount }: Props) {
  const pathname = usePathname();

  const visible = NAV_ITEMS.filter(item => !item.roles || item.roles.includes(role));

  const badges: Record<string, number | undefined> = {
    "/leads":    leadCount,
    "/products": productCount,
  };

  return (
    <nav
      style={{
        width: collapsed ? 64 : 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        padding: "14px 8px",
        transition: "width 0.2s",
      }}
    >
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "2px 6px", marginBottom: 18 }}>
        <div style={{ width: 28, height: 28, borderRadius: 9, background: "var(--nml-red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, flexShrink: 0 }}>N</div>
        {!collapsed && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)" }}>NML CRM</span>}
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {visible.map(item => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const badge = badges[item.href];
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 10px",
                  borderRadius: 11,
                  color: active ? "var(--ink)" : "var(--ink-2)",
                  background: active ? "rgba(255,255,255,.85)" : "transparent",
                  border: active ? "1px solid rgba(255,255,255,.9)" : "1px solid transparent",
                  boxShadow: active ? "0 3px 10px rgba(40,60,110,.08)" : "none",
                  fontSize: 13,
                  transition: "background 0.1s",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 15, color: active ? "var(--nml-red)" : "var(--ink-3)", flexShrink: 0, fontFamily: "system-ui" }}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {badge != null && badge > 0 && (
                      <span style={{ fontSize: 10.5, background: active ? "var(--nml-red)" : "var(--blue)", color: "#fff", borderRadius: 99, padding: "1px 6px", fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                        {badge}
                      </span>
                    )}
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{ background: "none", border: "none", cursor: "pointer", padding: "8px 10px", borderRadius: 11, color: "var(--ink-3)", fontSize: 16, textAlign: "start", marginTop: 8 }}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? "→" : "←"}
      </button>
    </nav>
  );
}
