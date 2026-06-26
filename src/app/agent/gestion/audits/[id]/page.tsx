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
  const modelEmail = buildExternalAuditConfirmationEmail(audit);
  const metadata =
    audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const draftSubject =
    typeof metadata.confirmation_email_draft_subject === "string"
      ? metadata.confirmation_email_draft_subject
      : "";
  const draftBody =
    typeof metadata.confirmation_email_draft_body === "string"
      ? metadata.confirmation_email_draft_body
      : "";
  const googleStatus = getGoogleCalendarConfigStatus();

  return (
    <main style={s.page}>
      <ExternalAuditForm audit={audit} />
      <ExternalAuditStatusPanel
        audit={audit}
        confirmationEmail={{
          to: modelEmail.to,
          subject: draftSubject || modelEmail.subject,
          bodyText: draftBody || modelEmail.bodyText,
          modelSubject: modelEmail.subject,
          modelBodyText: modelEmail.bodyText,
          hasDraft: Boolean(draftSubject || draftBody),
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
