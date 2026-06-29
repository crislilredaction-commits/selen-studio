import Link from "next/link";
import type { CSSProperties } from "react";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isLilOwner } from "@/lib/server/studioAdmin";
import { getLilInvoiceSettings } from "@/lib/server/lilInvoices";
import SettingsForm from "@/app/agent/gestion/factures/parametres/SettingsForm";

export default async function LilInvoiceSettingsPage() {
  const canAccessGestionLil = await isLilOwner();
  if (!canAccessGestionLil) {
    return (
      <main style={s.page}>
        <SelenCard><SelenCardTitle>Acces reserve</SelenCardTitle></SelenCard>
      </main>
    );
  }
  const settings = await getLilInvoiceSettings();
  return (
    <main style={s.page}>
      <Link href="/agent/gestion/factures" style={{ textDecoration: "none" }}>
        <SelenButton type="button" variant="ghost">Retour factures</SelenButton>
      </Link>
      <SettingsForm settings={settings} />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "24px 28px 48px", display: "grid", gap: 14 },
};
