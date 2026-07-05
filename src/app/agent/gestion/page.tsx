import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import ExpenseForm from "./ExpenseForm";

type Row = Record<string, unknown>;

function amount(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function cents(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function dateText(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function isPaid(row: Row) {
  return ["paid", "succeeded", "complete", "completed"].includes(
    String(row.status ?? "").toLowerCase(),
  );
}

function isInMonth(value: string, month: string) {
  return value.startsWith(month);
}

function isInYear(value: string, year: string) {
  return value.startsWith(year);
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

function daysUntil(audit: ExternalAuditRow) {
  const start = new Date(`${audit.audit_date}T${audit.start_time}`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((start - today.getTime()) / (24 * 60 * 60 * 1000));
}

function formatAuditDate(audit: ExternalAuditRow) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(`${audit.audit_date}T${audit.start_time}`));
}

export default async function GestionLilPage() {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard>
          <SelenCardTitle>Acces reserve</SelenCardTitle>
          <p style={s.muted}>La Gestion Lil est reservee au compte proprietaire.</p>
        </SelenCard>
      </main>
    );
  }

  const admin = createSupabaseAdminClient();
  const [
    { data: refunds },
    { data: audits },
    { data: payments },
    { data: expenses },
  ] = await Promise.all([
    admin
      .from("support_refund_requests")
      .select("*")
      .in("status", ["to_process", "processed"])
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("external_audits")
      .select("*")
      .order("audit_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(80),
    admin.from("selen_payments").select("*").limit(1000),
    admin
      .from("selen_expenses")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(12),
  ]);

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const year = now.getFullYear().toString();
  const paymentRows = ((payments ?? []) as Row[]).filter(isPaid);
  const expenseRows = (expenses ?? []) as Row[];
  const refundRows = (refunds ?? []) as Row[];
  const auditRows = (audits ?? []) as ExternalAuditRow[];
  const activeAudits = auditRows.filter((audit) =>
    ["planned", "confirmed"].includes(audit.status) && !isArchived(audit),
  );
  const upcomingAudits = activeAudits.filter((audit) => daysUntil(audit) >= 0);
  const planAlerts = upcomingAudits.filter((audit) => {
    const days = daysUntil(audit);
    return days >= 0 && days < 10 && !planSent(audit);
  });
  const plansToSend = activeAudits.filter((audit) => !planSent(audit));
  const paymentAmount = (row: Row) =>
    cents(row, ["amount_cents", "amount_total", "amount"]);
  const paymentDate = (row: Row) => dateText(row, ["paid_at", "created_at"]);
  const expenseAmount = (row: Row) => cents(row, ["amount_cents"]);
  const expenseDate = (row: Row) => dateText(row, ["expense_date", "created_at"]);
  const refundAmount = (row: Row) =>
    cents(row, ["amount_cents", "refund_amount_cents", "amount"]);

  const monthPayments = paymentRows.filter((row) => isInMonth(paymentDate(row), month));
  const yearPayments = paymentRows.filter((row) => isInYear(paymentDate(row), year));
  const monthExpenses = expenseRows.filter((row) => isInMonth(expenseDate(row), month));
  const yearExpenses = expenseRows.filter((row) => isInYear(expenseDate(row), year));
  const monthTotal = monthPayments.reduce((sum, row) => sum + paymentAmount(row), 0);
  const yearTotal = yearPayments.reduce((sum, row) => sum + paymentAmount(row), 0);
  const monthExpenseTotal = monthExpenses.reduce(
    (sum, row) => sum + expenseAmount(row),
    0,
  );
  const yearExpenseTotal = yearExpenses.reduce(
    (sum, row) => sum + expenseAmount(row),
    0,
  );
  const refundsToProcess = refundRows
    .filter((row) => String(row.status ?? "") === "to_process")
    .reduce((sum, row) => sum + refundAmount(row), 0);
  const refundsProcessed = refundRows
    .filter((row) => String(row.status ?? "") === "processed")
    .reduce((sum, row) => sum + refundAmount(row), 0);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Admin prive</p>
          <h1 style={s.title}>Gestion Lil</h1>
          <p style={s.subtitle}>
            Pilotage compact des audits externes, du CA, des charges et du SAV admin.
          </p>
        </div>
        <div style={s.headerActions}>
          <Link href="/agent/gestion/factures" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="ghost">Factures</SelenButton>
          </Link>
          <Link href="/agent/gestion/audits/new" style={{ textDecoration: "none" }}>
            <SelenButton type="button">Nouvel audit</SelenButton>
          </Link>
        </div>
      </header>

      <section style={s.kpis}>
        <Kpi label="CA mois" value={amount(monthTotal)} />
        <Kpi label="Net mois" value={amount(monthTotal - monthExpenseTotal)} />
        <Kpi label="Audits a venir" value={String(upcomingAudits.length)} />
        <Kpi label="Plans a envoyer" value={String(plansToSend.length)} />
        <Kpi label="Remboursements" value={amount(refundsToProcess)} />
      </section>

      {planAlerts.length > 0 ? (
        <SelenCard>
          <SelenCardTitle>Plans d&apos;audit urgents</SelenCardTitle>
          <p style={s.muted}>
            Audits dans moins de 10 jours avec plan d&apos;audit non envoye.
          </p>
          <div style={s.list}>
            {planAlerts.slice(0, 5).map((audit) => (
              <MiniAudit key={audit.id} audit={audit} />
            ))}
          </div>
        </SelenCard>
      ) : null}

      <section style={s.sections}>
        <SelenCard>
          <div style={s.cardHead}>
            <SelenCardTitle>CA Selen</SelenCardTitle>
            <span style={s.meta}>{year}</span>
          </div>
          <div style={s.compactGrid}>
            <Info label="CA du mois" value={amount(monthTotal)} />
            <Info label="CA de l&apos;annee" value={amount(yearTotal)} />
            <Info label="Paiements mois" value={String(monthPayments.length)} />
            <Info label="Paiements annee" value={String(yearPayments.length)} />
            <Info label="Net mois" value={amount(monthTotal - monthExpenseTotal)} />
            <Info label="Net annee" value={amount(yearTotal - yearExpenseTotal)} />
          </div>
          {paymentRows.length === 0 ? (
            <p style={s.mutedSmall}>
              Donnees paiement pretes, a alimenter par webhook Stripe via selen_payments.
            </p>
          ) : null}
        </SelenCard>

        <SelenCard>
          <div style={s.cardHead}>
            <SelenCardTitle>Charges</SelenCardTitle>
            <span style={s.meta}>{amount(monthExpenseTotal)} ce mois</span>
          </div>
          <ExpenseForm />
          <div style={s.expenseList}>
            {expenseRows.slice(0, 5).map((row) => (
              <div key={String(row.id)} style={s.expenseItem}>
                <span>{String(row.label ?? "Charge")}</span>
                <strong>{amount(expenseAmount(row))}</strong>
              </div>
            ))}
          </div>
        </SelenCard>

        <SelenCard>
          <div style={s.cardHead}>
            <SelenCardTitle>Remboursements</SelenCardTitle>
            <Link href="/agent/support" style={s.link}>
              Support
            </Link>
          </div>
          <div style={s.compactGrid}>
            <Info label="A traiter" value={amount(refundsToProcess)} />
            <Info label="Effectues" value={amount(refundsProcessed)} />
          </div>
        </SelenCard>

        <SelenCard>
          <div style={s.cardHead}>
            <SelenCardTitle>Audits externes</SelenCardTitle>
            <Link href="/agent/gestion/audits" style={s.link}>
              Tout voir
            </Link>
          </div>
          <div style={s.list}>
            {upcomingAudits.slice(0, 5).map((audit) => (
              <MiniAudit key={audit.id} audit={audit} />
            ))}
            {upcomingAudits.length === 0 ? (
              <p style={s.muted}>Aucun audit a venir.</p>
            ) : null}
          </div>
        </SelenCard>

        <SelenCard>
          <div style={s.cardHead}>
          <SelenCardTitle>Plans d&apos;audit a envoyer</SelenCardTitle>
            <span style={s.meta}>{plansToSend.length}</span>
          </div>
          <div style={s.list}>
            {plansToSend.slice(0, 6).map((audit) => (
              <MiniAudit key={audit.id} audit={audit} />
            ))}
            {plansToSend.length === 0 ? (
              <p style={s.muted}>Tous les plans d&apos;audit actifs sont marques envoyes.</p>
            ) : null}
          </div>
        </SelenCard>
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.kpi}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function MiniAudit({ audit }: { audit: ExternalAuditRow }) {
  return (
    <Link href={`/agent/gestion/audits/${audit.id}`} style={s.auditRow}>
      <span>
        <strong>{audit.of_name}</strong>
        <small>
          {formatAuditDate(audit)} - {audit.audit_type}
        </small>
      </span>
      <span style={planSent(audit) ? s.badgeOk : s.badgeTodo}>
        Plan {planSent(audit) ? "envoye" : "a envoyer"}
      </span>
    </Link>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
    flexWrap: "wrap",
    marginBottom: 18,
  },
  headerActions: { display: "flex", gap: 8, flexWrap: "wrap" },
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
  subtitle: { color: "var(--selen-text2)", fontSize: 14, lineHeight: 1.6 },
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  kpi: {
    display: "grid",
    gap: 4,
    padding: "12px 14px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "var(--selen-card-texture), var(--selen-card)",
    color: "var(--selen-text2-oncard)",
    fontSize: 12,
  },
  sections: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 14,
    marginTop: 14,
  },
  cardHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  compactGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: 8,
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
  },
  list: { display: "grid", gap: 8 },
  auditRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text2-oncard)",
    textDecoration: "none",
    fontSize: 13,
  },
  badgeOk: {
    whiteSpace: "nowrap",
    color: "var(--selen-success)",
    fontSize: 11,
  },
  badgeTodo: {
    whiteSpace: "nowrap",
    color: "var(--selen-gold2)",
    fontSize: 11,
  },
  expenseList: { display: "grid", gap: 8, marginTop: 12 },
  expenseItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text2-oncard)",
  },
  meta: { color: "var(--selen-text3-oncard)", fontSize: 12 },
  link: { color: "var(--selen-gold2)", fontSize: 12, textDecoration: "none" },
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
  mutedSmall: {
    color: "var(--selen-text3-oncard)",
    fontSize: 12,
    lineHeight: 1.5,
    margin: "10px 0 0",
  },
};
