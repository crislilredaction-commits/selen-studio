import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

const documentLabels: Record<string, string> = {
  training_program: "Programme de formation",
  training_agreement: "Convention de formation",
  convocation: "Convocation",
  registration_positioning: "Inscription et positionnement",
  attendance_summary: "Relevé des présences",
  completion_certificate: "Certificat de réalisation",
};

type DailyDocumentForPublication = {
  id: string;
  organisation_id: string;
  session_id?: string | null;
  enrolment_id?: string | null;
  document_type: string;
  logical_name: string;
  version: number;
  status: string;
  sha256?: string | null;
  storage_path: string;
  metadata?: Record<string, unknown> | null;
};

export async function publishDailyDocument({
  admin,
  userId,
  document,
}: {
  admin: SupabaseClient;
  userId: string;
  document: DailyDocumentForPublication;
}) {
  if (document.status !== "validated") {
    throw new Error("Le document doit être validé avant publication.");
  }

  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .select("id,name,legal_name,email,administrative_email,client_notifications_paused")
    .eq("id", document.organisation_id)
    .maybeSingle();
  if (organisationError) throw new Error(organisationError.message);
  if (!organisation) throw new Error("Organisme introuvable.");

  const recipientEmail = String(
    organisation.administrative_email || organisation.email || "",
  ).trim().toLowerCase();
  if (!recipientEmail) {
    throw new Error("Aucune adresse e-mail client n’est disponible pour publier ce document.");
  }

  const label = documentLabels[document.document_type] ?? "Document";
  const organisationName = String(organisation.legal_name || organisation.name || "").trim();
  const subject = "Nouveau document disponible dans votre espace Selen Daily";
  const bodyText = [
    "Bonjour,",
    `${label} (version ${document.version}) vient d’être publié dans votre espace Selen Daily.`,
    organisationName ? `Organisme : ${organisationName}.` : "",
    "Vous pouvez le retrouver depuis votre tableau de bord.",
  ].filter(Boolean).join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: "Nouveau document Selen Daily",
    bodyText,
    ctaLabel: "Ouvrir Selen Daily",
    ctaUrl: `${getVitrineBaseUrl()}/client`,
  });

  const { data: communication, error: communicationError } = await admin
    .from("daily_communications")
    .insert({
      organisation_id: document.organisation_id,
      session_id: document.session_id ?? null,
      enrolment_id: document.enrolment_id ?? null,
      communication_type: "document_publication",
      channel: "email",
      recipient_email: recipientEmail,
      recipient_name: organisationName || null,
      subject,
      text_body: rendered.text,
      html_body: rendered.html,
      provider: "resend",
      status: "queued",
      created_by: userId,
      metadata: {
        document_id: document.id,
        document_type: document.document_type,
        document_version: document.version,
        logical_name: document.logical_name,
      },
    })
    .select("id")
    .single();
  if (communicationError || !communication) {
    throw new Error("La preuve de notification n’a pas pu être créée. Le document n’a pas été publié.");
  }

  const { error: snapshotError } = await admin
    .from("daily_communication_documents")
    .insert({
      communication_id: communication.id,
      document_id: document.id,
      document_type: document.document_type,
      logical_name: document.logical_name,
      document_version: document.version,
      sha256: document.sha256 ?? null,
      storage_path: document.storage_path,
    });
  if (snapshotError) {
    await admin.from("daily_communications").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: "document_snapshot_failed",
    }).eq("id", communication.id);
    throw new Error("La version exacte du document n’a pas pu être figée. Le document n’a pas été publié.");
  }

  const publishedAt = new Date().toISOString();
  const metadata = {
    ...(document.metadata ?? {}),
    published_at: publishedAt,
    published_by: userId,
  };
  const { data: published, error: publicationError } = await admin
    .from("daily_documents")
    .update({
      status: "published",
      published_at: publishedAt,
      updated_by: userId,
      metadata,
    })
    .eq("id", document.id)
    .eq("organisation_id", document.organisation_id)
    .eq("is_current", true)
    .eq("status", "validated")
    .select("*")
    .maybeSingle();

  if (publicationError || !published) {
    await admin.from("daily_communications").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: "document_publication_failed",
    }).eq("id", communication.id);
    throw new Error("Le document n’a pas pu être publié depuis sa version validée.");
  }

  const sent = await sendClientEmailWithSilence({
    supabase: admin,
    organisationId: document.organisation_id,
    email: recipientEmail,
    to: recipientEmail,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!sent.sent) {
    const failureReason = sent.paused ? "client_notifications_paused" : sent.error || "email_send_failed";
    await admin.from("daily_communications").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_reason: failureReason,
    }).eq("id", communication.id);
    return {
      document: published,
      notificationSent: false,
      notificationReason: failureReason,
      communicationId: communication.id,
    };
  }

  const sentAt = new Date().toISOString();
  const providerMessageId = "resendId" in sent ? sent.resendId ?? null : null;
  await admin.from("daily_communications").update({
    status: "sent",
    sent_at: sentAt,
    provider_message_id: providerMessageId,
    failed_at: null,
    failure_reason: null,
  }).eq("id", communication.id);

  return {
    document: published,
    notificationSent: true,
    notificationReason: null,
    communicationId: communication.id,
  };
}
