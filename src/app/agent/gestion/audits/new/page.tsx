import type { CSSProperties } from "react";
import Link from "next/link";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { isLilOwner } from "@/lib/server/studioAdmin";
import ExternalAuditForm from "@/app/agent/gestion/audits/ExternalAuditForm";

export default async function NewExternalAuditPage() {
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

  return (
    <main style={s.page}>
      <div style={s.backRow}>
        <Link href="/agent/gestion/audits" style={{ textDecoration: "none" }}>
          <SelenButton type="button" variant="ghost">
            ← Retour aux audits
          </SelenButton>
        </Link>
      </div>
      <ExternalAuditForm />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  backRow: { marginBottom: 14 },
};
