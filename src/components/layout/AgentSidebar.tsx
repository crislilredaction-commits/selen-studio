"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  FileText,
  Star,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
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
        <line x1="5" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1" />
        <line x1="5" y1="7.5" x2="10" y2="7.5" stroke="currentColor" strokeWidth="1" />
        <line x1="5" y1="10" x2="8" y2="10" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    href: "/agent/generateur-dossiers-formation",
    label: "Générateur formation",
    ownerOnly: true,
    icon: <FileText size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/daily",
    label: "Selen Daily",
    icon: <FileText size={16} strokeWidth={1.5} />,
  },
  {
    href: "/agent/rendez-vous",
    label: "Rendez-vous",
    icon: <CalendarDays size={16} strokeWidth={1.5} />,
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
    href: "/agent/satisfaction",
    label: "Satisfaction",
    adminOnly: true,
    icon: <Star size={16} strokeWidth={1.5} />,
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
];

const navigationOrder = [
  "/agent",
  "/agent/dossiers",
  "/agent/generateur-dossiers-formation",
  "/agent/daily",
  "/agent/rendez-vous",
  "/agent/profil",
  "/agent/satisfaction",
  "/agent/articles",
  "/agent/gestion",
];

const friendlyNotes = [
  "On range le chaos avec élégance ✨",
  "Un dossier à la fois. Le monde survivra.",
  "Les cases se cochent. Les cafés refroidissent.",
  "Tout va bien. Enfin, le dashboard le prétend.",
  "Mission du jour : moins de clics, plus de contrôle.",
  "Les dossiers ne se traiteront pas seuls. Quel manque d’initiative.",
  "Qualiopi n’a qu’à bien se tenir.",
  "Aujourd’hui, on vise le propre, pas le spectaculaire.",
  "Le calme administratif existe. On enquête encore.",
  "Si tout est vert, profite. Ça ne dure jamais très longtemps.",
];

function displayNameFromEmail(email: string | null) {
  if (!email) return "Agent";
  const raw = email.split("@")[0]?.split(/[._-]/)[0]?.trim();
  if (!raw) return "Agent";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function noteForPath(pathname: string) {
  const score = Array.from(pathname).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return friendlyNotes[score % friendlyNotes.length];
}

export default function AgentSidebar() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const friendlyNote = useMemo(() => noteForPath(pathname), [pathname]);
  const userSectionActive =
    pathname.startsWith("/agent/clients") || pathname.startsWith("/agent/admin/agents");
  const [usersOpen, setUsersOpen] = useState(userSectionActive);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email?.trim().toLowerCase();

      if (!email) return;
      if (!cancelled) setEmail(email);

      const [{ data: adminUser }, { data: profile }] = await Promise.all([
        supabase
          .from("selen_admin_users")
          .select("role, is_active")
          .eq("email", email)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("agent_profiles")
          .select("role, is_active, first_name")
          .eq("email", email)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      if (!cancelled && profile?.first_name?.trim()) {
        setFirstName(profile.first_name.trim());
      }

      if (!cancelled && (adminUser?.role === "admin" || profile?.role === "admin")) {
        setRole("admin");
      }
    }

    void loadRole();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (userSectionActive) setUsersOpen(true);
  }, [userSectionActive]);

  const visibleLinks = links
    .filter((link) => {
      if ("ownerOnly" in link && link.ownerOnly) return isOwnerLil(email);
      return !("adminOnly" in link && link.adminOnly) || role === "admin";
    })
    .sort(
      (a, b) =>
        navigationOrder.indexOf(a.href) - navigationOrder.indexOf(b.href),
    );

  const userLinks = [
    {
      href: "/agent/clients",
      label: "Clients",
      icon: <UsersRound size={15} strokeWidth={1.5} />,
      visible: true,
    },
    {
      href: "/agent/admin/agents",
      label: "Accès agents",
      icon: <UserRoundCog size={15} strokeWidth={1.5} />,
      visible: role === "admin",
    },
  ].filter((link) => link.visible);

  const renderUserGroup = () => (
    <div key="users-group" style={{ marginBottom: 4 }}>
      <button
        type="button"
        onClick={() => setUsersOpen((open) => !open)}
        aria-expanded={usersOpen}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: "var(--radius-sm)",
          fontSize: 13,
          color: userSectionActive ? "var(--selen-gold2)" : "var(--selen-text2)",
          background: userSectionActive ? "var(--selen-bg3)" : "transparent",
          border: `1px solid ${
            userSectionActive ? "var(--selen-border2)" : "transparent"
          }`,
          textAlign: "left",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <UsersRound
          size={16}
          strokeWidth={1.5}
          style={{ opacity: userSectionActive ? 1 : 0.7, flexShrink: 0 }}
        />
        <span style={{ flex: 1 }}>Utilisateurs</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          style={{
            opacity: 0.65,
            transform: usersOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {usersOpen ? (
        <div
          style={{
            margin: "4px 0 8px 20px",
            paddingLeft: 10,
            borderLeft: "1px solid var(--selen-border)",
          }}
        >
          {userLinks.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: 12,
                  color: isActive ? "var(--selen-gold2)" : "var(--selen-text3)",
                  background: isActive ? "rgba(247, 239, 224, 0.06)" : "transparent",
                  textDecoration: "none",
                  marginBottom: 2,
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.72, flexShrink: 0 }}>
                  {link.icon}
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
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
          {firstName || displayNameFromEmail(email)}
        </h1>

        <p
          style={{
            fontSize: 11,
            color: "var(--selen-text3)",
            marginTop: 4,
            lineHeight: 1.4,
            maxWidth: 250,
          }}
        >
          {friendlyNote}
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
              : pathname.startsWith(link.href);

          return (
            <div key={link.href}>
              <Link
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
                {link.label}
              </Link>

              {link.href === "/agent" ? (
                <div style={{ margin: "8px 4px 12px" }}>
                  <AgentSidebarMessaging />
                </div>
              ) : null}

              {link.href === "/agent/rendez-vous" ? renderUserGroup() : null}
            </div>
          );
        })}
      </nav>

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
