"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, BriefcaseBusiness, CalendarDays, FileText, Hammer, Star } from "lucide-react";
import AgentSidebarMessaging from "@/components/layout/AgentSidebarMessaging";
import { createClient } from "@/lib/supabase/client";
import { isOwnerLil } from "@/lib/ownerLil";

const links = [
  {
    href: "/agent",
    label: "Tableau de bord",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <path
          d="M2 7.5 8 2.5l6 5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4 7v6h8V7"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M6.5 13V9.5h3V13"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    href: "/agent/dossiers",
    label: "Dossiers",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <rect
          x="2"
          y="1"
          width="10"
          height="13"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <line
          x1="5"
          y1="5"
          x2="9"
          y2="5"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="5"
          y1="7.5"
          x2="10"
          y2="7.5"
          stroke="currentColor"
          strokeWidth="1"
        />
        <line
          x1="5"
          y1="10"
          x2="8"
          y2="10"
          stroke="currentColor"
          strokeWidth="1"
        />
      </svg>
    ),
  },
  {
    href: "/agent/daily",
    label: "Selen Daily",
    icon: <FileText size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/forge",
    label: "La Forge",
    icon: <Hammer size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/forge/alerts",
    label: "Alertes de La Forge",
    icon: <Bell size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/rendez-vous",
    label: "Rendez-vous",
    icon: <CalendarDays size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/satisfaction",
    label: "Satisfaction",
    adminOnly: true,
    icon: <Star size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/clients",
    label: "Clients",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <circle cx="7" cy="6" r="3.5" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M1.5 13.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/agent/articles",
    label: "Articles",
    adminOnly: true,
    icon: <FileText size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/gestion",
    label: "Gestion Lil",
    ownerOnly: true,
    icon: <BriefcaseBusiness size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/profil",
    label: "Mon profil",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M2.5 14c0-2.6 2.4-4.5 5.5-4.5s5.5 1.9 5.5 4.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    href: "/agent/admin/agents",
    adminOnly: true,
    label: "Accès agents",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <circle cx="6" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M1.5 14c0-2.4 2-4.2 4.5-4.2s4.5 1.8 4.5 4.2"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M11.5 3.5v4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M9.5 5.5h4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

export default function AgentSidebar() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [email, setEmail] = useState<string | null>(null);
  const [forgeAlertCount, setForgeAlertCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email?.trim().toLowerCase();

      if (!email) return;
      if (!cancelled) setEmail(email);

      const { data: adminUser } = await supabase
        .from("selen_admin_users")
        .select("role, is_active")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle();

      if (!cancelled && adminUser?.role === "admin") {
        setRole("admin");
        return;
      }

      const { data: profile } = await supabase
        .from("agent_profiles")
        .select("role, is_active")
        .eq("email", email)
        .eq("is_active", true)
        .maybeSingle();

      if (!cancelled && profile?.role === "admin") {
        setRole("admin");
      }

      const { count } = await supabase
        .from("forge_alerts")
        .select("id", { count: "exact", head: true })
        .or("status.eq.action_required,and(read_at.is.null,status.not.in.(resolved,archived))");
      if (!cancelled) setForgeAlertCount(count ?? 0);
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const navigationOrder = [
    "/agent",
    "/agent/dossiers",
    "/agent/daily",
    "/agent/forge",
    "/agent/forge/alerts",
    "/agent/rendez-vous",
    "/agent/clients",
    "/agent/profil",
    "/agent/admin/agents",
    "/agent/satisfaction",
    "/agent/articles",
    "/agent/gestion",
  ];
  const visibleLinks = links
    .filter((link) => {
      if ("ownerOnly" in link && link.ownerOnly) return isOwnerLil(email);
      return !("adminOnly" in link && link.adminOnly) || role === "admin";
    })
    .sort(
      (a, b) =>
        navigationOrder.indexOf(a.href) - navigationOrder.indexOf(b.href),
    );

  return (
    <aside
      className="agent-sidebar flex h-screen flex-col"
      style={{
        ...({
          "--selen-text": "var(--selen-text-oncard)",
          "--selen-text2": "var(--selen-text2-oncard)",
          "--selen-text3": "var(--selen-text3-oncard)",
          "--selen-bg3": "rgba(247, 239, 224, 0.08)",
          "--selen-border": "rgba(245, 208, 138, 0.18)",
          "--selen-border2": "rgba(245, 208, 138, 0.34)",
        } as React.CSSProperties),
        width: 320,
        background: "var(--selen-sidebar)",
        borderRight: "1px solid var(--selen-border)",
        minHeight: "100vh",
        flexShrink: 0,
        position: "sticky",
        top: 0,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 1,
          height: "100%",
          background:
            "linear-gradient(to bottom, transparent, var(--selen-gold) 30%, var(--selen-gold) 70%, transparent)",
          opacity: 0.2,
        }}
      />

      <div
        style={{
          padding: "24px 20px 18px",
          borderBottom: "1px solid var(--selen-border)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 9,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "var(--selen-gold)",
            opacity: 0.75,
          }}
        >
          Selen Studio
        </p>

        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 18,
            fontWeight: 600,
            color: "var(--selen-text)",
            marginTop: 6,
            letterSpacing: "0.05em",
          }}
        >
          Agent
        </h1>

        <p
          style={{
            fontSize: 11,
            color: "var(--selen-text3)",
            marginTop: 4,
            lineHeight: 1.4,
          }}
        >
          Belle journée :)
        </p>
      </div>

      <nav className="agent-sidebar__nav" style={{ flex: 1, padding: "14px 10px" }}>
        <p
          style={{
            fontSize: 9,
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--selen-text3)",
            padding: "10px 8px 6px",
          }}
        >
          Navigation
        </p>

        {visibleLinks.map((link) => {
          const isActive =
            link.href === "/agent"
              ? pathname === "/agent"
              : link.href === "/agent/forge"
                ? pathname === "/agent/forge" || pathname.startsWith("/agent/forge/cody")
                : pathname.startsWith(link.href);

          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                color: isActive ? "var(--selen-gold2)" : "var(--selen-text2)",
                background: isActive ? "var(--selen-bg3)" : "transparent",
                border: `1px solid ${
                  isActive ? "var(--selen-border2)" : "transparent"
                }`,
                marginBottom: 4,
                textDecoration: "none",
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>
                {link.icon}
              </span>
              <span style={{ flex: 1 }}>{link.label}</span>
              {link.href === "/agent/forge/alerts" && forgeAlertCount > 0 ? (
                <span
                  aria-label={`${forgeAlertCount} alertes de La Forge à voir`}
                  style={{
                    display: "grid",
                    minWidth: 22,
                    height: 22,
                    placeItems: "center",
                    borderRadius: 999,
                    background: "var(--selen-gold)",
                    color: "#21170f",
                    fontSize: 10,
                    fontWeight: 800,
                  }}
                >
                  {forgeAlertCount > 99 ? "99+" : forgeAlertCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "0 14px 14px" }}>
        <AgentSidebarMessaging />
      </div>

      <div
        style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--selen-border)",
          fontSize: 10,
          color: "var(--selen-text3)",
        }}
      >
        Version V0 · Studio Selen
      </div>
    </aside>
  );
}
