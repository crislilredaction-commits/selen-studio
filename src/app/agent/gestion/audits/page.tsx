import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import {
  auditDeliveryMode,
  auditStart,
  getExternalAuditMonthlyStats,
  getAuditMeetLink,
  type ExternalAuditMonthlyStats,
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

function isArchived(audit: ExternalAuditRow) {
  const meta = metadata(audit);
  return meta.archived === true || meta.archived === "true";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: "Planifie",
    confirmed: "Confirme",
    completed: "Termine",
    to_invoice: "A facturer",
    cancelled: "Annule",
  };
  return labels[status] ?? status;
}

function formatAverage(value: number | null) {
  if (value === null) return "Donnees insuffisantes";
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatShare(count: number, total: number) {
  if (total <= 0) return "0";
  const percent = Math.round((count / total) * 100);
  return `${count} (${percent} %)`;
}

type ExternalAuditsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExternalAuditsPage({
  searchParams,
}: ExternalAuditsPageProps) {
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
  const params = (await searchParams) ?? {};
  const archivesParam = params.archives;
  const showArchives =
    archivesParam === "1" ||
    archivesParam === "true" ||
    (Array.isArray(archivesParam) && archivesParam.includes("1"));
  const [{ data }, monthlyStats] = await Promise.all([
    admin
      .from("external_audits")
      .select("*")
      .order("audit_date", { ascending: true })
      .order("start_time", { ascending: true }),
    getExternalAuditMonthlyStats(),
  ]);

  const audits = (data ?? []) as ExternalAuditRow[];
  const visibleAudits = showArchives
    ? audits.filter(isArchived)
    : audits.filter((audit) => !isArchived(audit));

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Gestion Lil</p>
          <h1 style={s.title}>Audits externes</h1>
        </div>
        <div style={s.headerActions}>
          <Link href="/agent/gestion/icpf-assistant" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="secondary">
              Assistant grille ICPF
            </SelenButton>
          </Link>
          <Link
            href={showArchives ? "/agent/gestion/audits" : "/agent/gestion/audits?archives=1"}
            style={{ textDecoration: "none" }}
          >
            <SelenButton type="button" variant="ghost">
              {showArchives ? "Voir actifs" : "Archives"}
            </SelenButton>
          </Link>
          <Link href="/agent/gestion/audits/new" style={{ textDecoration: "none" }}>
            <SelenButton type="button">Nouvel audit</SelenButton>
          </Link>
        </div>
      </header>

      <MonthlyStatsBlock stats={monthlyStats} />

      <section style={s.list}>
        {visibleAudits.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>
              {showArchives ? "Aucune archive audit." : "Aucun audit externe actif."}
            </SelenCardTitle>
          </SelenCard>
        ) : (
          visibleAudits.map((audit) => (
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
                  <strong style={s.status}>{statusLabel(audit.status)}</strong>
                </div>
              </SelenCard>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}

function MonthlyStatsBlock({ stats }: { stats: ExternalAuditMonthlyStats }) {
  const currentMonthTotal = stats.currentMonthCount;
  return (
    <SelenCard style={{ marginBottom: 14 }}>
      <div style={s.statsHead}>
        <div>
          <SelenCardTitle style={{ marginBottom: 4 }}>Suivi mensuel</SelenCardTitle>
          <p style={s.muted}>
            Activite audits externes hors audits annules, comptee selon la date
            d'audit.
          </p>
        </div>
        <span style={s.meta}>{stats.currentMonthLabel}</span>
      </div>
      <div style={s.kpiGrid}>
        <StatCard label={stats.currentMonthLabel} value={String(stats.currentMonthCount)} />
        <StatCard label={stats.previousMonthLabel} value={String(stats.previousMonthCount)} />
        <StatCard label="Moyenne 3 mois" value={formatAverage(stats.average3Months)} />
        <StatCard label="Moyenne 12 mois" value={formatAverage(stats.average12Months)} />
        <StatCard label="Total annee en cours" value={String(stats.yearTotal)} />
      </div>
      <div style={s.splitGrid}>
        <div style={s.splitBox}>
          <strong>Presentiel / distanciel</strong>
          <span>
            Presentiel : {formatShare(stats.deliveryModeCurrentMonth.presentiel, currentMonthTotal)}
          </span>
          <span>
            Distanciel : {formatShare(stats.deliveryModeCurrentMonth.distanciel, currentMonthTotal)}
          </span>
        </div>
        <div style={s.splitBox}>
          <strong>Donneurs d'ordre</strong>
          <span>
            Certifopac : {formatShare(stats.orderGiverCurrentMonth.certifopac, currentMonthTotal)}
          </span>
          <span>
            ICPF : {formatShare(stats.orderGiverCurrentMonth.icpf, currentMonthTotal)}
          </span>
          <span>
            Autre : {formatShare(stats.orderGiverCurrentMonth.other, currentMonthTotal)}
          </span>
        </div>
      </div>
    </SelenCard>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  headerActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
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
  statsHead: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  meta: {
    color: "var(--selen-gold2)",
    fontSize: 12,
    fontWeight: 700,
    textTransform: "capitalize",
  },
  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  kpi: {
    display: "grid",
    gap: 4,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    minWidth: 0,
  },
  splitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
  },
  splitBox: {
    display: "grid",
    gap: 5,
    padding: 12,
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(201, 148, 58, 0.24)",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
    lineHeight: 1.5,
  },
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
