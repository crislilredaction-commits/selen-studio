import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";

function amount(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
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
  const [{ data: refunds }, { data: audits }, { data: payments }] =
    await Promise.all([
      admin
        .from("support_refund_requests")
        .select("*")
        .eq("status", "to_process")
        .order("created_at", { ascending: false })
        .limit(6),
      admin
        .from("external_audits")
        .select("*")
        .in("status", ["planned", "confirmed"])
        .order("audit_date", { ascending: true })
        .limit(6),
      admin.from("payments").select("*").limit(500),
    ]);

  const paymentRows = (payments ?? []) as Record<string, unknown>[];
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const year = now.getFullYear().toString();
  const paidRows = paymentRows.filter((row) =>
    ["paid", "succeeded", "complete", "completed"].includes(
      String(row.status ?? "").toLowerCase(),
    ),
  );
  const paymentAmount = (row: Record<string, unknown>) =>
    Number(row.amount_cents ?? row.amount_total ?? row.amount ?? 0);
  const paymentDate = (row: Record<string, unknown>) =>
    String(row.created_at ?? row.paid_at ?? "");
  const monthTotal = paidRows
    .filter((row) => paymentDate(row).startsWith(month))
    .reduce((sum, row) => sum + paymentAmount(row), 0);
  const yearTotal = paidRows
    .filter((row) => paymentDate(row).startsWith(year))
    .reduce((sum, row) => sum + paymentAmount(row), 0);

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
          <SelenCardTitle>Remboursements a traiter</SelenCardTitle>
          <p style={s.muted}>{(refunds ?? []).length} demande(s) en attente.</p>
          <Link href="/agent/support" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="ghost">
              Ouvrir le support
            </SelenButton>
          </Link>
        </SelenCard>

        <SelenCard>
          <SelenCardTitle>CA Selen</SelenCardTitle>
          {paymentRows.length > 0 ? (
            <div style={s.stats}>
              <Info label="CA du mois" value={amount(monthTotal)} />
              <Info label="CA de l'annee" value={amount(yearTotal)} />
              <Info label="Paiements" value={String(paidRows.length)} />
            </div>
          ) : (
            <p style={s.muted}>Donnees paiement a connecter.</p>
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
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 14,
  },
  stats: { display: "grid", gap: 8 },
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
};
