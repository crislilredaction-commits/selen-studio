import { Resend } from "resend";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

const DEFAULT_FROM = "Selen Editions <hello@selen-editions.fr>";
const SUPPORT_EMAIL = "hello@selen-editions.fr";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphize(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n");
}

function getPhoneAppointmentUrl() {
  return "https://www.selen-editions.fr/prendre-rendez-vous";
}

export function getSelenLogoUrl() {
  const configured = process.env.NEXT_PUBLIC_SELEN_LOGO_URL?.trim();
  if (configured) return configured;
  return `${getVitrineBaseUrl()}/Logo%20Selen%20Editions.png`;
}

export function genericClientHelpFooterHtml() {
  const appointmentUrl = getPhoneAppointmentUrl();
  const logoUrl = getSelenLogoUrl();

  return `
    <p style="margin:24px 0 0;color:#5f5040;">
      Si vous avez des questions ou besoin d'aide, vous pouvez nous contacter
      depuis votre espace client, par email à
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#8a5a24;">${SUPPORT_EMAIL}</a>,
      ou <a href="${appointmentUrl}" style="color:#8a5a24;">prendre un rendez-vous téléphonique</a>.
    </p>
    <div style="margin-top:28px;padding-top:18px;border-top:1px solid #eadcc7;color:#4b3a2b;">
      <img src="${logoUrl}" alt="Selen Editions" width="120" style="display:block;margin:0 0 10px;" />
      <strong>Selen Editions</strong><br />
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#8a5a24;">${SUPPORT_EMAIL}</a><br />
      <a href="${appointmentUrl}" style="color:#8a5a24;">Prendre rendez-vous par téléphone</a>
    </div>
  `;
}

export function genericClientHelpFooterText() {
  return [
    "Si vous avez des questions ou besoin d'aide, vous pouvez nous contacter depuis votre espace client, par email à hello@selen-editions.fr, ou prendre un rendez-vous téléphonique.",
    "",
    "Selen Editions",
    "hello@selen-editions.fr",
    `Prendre rendez-vous par téléphone : ${getPhoneAppointmentUrl()}`,
  ].join("\n");
}

export function renderSelenEmailHtml({
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return `
    <div style="margin:0;padding:0;background:#f7efe4;color:#2d2117;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
        <div style="background:#fffaf2;border:1px solid #eadcc7;border-radius:10px;padding:28px;">
          <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#2d2117;">
            ${escapeHtml(title)}
          </h1>
          <div style="font-size:15px;line-height:1.65;color:#3f3125;">
            ${bodyHtml}
          </div>
          ${
            ctaLabel && ctaUrl
              ? `<p style="margin:24px 0;"><a href="${ctaUrl}" style="display:inline-block;background:#c9943a;color:#1f160e;text-decoration:none;font-weight:700;border-radius:7px;padding:12px 16px;">${escapeHtml(ctaLabel)}</a></p>`
              : ""
          }
          ${genericClientHelpFooterHtml()}
        </div>
      </div>
    </div>
  `;
}

export function renderSelenEmailText({
  bodyText,
  ctaLabel,
  ctaUrl,
}: {
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return [
    bodyText.trim(),
    ctaLabel && ctaUrl ? `${ctaLabel} : ${ctaUrl}` : "",
    genericClientHelpFooterText(),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderSelenEmailFromText({
  title,
  bodyText,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  bodyText: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  return {
    html: renderSelenEmailHtml({
      title,
      bodyHtml: paragraphize(bodyText),
      ctaLabel,
      ctaUrl,
    }),
    text: renderSelenEmailText({ bodyText, ctaLabel, ctaUrl }),
  };
}

export async function sendSelenEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string | null;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SELEN_EMAIL_FROM?.trim() ||
    DEFAULT_FROM;

  if (!resendApiKey) {
    console.warn("Email Selen non envoyé : RESEND_API_KEY absente.", {
      to,
      subject,
    });
    return {
      sent: false,
      error: "RESEND_API_KEY absente. Email non envoyé.",
    };
  }

  const resend = new Resend(resendApiKey);
  await resend.emails.send({
    from,
    to,
    subject,
    html,
    text: text || undefined,
  });

  return { sent: true, error: null };
}

export function renderSelenEmailLayout(contentHtml: string) {
  return `
  <div style="font-family: Georgia, serif; background:#f7efe2; padding:24px;">
    <div style="max-width:640px;margin:auto;background:#fffaf0;border:1px solid #d6b16a;border-radius:18px;padding:28px;">
      ${contentHtml}

      <hr style="border:none;border-top:1px solid #d6b16a;margin:28px 0;" />

      <p style="font-size:14px;line-height:1.6;color:#4b3828;">
        Si vous avez des questions ou besoin d’aide, vous pouvez nous contacter depuis votre espace client,
        par email à <a href="mailto:hello@selen-editions.fr">hello@selen-editions.fr</a>,
        ou <a href="https://selen-editions.fr/prendre-rendez-vous">prendre un rendez-vous téléphonique</a>.
      </p>

      <p style="font-size:14px;color:#4b3828;">
        <strong>Selen Editions</strong><br />
        Accompagnement administratif et Qualiopi<br />
        <a href="mailto:hello@selen-editions.fr">hello@selen-editions.fr</a>
      </p>
    </div>
  </div>`;
}
