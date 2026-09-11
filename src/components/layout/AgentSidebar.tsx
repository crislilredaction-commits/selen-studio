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
  UserRound,
  UserRoundCog,
  UsersRound,
} from "lucide-react";
import AgentSidebarMessaging from "@/components/layout/AgentSidebarMessaging";
import { createClient } from "@/lib/supabase/client";
import { isOwnerLil } from "@/lib/ownerLil";

const links = [
  { href: "/agent", label: "Tableau de bord", icon: <FileText size={16} strokeWidth={1.5} /> },
  { href: "/agent/dossiers", label: "Dossiers", icon: <FileText size={16} strokeWidth={1.5} /> },
  { href: "/agent/daily", label: "Selen Daily", icon: <FileText size={16} strokeWidth={1.5} /> },
  { href: "/agent/rendez-vous", label: "Rendez-vous", icon: <CalendarDays size={16} strokeWidth={1.5} /> },
  { href: "/agent/satisfaction", label: "Satisfaction", adminOnly: true, icon: <Star size={16} strokeWidth={1.5} /> },
  { href: "/agent/articles", label: "Articles", adminOnly: true, icon: <FileText size={16} strokeWidth={1.5} /> },
  { href: "/agent/gestion", label: "Gestion Lil", ownerOnly: true, icon: <BriefcaseBusiness size={16} strokeWidth={1.5} /> },
];

const navigationOrder = [
  "/agent",
  "/agent/dossiers",
  "/agent/daily",
  "/agent/rendez-vous",
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
  const [profileOpen, setProfileOpen] = useState(pathname.startsWith("/agent/profil"));
  const friendlyNote = useMemo(() => noteForPath(pathname), [pathname]);
  const userSectionActive = pathname.startsWith("/agent/clients") || pathname.startsWith("/agent/admin/agents");
  const [usersOpen, setUsersOpen] = useState(userSectionActive);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      const { data: authData } = await supabase.auth.getUser();
      const normalizedEmail = authData.user?.email?.trim().toLowerCase();
      if (!normalizedEmail) return;
      if (!cancelled) setEmail(normalizedEmail);

      const [{ data: adminUser }, { data: profile }] = await Promise.all([
        supabase
          .from("selen_admin_users")
          .select("role, is_active")
          .eq("email", normalizedEmail)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("agent_profiles")
          .select("role, is_active, first_name")
          .eq("email", normalizedEmail)
          .eq("is_active", true)
          .maybeSingle(),
      ]);

      if (!cancelled && profile?.first_name?.trim()) setFirstName(profile.first_name.trim());
      if (!cancelled && (adminUser?.role === "admin" || profile?.role === "admin")) setRole("admin");
    }

    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (userSectionActive) setUsersOpen(true);
    if (pathname.startsWith("/agent/profil")) setProfileOpen(true);
  }, [pathname, userSectionActive]);

  const visibleLinks = links
    .filter((link) => {
      if ("ownerOnly" in link && link.ownerOnly) return isOwnerLil(email);
      return !("adminOnly" in link && link.adminOnly) || role === "admin";
    })
    .sort((a, b) => navigationOrder.indexOf(a.href) - navigationOrder.indexOf(b.href));

  const userLinks = [
    { href: "/agent/clients", label: "Clients", icon: <UsersRound size={15} strokeWidth={1.5} />, visible: true },
    { href: "/agent/admin/agents", label: "Accès agents", icon: <UserRoundCog size={15} strokeWidth={1.5} />, visible: role === "admin" },
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
          border: `1px solid ${userSectionActive ? "var(--selen-border2)" : "transparent"}`,
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <UsersRound size={16} strokeWidth={1.5} style={{ opacity: userSectionActive ? 1 : 0.7, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Utilisateurs</span>
        <ChevronDown size={14} strokeWidth={1.5} style={{ opacity: 0.65, transform: usersOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
      </button>
      {usersOpen ? (
        <div style={{ margin: "4px 0 8px 20px", paddingLeft: 10, borderLeft: "1px solid var(--selen-border)" }}>
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
                <span style={{ opacity: isActive ? 1 : 0.72, flexShrink: 0 }}>{link.icon}</span>
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
          background: "linear-gradient(to bottom, transparent, var(--selen-gold) 30%, var(--selen-gold) 70%, transparent)",
          opacity: 0.2,
        }}
      />

      <div style={{ padding: "24px 20px 18px", borderBottom: "1px solid var(--selen-border)", position: "relative" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)", opacity: 0.75 }}>
          Selen Studio
        </p>
        <button
          type="button"
          aria-expanded={profileOpen}
          aria-label="Ouvrir le menu utilisateur"
          onClick={() => setProfileOpen((open) => !open)}
          style={{
            marginTop: 6,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "var(--selen-text)",
            display: "flex",
            alignItems: "center",
            gap: 7,
            cursor: "pointer",
          }}
        >
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, letterSpacing: "0.05em" }}>
            {firstName || displayNameFromEmail(email)}
          </span>
          <ChevronDown size={15} strokeWidth={1.5} style={{ transform: profileOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
        </button>

        {profileOpen ? (
          <div
            data-user-menu
            style={{
              marginTop: 8,
              border: "1px solid var(--selen-border)",
              background: "rgba(10, 18, 25, 0.28)",
              borderRadius: "var(--radius-sm)",
              padding: 4,
            }}
          >
            <Link
              href="/agent/profil"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: "var(--radius-sm)",
                color: pathname.startsWith("/agent/profil") ? "var(--selen-gold2)" : "var(--selen-text2)",
                background: pathname.startsWith("/agent/profil") ? "var(--selen-bg3)" : "transparent",
                fontSize: 12,
                textDecoration: "none",
              }}
            >
              <UserRound size={15} strokeWidth={1.5} />
              Mon profil
            </Link>
          </div>
        ) : null}

        <p style={{ fontSize: 11, color: "var(--selen-text3)", marginTop: 8, lineHeight: 1.4, maxWidth: 250 }}>
          {friendlyNote}
        </p>
      </div>

      <nav className="agent-sidebar__nav" style={{ flex: 1, padding: "14px 10px" }}>
        <p style={{ fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--selen-text3)", padding: "10px 8px 6px" }}>
          Navigation
        </p>
        {visibleLinks.map((link) => {
          const isActive = link.href === "/agent" ? pathname === "/agent" : pathname.startsWith(link.href);
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
                  border: `1px solid ${isActive ? "var(--selen-border2)" : "transparent"}`,
                  marginBottom: 4,
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
              >
                <span style={{ opacity: isActive ? 1 : 0.7, flexShrink: 0 }}>{link.icon}</span>
                {link.label}
              </Link>
              {link.href === "/agent" ? <div style={{ margin: "8px 4px 12px" }}><AgentSidebarMessaging /></div> : null}
              {link.href === "/agent/rendez-vous" ? renderUserGroup() : null}
            </div>
          );
        })}
      </nav>

      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--selen-border)", fontSize: 10, color: "var(--selen-text3)" }}>
        Version V0 · Studio Selen
      </div>
    </aside>
  );
}
