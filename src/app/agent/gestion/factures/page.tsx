import Link from "next/link";
import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  GOOGLE_DRIVE_INVOICE_FOLDER,
  centsToEuros,
  invoiceTypeLabel,
  type LilInvoiceRow,
} from "@/lib/server/lilInvoices";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function statusLabel(status: string) {
  if (status === "issued") return "Emise";
  if (status === "sent") return "Envoyee";
  if (status === "paid") return "Payee";
  if (status === "cancelled") return "Annulee";
  return "Brouillon";
}

export default async function LilInvoicesPage() {
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

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("lil_invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const invoices = (data ?? []) as LilInvoiceRow[];

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Gestion Lil</p>
          <h1 style={s.title}>Factures PDF</h1>
          <p style={s.subtitle}>
            Generateur interne temporaire. Cible Drive future :{" "}
            <a href={GOOGLE_DRIVE_INVOICE_FOLDER} target="_blank" rel="noreferrer" style={s.inlineLink}>
              dossier factures
            </a>
            .
          </p>
        </div>
        <div style={s.actions}>
          <Link href="/agent/gestion/factures/parametres" style={{ textDecoration: "none" }}>
            <SelenButton type="button" variant="ghost">Parametres</SelenButton>
          </Link>
          <Link href="/agent/gestion/factures/new" style={{ textDecoration: "none" }}>
            <SelenButton type="button">Nouvelle facture</SelenButton>
          </Link>
        </div>
      </header>

      <section style={s.list}>
        {invoices.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucune facture.</SelenCardTitle>
          </SelenCard>
        ) : (
          invoices.map((invoice) => (
            <SelenCard key={invoice.id}>
              <div style={s.row}>
                <div>
                  <SelenCardTitle>
                    {invoice.invoice_number || "Brouillon sans numero"}
                  </SelenCardTitle>
                  <p style={s.muted}>
                    {invoice.recipient_name} - {invoiceTypeLabel(invoice.invoice_type)}
                  </p>
                  <p style={s.muted}>
                    {formatDate(invoice.invoice_date)} - {centsToEuros(invoice.total_cents)}
                  </p>
                </div>
                <div style={s.rowActions}>
                  <span style={s.badge}>{statusLabel(invoice.status)}</span>
                  {invoice.pdf_url ? (
                    <a href={invoice.pdf_url} target="_blank" rel="noreferrer" style={s.link}>
                      PDF
                    </a>
                  ) : null}
                  <Link href={`/agent/gestion/factures/${invoice.id}`} style={s.link}>
                    Ouvrir
                  </Link>
                </div>
              </div>
            </SelenCard>
          ))
        )}
      </section>
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  header: { display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 18 },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 32, margin: "8px 0", color: "var(--selen-text)" },
  subtitle: { color: "var(--selen-text2)", fontSize: 14, lineHeight: 1.6, margin: 0 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  list: { display: "grid", gap: 12 },
  row: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  rowActions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  muted: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
  badge: { color: "var(--selen-gold2)", border: "1px solid var(--selen-border)", borderRadius: 999, padding: "4px 8px", fontSize: 11 },
  link: { color: "var(--selen-gold2)", textDecoration: "none", fontSize: 12, fontWeight: 700 },
  inlineLink: { color: "var(--selen-gold2)" },
};
