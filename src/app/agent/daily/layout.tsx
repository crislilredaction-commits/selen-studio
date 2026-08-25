import Link from "next/link";
import type { ReactNode } from "react";

export default function DailyStudioLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        style={{
          maxWidth: 1180,
          margin: "14px auto 0",
          padding: "0 28px",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <Link href="/agent/daily" style={linkStyle}>Pilotage Daily</Link>
        <Link href="/agent/daily/actions" style={actionLinkStyle}>Actions à faire</Link>
        <Link href="/agent/daily/organisations" style={linkStyle}>Organismes</Link>
        <Link href="/agent/daily/onboarding-preparation" style={linkStyle}>Préparation onboarding</Link>
        <Link href="/agent/daily/trainers/annual-follow-up" style={linkStyle}>Suivi formateurs</Link>
        <Link href="/agent/daily/session-followup" style={linkStyle}>Suivi en session</Link>
        <Link href="/agent/daily/session-dossiers" style={linkStyle}>Dossiers de session</Link>
        <Link href="/agent/daily/learners" style={linkStyle}>Apprenants</Link>
        <Link href="/agent/daily/pretraining-documents" style={linkStyle}>Documents préformation</Link>
        <Link href="/agent/daily/posttraining-documents" style={linkStyle}>Documents de fin</Link>
        <Link href="/agent/daily/communications" style={linkStyle}>Communications & preuves</Link>
        <Link href="/agent/daily/stakeholder-feedback" style={linkStyle}>Réclamations & suggestions</Link>
      </div>
      {children}
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
  padding: "7px 11px",
  background: "var(--selen-bg2)",
};

const actionLinkStyle = {
  ...linkStyle,
  color: "var(--selen-gold2)",
  borderColor: "color-mix(in srgb, var(--selen-gold) 45%, var(--selen-border))",
};
