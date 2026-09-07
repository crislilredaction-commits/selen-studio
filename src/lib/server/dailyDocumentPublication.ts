import type { SupabaseClient } from "@supabase/supabase-js";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

type DailyDocumentForPublication = {
  id: string;
  organisation_id: string;
  document_type: string;
  logical_name?: string | null;
  version?: number | null;
  status: string;
  metadata?: Record<string, unknown> | null;
};

const DOCUMENT_LABELS: Record<string, string> = {
  training_program: "Programme de formation",
  training_agreement: "Convention de formation",
  convocation: "Convocation",
  registration_positioning: "Inscription et positionnement",
  attendance_summary: "Relevé des présences",
  completion_certificate: "Certificat de réalisation",
};

function labelFor(document: DailyDocumentForPublication) {
  return DOCUMENT_LABELS[document.document_type] || document.logical_name || "Document";
}

export async function publishDailyDocumentAndNotify(params: {
  admin: SupabaseClient;
  document: DailyDocumentForPublication;
  publishedBy: string;
  publishedByEmail?: string | null;
}) {
  const { admin, document, publishedBy, publishedByEmail } = params;
  if (document.status !== "validated") {
    return { ok: false as const, status: 409, error: "Seul un document validé peut être publié." };
  }

  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .select("id,name,legal_name,email,client_notifications_paused")
    .eq("id", document.organisation_id)
    .maybeSingle();
  if (organisationError) {
    return { ok: false as const, status: 500, error: organisationError.message };
  }

  const recipient = String(organisation?.email ?? "").trim();
  if (!recipient) {
    return { ok: false as const, status: 409, error: "Aucun email client n’est renseigné pour cet organisme." };
  }

  const documentLabel = labelFor(document);
  const organisationName = String(organisation?.legal_name || organisation?.name || "votre organisme").trim();
  const clientDocumentsUrl = `${getVitrineBaseUrl()}/client/daily/documents`;
  const subject = `Nouveau document disponible dans Selen Daily : ${documentLabel}`;
  const bodyText = [
    `Bonjour,`,
    `Un nouveau document vient d’être publié pour ${organisationName} : ${documentLabel}${document.version ? ` (version ${document.version})` : ""}.`,
    "Vous pouvez le retrouver dès maintenant dans votre espace Selen Daily.",
  ].join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: "Un nouveau document est disponible",
    bodyText,
    ctaLabel: "Ouvrir mes documents",
    ctaUrl: clientDocumentsUrl,
  });

  const notification = await sendClientEmailWithSilence({
    supabase: admin,
    organisationId: document.organisation_id,
    email: recipient,
    to: recipient,
    subject,
    html: rendered.html,
    text: rendered.text,
  });
  if (!notification.sent) {
    return {
      ok: false as const,
      status: notification.paused ? 409 : 502,
      error: notification.error || "La notification email n’a pas pu être envoyée.",
    };
  }

  const publishedAt = new Date().toISOString();
  const metadata = {
    ...(document.metadata ?? {}),
    published_by_email: publishedByEmail ?? null,
    publication_notification_sent_at: publishedAt,
    publication_notification_resend_id: "resendId" in notification ? notification.resendId ?? null : null,
  };
  const { data: updated, error: updateError } = await admin
    .from("daily_documents")
    .update({
      status: "published",
      published_at: publishedAt,
      updated_by: publishedBy,
      metadata,
    })
    .eq("id", document.id)
    .eq("organisation_id", document.organisation_id)
    .eq("status", "validated")
    .eq("is_current", true)
    .select("*")
    .single();

  if (updateError) {
    return {
      ok: false as const,
      status: 500,
      error: `L’email a été envoyé mais la publication n’a pas pu être finalisée : ${updateError.message}`,
    };
  }

  return { ok: true as const, document: updated, notification };
}
