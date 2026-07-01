import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import InvoiceForm from "@/app/agent/gestion/factures/InvoiceForm";

function isArchived(audit: ExternalAuditRow) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  return metadata.archived === true || metadata.archived === "true";
}

export default async function NewLilInvoicePage() {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard><SelenCardTitle>Acces reserve</SelenCardTitle></SelenCard>
      </main>
    );
  }
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("external_audits")
    .select("*")
    .in("status", ["to_invoice", "completed", "confirmed", "planned"])
    .order("audit_date", { ascending: false })
    .limit(80);

  return (
    <main style={s.page}>
      <Link href="/agent/gestion/factures" style={{ textDecoration: "none" }}>
        <SelenButton type="button" variant="ghost">Retour</SelenButton>
      </Link>
      <InvoiceForm
        audits={((data ?? []) as ExternalAuditRow[]).filter((audit) => !isArchived(audit))}
      />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px", display: "grid", gap: 14 },
};
