import Link from "next/link";
import type { ReactNode } from "react";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isActiveDailyOrganisation } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
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

  if (!isDaily) {
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

  const admin = createSupabaseAdminClient();
  const [assignmentRes, profileRes, adminUserRes] = await Promise.all([
    admin
      .from("daily_organisation_assignments")
      .select("organisation_id,agent_profile_id")
      .eq("organisation_id", id)
      .maybeSingle(),
    admin
      .from("agent_profiles")
      .select("id,role,is_active")
      .eq("email", auth.email)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("selen_admin_users")
      .select("role,is_active")
      .eq("email", auth.email)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const isAdmin = adminUserRes.data?.role === "admin" || profileRes.data?.role === "admin";
  const canSelfAssign =
    !isAdmin &&
    profileRes.data?.role === "agent" &&
    Boolean(profileRes.data?.id) &&
    !assignmentRes.data;

  return (
    <>
      <div
        style={{
          maxWidth: 1220,
          margin: "18px auto 0",
          padding: "0 24px",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Link href={`/agent/daily/organisations/${id}/trainer-certification-proofs`} style={{ textDecoration: "none" }}>
          <SelenButton size="sm" variant="secondary">Justificatifs formateurs</SelenButton>
        </Link>
      </div>
      {canSelfAssign ? (
        <div
          style={{
            maxWidth: 1220,
            margin: "18px auto 0",
            padding: "0 24px",
          }}
        >
          <SelenCard>
            <SelenCardTitle>Organisme non assigné</SelenCardTitle>
            <p
              style={{
                margin: "8px 0 14px",
                color: "var(--selen-text2)",
                lineHeight: 1.55,
                fontSize: 13,
              }}
            >
              Vous pouvez prendre ce dossier en charge. L’assignation s’appliquera à
              l’ensemble de ses formations, sessions, inscriptions, adaptations,
              documents et tâches Daily.
            </p>
            <form method="post" action="/agent/api/daily/organisation-assignment">
              <input type="hidden" name="organisation_id" value={id} />
              <input type="hidden" name="agent_profile_id" value={profileRes.data?.id ?? ""} />
              <SelenButton type="submit" variant="primary">Me l’assigner</SelenButton>
            </form>
          </SelenCard>
        </div>
      ) : null}
      {children}
    </>
  );
}
