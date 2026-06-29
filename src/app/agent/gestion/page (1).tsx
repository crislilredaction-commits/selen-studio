import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
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
      .in("status", ["planned", "confirmed"])
      .order("audit_date", { ascending: true })
      .limit(6),
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
  const paymentAmount = (row: Row) =>
    cents(row, ["amount_cents", "amount_total", "amount"]);
  const paymentDate = (row: Row) =>
    dateText(row, ["paid_at", "created_at"]);
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
            Audits externes, suivi SAV admin et indicateurs de pilotage.
          </p>
        </div>
      </header>

      <section style={s.grid}>
        <SelenCard>
          <SelenCardTitle>Audits externes</SelenCardTitle>
          <p style={s.muted}>{(audits ?? []).length} audit(s) a venir.</p>
          <Link href="/agent/gestion/audits" style={{ textDecoration: "none" }}>
            <SelenButton type="button">Ouvrir les audits</SelenButton>
          </Link>
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Remboursements admin</SelenCardTitle>
          <div style={s.stats}>
            <Info label="A traiter" value={amount(refundsToProcess)} />
            <Info label="Effectues" value={amount(refundsProcessed)} />
          </div>
          <Link href="/agent/support" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="ghost">
              Ouvrir le support
            </SelenButton>
          </Link>
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>CA Selen</SelenCardTitle>
          <div style={s.stats}>
            <Info label="CA du mois" value={amount(monthTotal)} />
            <Info label="CA de l'annee" value={amount(yearTotal)} />
            <Info label="Paiements du mois" value={String(monthPayments.length)} />
            <Info label="Paiements de l'annee" value={String(yearPayments.length)} />
            <Info label="Charges du mois" value={amount(monthExpenseTotal)} />
            <Info label="Charges de l'annee" value={amount(yearExpenseTotal)} />
            <Info label="Net indicatif mois" value={amount(monthTotal - monthExpenseTotal)} />
            <Info label="Net indicatif annee" value={amount(yearTotal - yearExpenseTotal)} />
          </div>
          {paymentRows.length === 0 ? (
            <p style={s.mutedSmall}>
              Donnees paiement pretes, a alimenter par webhook Stripe via
              selen_payments.
            </p>
          ) : null}
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Nouvelle charge Selen</SelenCardTitle>
          <ExpenseForm />
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Dernieres charges</SelenCardTitle>
          {expenseRows.length > 0 ? (
            <div style={s.expenseList}>
              {expenseRows.map((row) => (
                <div key={String(row.id)} style={s.expenseItem}>
                  <div>
                    <strong>{String(row.label ?? "Charge")}</strong>
                    <span>
                      {[String(row.category ?? ""), String(row.expense_date ?? "")]
                        .filter(Boolean)
                        .join(" - ")}
                    </span>
                  </div>
                  <b>{amount(expenseAmount(row))}</b>
                </div>
              ))}
            </div>
          ) : (
            <p style={s.muted}>Aucune charge saisie pour le moment.</p>
          )}
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>Facturation externe</SelenCardTitle>
          <p style={s.muted}>
            La facturation sera reliee a un outil externe conforme.
          </p>
        </SelenCard>
      </section>
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
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  header: { marginBottom: 20 },
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 14,
  },
  stats: { display: "grid", gap: 8, marginBottom: 12 },
  info: {
    display: "grid",
    gap: 4,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    background: "rgba(247, 239, 224, 0.06)",
    color: "var(--selen-text2-oncard)",
  },
  muted: { color: "var(--selen-text2-oncard)", fontSize: 13, lineHeight: 1.6 },
  mutedSmall: {
    color: "var(--selen-text3-oncard)",
    fontSize: 12,
    lineHeight: 1.5,
    margin: 0,
  },
  expenseList: { display: "grid", gap: 8 },
  expenseItem: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: 10,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--selen-border)",
    color: "var(--selen-text2-oncard)",
  },
};
