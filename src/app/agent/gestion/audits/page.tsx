import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import {
  auditDeliveryMode,
  auditStart,
  getAuditMeetLink,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
  }).format(new Date(value));
}

function metadata(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
}

function planSent(audit: ExternalAuditRow) {
  return metadata(audit).plan_audit_sent === true;
}

export default async function ExternalAuditsPage() {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard>
          <SelenCardTitle>Acces reserve</SelenCardTitle>
          <p style={s.muted}>Cette page est reservee au compte proprietaire.</p>
        </SelenCard>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("external_audits")
    .select("*")
    .order("audit_date", { ascending: true })
    .order("start_time", { ascending: true });

  const audits = (data ?? []) as ExternalAuditRow[];

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Gestion Lil</p>
          <h1 style={s.title}>Audits externes</h1>
        </div>
        <Link href="/agent/gestion/audits/new" style={{ textDecoration: "none" }}>
          <SelenButton type="button">Nouvel audit</SelenButton>
        </Link>
      </header>

      <section style={s.list}>
        {audits.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucun audit externe.</SelenCardTitle>
          </SelenCard>
        ) : (
          audits.map((audit) => (
            <Link
              key={audit.id}
              href={`/agent/gestion/audits/${audit.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <SelenCard>
                <div style={s.row}>
                  <div>
                    <SelenCardTitle>{audit.of_name}</SelenCardTitle>
                    <p style={s.muted}>
                      {audit.audit_type} - {audit.certifier || "Certificateur a confirmer"}
                    </p>
                    <p style={s.muted}>
                      {formatDate(auditStart(audit).toISOString())} a{" "}
                      {audit.start_time.slice(0, 5)}
                    </p>
                    <p style={s.muted}>
                      Type :{" "}
                      {auditDeliveryMode(audit) === "distanciel"
                        ? "Distanciel"
                        : "Presentiel"}
                      {auditDeliveryMode(audit) === "distanciel" && getAuditMeetLink(audit)
                        ? ` - Meet : ${getAuditMeetLink(audit)}`
                        : ""}
                    </p>
                    <div style={s.badges}>
                      <span style={audit.confirmation_email_sent_at ? s.badgeOk : s.badgeTodo}>
                        Confirmation {audit.confirmation_email_sent_at ? "envoyee" : "a envoyer"}
                      </span>
                      <span style={planSent(audit) ? s.badgeOk : s.badgeTodo}>
                        Plan {planSent(audit) ? "envoye" : "a envoyer"}
                      </span>
                    </div>
                  </div>
                  <strong style={s.status}>{audit.status}</strong>
                </div>
              </SelenCard>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 20,
  },
  eyebrow: {
    fontFamily: "var(--font-display)",
    fontSize: 9,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: "var(--selen-gold)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 32,
    margin: "8px 0",
    color: "var(--selen-text)",
  },
  list: { display: "grid", gap: 12 },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  status: { color: "var(--selen-gold2)", fontSize: 12 },
  badges: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 },
  badgeOk: {
    borderRadius: 999,
    border: "1px solid rgba(126, 201, 126, 0.32)",
    background: "rgba(126, 201, 126, 0.12)",
    color: "var(--selen-success)",
    padding: "4px 8px",
    fontSize: 11,
  },
  badgeTodo: {
    borderRadius: 999,
    border: "1px solid rgba(201, 148, 58, 0.32)",
    background: "rgba(201, 148, 58, 0.12)",
    color: "var(--selen-gold2)",
    padding: "4px 8px",
    fontSize: 11,
  },
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
};
