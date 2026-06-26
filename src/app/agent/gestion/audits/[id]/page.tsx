import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isLilOwner } from "@/lib/server/studioAdmin";
import ExternalAuditForm from "@/app/agent/gestion/audits/ExternalAuditForm";
import ExternalAuditStatusPanel from "@/app/agent/gestion/audits/ExternalAuditStatusPanel";
import {
  getGoogleCalendarConfigStatus,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";
import { buildExternalAuditConfirmationEmail } from "@/lib/server/externalAuditEmails";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ExternalAuditDetailPage({ params }: PageProps) {
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

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("external_audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) notFound();

  const audit = data as ExternalAuditRow;
  const confirmationEmail = buildExternalAuditConfirmationEmail(audit);
  const googleStatus = getGoogleCalendarConfigStatus();

  return (
    <main style={s.page}>
      <ExternalAuditForm audit={audit} />
      <ExternalAuditStatusPanel
        audit={audit}
        confirmationEmail={{
          to: confirmationEmail.to,
          subject: confirmationEmail.subject,
          bodyText: confirmationEmail.bodyText,
        }}
        googleStatus={googleStatus}
      />
    </main>
  );
}

const s: Record<string, CSSProperties> = {
  page: {
    maxWidth: 1180,
    margin: "0 auto",
    padding: "24px 28px 48px",
    display: "grid",
    gap: 14,
  },
};
