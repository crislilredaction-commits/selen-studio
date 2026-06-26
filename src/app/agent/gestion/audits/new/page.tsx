import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
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
      <ExternalAuditForm />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
};
