import Link from "next/link";
import type { ReactNode } from "react";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isActiveDailyOrganisation } from "@/lib/server/dailyOrganisationScope";
import SelenButton from "@/components/ui/SelenButton";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type DailyOrganisationLayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function DailyOrganisationLayout({
  children,
  params,
}: DailyOrganisationLayoutProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return children;

  const { id } = await params;
  const isDaily = await isActiveDailyOrganisation(id);

  if (isDaily) return children;

  return (
    <main
      style={{
        padding: "24px 28px 50px",
        maxWidth: 900,
        margin: "0 auto",
        color: "var(--selen-text)",
      }}
    >
      <SelenCard>
        <SelenCardTitle>Organisme hors périmètre Daily</SelenCardTitle>
        <p
          style={{
            marginTop: 10,
            color: "var(--selen-text2)",
            lineHeight: 1.6,
            fontSize: 14,
          }}
        >
          Cet organisme ne possède pas d’abonnement Selen Daily actif. Il reste
          accessible dans les autres espaces Studio correspondant à ses prestations,
          mais ne doit pas être traité depuis Daily.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link href="/agent/daily/organisations" style={{ textDecoration: "none" }}>
            <SelenButton variant="primary">Retour aux organismes Daily</SelenButton>
          </Link>
        </div>
      </SelenCard>
    </main>
  );
}
