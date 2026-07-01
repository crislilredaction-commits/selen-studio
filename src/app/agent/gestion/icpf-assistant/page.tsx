import type { CSSProperties } from "react";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { isLilOwner } from "@/lib/server/studioAdmin";
import IcpfAssistantClient from "./IcpfAssistantClient";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IcpfAssistantPage({ searchParams }: PageProps) {
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

  const params = (await searchParams) ?? {};
  const rawAuditId = params.auditId;
  const auditId = typeof rawAuditId === "string" ? rawAuditId : undefined;

  return <IcpfAssistantClient auditId={auditId} />;
}

const s: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 48px" },
  muted: { color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.5 },
};
