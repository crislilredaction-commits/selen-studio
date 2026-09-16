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

const DAILY_CLIENT_DOCUMENTS_TARGET = "client_daily_documents";

function labelFor(document: DailyDocumentForPublication) {
  return DOCUMENT_LABELS[document.document_type] || document.logical_name || "Document";
}

function clientDocumentUrl(documentId: string) {
  const query = new URLSearchParams({ document: documentId });
  return `${getVitrineBaseUrl()}/client/daily/documents?${query.toString()}`;
}

function hasPublicationNotification(metadata?: Record<string, unknown> | null) {
  return Boolean(metadata?.publication_notification_sent_at);
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

  // Relecture canonique avant tout envoi : l'objet reçu par l'UI peut être périmé
  // (double clic, retry réseau, second onglet). Un document déjà publié ne doit
  // jamais déclencher un second email.
  const { data: current, error: currentError } = await admin
    .from("daily_documents")
    .select("id,organisation_id,status,metadata,is_current")
    .eq("id", document.id)
    .eq("organisation_id", document.organisation_id)
    .eq("is_current", true)
    .maybeSingle();
  if (currentError) {
    return { ok: false as const, status: 500, error: currentError.message };
  }
  if (!current) {
    return { ok: false as const, status: 404, error: "Document introuvable." };
  }
  if (current.status === "published") {
    return { ok: true as const, document: current, notification: { sent: false, deduplicated: true } };
  }
  if (current.status !== "validated") {
    return { ok: false as const, status: 409, error: "Le document n’est plus dans un état publiable." };
  }

  const currentMetadata = (current.metadata ?? {}) as Record<string, unknown>;
  const notificationAlreadySent = hasPublicationNotification(currentMetadata);

  const { data: organisation, error: organisationError } = await admin
    .from("organisations")
    .select("id,name,legal_name,email,client_notifications_paused")
    .eq("id", document.organisation_id)
    .maybeSingle();
  if (organisationError) {
    return { ok: false as const, status: 500, error: organisationError.message };
  }

  const recipient = String(organisation?.email ?? "").trim().toLowerCase();
  if (!recipient) {
    return { ok: false as const, status: 409, error: "Aucun email client n’est renseigné pour cet organisme." };
  }

  const documentLabel = labelFor(document);
  const organisationName = String(organisation?.legal_name || organisation?.name || "votre organisme").trim();
  const clientDocumentsUrl = clientDocumentUrl(document.id);
  const subject = `Nouveau document disponible dans Selen Daily : ${documentLabel}`;
  const bodyText = [
    "Bonjour,",
    `Un nouveau document vient d’être publié pour ${organisationName} : ${documentLabel}${document.version ? ` (version ${document.version})` : ""}.`,
    "Vous pouvez l’ouvrir directement depuis votre espace Selen Daily avec le bouton ci-dessous.",
  ].join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: "Un nouveau document est disponible",
    bodyText,
    ctaLabel: "Ouvrir le document",
    ctaUrl: clientDocumentsUrl,
  });

  let notification: Awaited<ReturnType<typeof sendClientEmailWithSilence>> | { sent: false; deduplicated: true };
  let publishedAt = String(currentMetadata.publication_notification_sent_at ?? "") || new Date().toISOString();
  let metadata = currentMetadata;

  if (notificationAlreadySent) {
    notification = { sent: false, deduplicated: true };
  } else {
    notification = await sendClientEmailWithSilence({
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
        status: "paused" in notification && notification.paused ? 409 : 502,
        error: "error" in notification && notification.error ? notification.error : "La notification email n’a pas pu être envoyée.",
      };
    }

    publishedAt = new Date().toISOString();
    metadata = {
      ...currentMetadata,
      publication_document_id: document.id,
      publication_document_version: document.version ?? null,
      published_by_email: publishedByEmail ?? null,
      publication_recipient_email: recipient,
      publication_target: DAILY_CLIENT_DOCUMENTS_TARGET,
      publication_target_url: clientDocumentsUrl,
      publication_notification_sent_at: publishedAt,
      publication_notification_resend_id: "resendId" in notification ? notification.resendId ?? null : null,
    };

    // Persiste d'abord la preuve d'envoi tout en gardant l'état validated. Ainsi,
    // si la finalisation échoue ensuite, un retry termine la publication sans
    // renvoyer l'email déjà parti.
    const { error: proofError } = await admin
      .from("daily_documents")
      .update({ metadata, updated_by: publishedBy })
      .eq("id", document.id)
      .eq("organisation_id", document.organisation_id)
      .eq("status", "validated")
      .eq("is_current", true);
    if (proofError) {
      return {
        ok: false as const,
        status: 500,
        error: `L’email a été envoyé mais sa preuve n’a pas pu être enregistrée : ${proofError.message}`,
      };
    }
  }

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
      error: `La notification est enregistrée mais la publication n’a pas pu être finalisée : ${updateError.message}`,
    };
  }

  return { ok: true as const, document: updated, notification };
}
