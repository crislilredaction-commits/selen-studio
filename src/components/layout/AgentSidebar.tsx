"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText } from "lucide-react";
import AgentSidebarMessaging from "@/components/layout/AgentSidebarMessaging";

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
    href: "/agent/audits-blancs",
    label: "Review",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" width="16" height="16">
        <path
          d="M3 2.5h10v11H3z"
          stroke="currentColor"
          strokeWidth="1.2"
          rx="2"
        />
        <path
          d="M5 5h6"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M5 7.5h4"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
        />
        <path
          d="M5 10.5l1 1 2-2"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
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
    icon: <FileText size={16} strokeWidth={1.5} />,
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

  return (
    <aside
      className="flex h-screen flex-col"
      style={{
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

      <nav style={{ flex: 1, padding: "14px 10px" }}>
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

        {links.map((link) => {
          const isActive =
            link.href === "/agent"
              ? pathname === "/agent"
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
              {link.label}
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
