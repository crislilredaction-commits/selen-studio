import Link from "next/link";
import type { ReactNode } from "react";
import DailyAutoRefresh from "@/components/agent/DailyAutoRefresh";

export default function DailyStudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DailyAutoRefresh intervalMs={45_000} />
      <nav
        className="daily-subnav"
        aria-label="Navigation Selen Daily"
        style={{
          maxWidth: 1180,
          margin: "14px auto 0",
          padding: "0 28px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Link href="/agent/daily" style={linkStyle}>
          Pilotage Daily
        </Link>
        <Link href="/agent/daily/planning" style={linkStyle}>
          Planning sessions
        </Link>
        <Link href="/agent/daily/organisations" style={linkStyle}>
          Organismes
        </Link>
        <Link href="/agent/daily/preaudit" style={linkStyle}>
          Pré-audit
        </Link>
        <Link href="/agent/daily/veille-proposee" style={priorityLinkStyle}>
          Propositions de veille
        </Link>
        <Link href="/agent/daily/qualite" style={linkStyle}>
          Veille & Qualité
        </Link>
      </nav>
      <div className="daily-content">{children}</div>
    </>
  );
}

const linkStyle = {
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--selen-text2)",
  border: "1px solid var(--selen-border)",
  borderRadius: 999,
  padding: "8px 12px",
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  boxSizing: "border-box" as const,
  background: "var(--selen-bg2)",
  whiteSpace: "nowrap" as const,
};

const priorityLinkStyle = {
  ...linkStyle,
  color: "var(--selen-gold2)",
  border: "1px solid var(--selen-border2)",
};
