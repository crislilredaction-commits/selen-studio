import { getVitrineClientUrl } from "@/lib/vitrineLinks";
import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";

type NotifyClientVisibleDocumentsArgs = {
  dossierId: string;
  dossierType?: string;
  organisation?: {
    name?: string | null;
    email?: string | null;
  } | null;
  greetingName?: string | null;
  subject: string;
  message: string;
  buttonLabel?: string;
};

export async function notifyClientVisibleDocuments({
  dossierId,
  dossierType = "nda",
  organisation,
  greetingName,
  subject,
  message,
  buttonLabel = "Accéder à mon espace client",
}: NotifyClientVisibleDocumentsArgs) {
  const recipient = organisation?.email?.trim();

  if (!recipient) {
    const error = "Aucun email client fiable n'est renseigné pour ce dossier.";

    console.warn("Notification documents client ignorée.", {
      hasRecipient: Boolean(recipient),
      dossierId,
    });

    return { sent: false, error };
  }

  const clientUrl = getVitrineClientUrl(dossierType, dossierId);
  const recipientName = greetingName?.trim() || organisation?.name?.trim();
  const bodyText = [
    recipientName ? `Bonjour ${recipientName},` : "Bonjour,",
    message,
    "Rappel : votre identifiant est l'email utilisé lors de l'achat.",
  ].join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: subject,
    bodyText,
    ctaLabel: buttonLabel,
    ctaUrl: clientUrl,
  });

  try {
    return await sendSelenEmail({
      to: recipient,
      subject,
      html: rendered.html,
      text: rendered.text,
    });
  } catch (error) {
    console.error("Notification documents client échouée.", error);
    return {
      sent: false,
      error:
        error instanceof Error
          ? error.message
          : "Erreur inconnue pendant l'envoi email.",
    };
  }
}
