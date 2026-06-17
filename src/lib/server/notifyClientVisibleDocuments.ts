import { Resend } from "resend";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";

type NotifyClientVisibleDocumentsArgs = {
  dossierId: string;
  dossierType?: string;
  organisation?: {
    name?: string | null;
    email?: string | null;
  } | null;
  subject: string;
  message: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function notifyClientVisibleDocuments({
  dossierId,
  dossierType = "nda",
  organisation,
  subject,
  message,
}: NotifyClientVisibleDocumentsArgs) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SELEN_EMAIL_FROM?.trim() ||
    "Selen Editions <hello@selen-editions.fr>";
  const recipient = organisation?.email?.trim();

  if (!resendApiKey || !recipient) {
    console.warn("Notification documents client ignorée.", {
      hasResendApiKey: Boolean(resendApiKey),
      hasRecipient: Boolean(recipient),
      dossierId,
    });
    return { sent: false };
  }

  const resend = new Resend(resendApiKey);
  const clientUrl = getVitrineClientUrl(dossierType, dossierId);
  const recipientName = organisation?.name?.trim() || "bonjour";

  try {
    await resend.emails.send({
      from,
      to: recipient,
      subject,
      html: `
        <p>Bonjour ${escapeHtml(recipientName)},</p>
        <p>${escapeHtml(message)}</p>
        <p>
          <a href="${clientUrl}">Accéder à mon espace client</a>
        </p>
        <p>À très vite,<br />Selen Editions</p>
      `,
    });

    return { sent: true };
  } catch (error) {
    console.error("Notification documents client échouée.", error);
    return { sent: false };
  }
}
