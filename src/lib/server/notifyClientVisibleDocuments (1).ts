import { Resend } from "resend";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";

type NotifyClientVisibleDocumentsArgs = {
  dossierId: string;
  organisation?: {
    name?: string | null;
    email?: string | null;
  } | null;
  subject: string;
  message: string;
};

export async function notifyClientVisibleDocuments({
  dossierId,
  organisation,
  subject,
  message,
}: NotifyClientVisibleDocumentsArgs) {
  const resendApiKey = process.env.RESEND_API_KEY;
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
  const clientUrl = getVitrineClientUrl("nda", dossierId);
  const recipientName = organisation?.name?.trim() || "bonjour";

  try {
    await resend.emails.send({
      from: "Selen <hello@selen-editions.fr>",
      to: recipient,
      subject,
      html: `
        <p>Bonjour ${recipientName},</p>
        <p>${message}</p>
        <p>
          <a href="${clientUrl}">Accéder à mon espace client</a>
        </p>
      `,
    });

    return { sent: true };
  } catch (error) {
    console.error("Notification documents client échouée.", error);
    return { sent: false };
  }
}
