import { notFound } from "next/navigation";
import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import type { LilInvoiceRow } from "@/lib/server/lilInvoices";
import InvoiceForm from "@/app/agent/gestion/factures/InvoiceForm";

type PageProps = { params: Promise<{ id: string }> };

export default async function LilInvoiceDetailPage({ params }: PageProps) {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard><SelenCardTitle>Acces reserve</SelenCardTitle></SelenCard>
      </main>
    );
  }
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [{ data: invoice }, { data: audits }] = await Promise.all([
    admin.from("lil_invoices").select("*").eq("id", id).maybeSingle(),
    admin
      .from("external_audits")
      .select("*")
      .in("status", ["completed", "confirmed", "planned"])
      .order("audit_date", { ascending: false })
      .limit(80),
  ]);
  if (!invoice) notFound();

  return (
    <main style={s.page}>
      <Link href="/agent/gestion/factures" style={{ textDecoration: "none" }}>
        <SelenButton type="button" variant="ghost">Retour</SelenButton>
      </Link>
      <InvoiceForm
        invoice={invoice as LilInvoiceRow}
        audits={(audits ?? []) as ExternalAuditRow[]}
      />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px", display: "grid", gap: 14 },
};
