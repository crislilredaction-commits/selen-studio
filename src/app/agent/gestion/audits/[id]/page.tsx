import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import ExternalAuditForm from "@/app/agent/gestion/audits/ExternalAuditForm";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ExternalAuditDetailPage({ params }: PageProps) {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard>
          <SelenCardTitle>Acces reserve</SelenCardTitle>
        </SelenCard>
      </main>
    );
  }

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("external_audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const audit = data as ExternalAuditRow;

  return (
    <main style={s.page}>
      <ExternalAuditForm audit={audit} />
      <SelenCard>
        <SelenCardTitle>Suivi</SelenCardTitle>
        <div style={s.grid}>
          <Info label="Email confirmation" value={audit.confirmation_email_sent_at || "-"} />
          <Info label="Rappel Lil" value={audit.reminder_email_sent_at || "-"} />
          <Info label="Google event" value={audit.google_calendar_event_id || "-"} />
        </div>
      </SelenCard>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.info}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "24px 28px 48px",
    display: "grid",
    gap: 14,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 10,
  },
  info: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    overflowWrap: "anywhere",
  },
};
