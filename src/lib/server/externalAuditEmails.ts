import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";
import {
  auditStart,
  googleMapsUrl,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";

function formatAuditDate(audit: Pick<ExternalAuditRow, "audit_date" | "start_time">) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
  }).format(auditStart(audit));
}

function auditHours(
  audit: Pick<ExternalAuditRow, "start_time" | "end_time">,
) {
  return `${audit.start_time.slice(0, 5)}${
    audit.end_time ? ` - ${audit.end_time.slice(0, 5)}` : ""
  }`;
}

function isCertifopac(certifier?: string | null) {
  return String(certifier ?? "")
    .trim()
    .toLowerCase()
    .includes("certifopac");
}

export function buildExternalAuditConfirmationEmail(audit: ExternalAuditRow) {
  const contact = audit.contact_name?.trim() || "Madame, Monsieur";
  const date = formatAuditDate(audit);
  const hours = auditHours(audit);
  const address = audit.address || "adresse a confirmer";
  const certifier = audit.certifier || "a confirmer";
  const subject = "Confirmation de votre audit Qualiopi";
  const certifopacParagraph = isCertifopac(audit.certifier)
    ? [
        "Par ailleurs, si cela n'est pas deja fait, je vous invite a completer le questionnaire disponible sur l'application Certifopac. Ce questionnaire me permet de preparer l'audit dans les meilleures conditions.",
        "Si vous rencontrez la moindre difficulte pour y acceder ou le completer, n'hesitez pas a me contacter ; je vous accompagnerai avec plaisir.",
      ]
    : [];
  const bodyText = [
    `Bonjour ${contact},`,
    "J'espere que vous allez bien.",
    "Je vous contacte car la realisation de votre audit Qualiopi m'a ete confiee.",
    "Je me presente : je suis Pascale Barthaux, auditrice Qualiopi, et j'aurai le plaisir de vous accompagner lors de cet audit.",
    "Voici un recapitulatif des informations prevues :",
    `Organisme de formation : ${audit.of_name}`,
    `Certificateur : ${certifier}`,
    `Type d'audit : ${audit.audit_type}`,
    `Date : ${date}`,
    `Horaires : ${hours}`,
    `Adresse : ${address}`,
    "J'arriverai generalement entre 5 et 15 minutes avant le debut de l'audit afin que nous puissions nous installer sereinement.",
    "Pour le bon deroulement de la journee, il vous suffit de prevoir :\n\n• une table et des chaises ;\n• une prise de courant a proximite ;\n• une connexion Wi-Fi si possible.",
    "Il n'est pas necessaire d'imprimer les documents a presenter : les supports numeriques sont tout a fait acceptes.",
    "Afin de preparer le plan d'audit, pourriez-vous egalement m'indiquer, par retour de mail, les personnes qui seront presentes lors de l'audit ainsi que leur fonction au sein de l'organisme de formation ?",
    ...certifopacParagraph,
    "Si vous avez des questions concernant l'organisation pratique de l'audit, n'hesitez pas a me repondre directement, je serai ravie de vous renseigner.",
    "Pour toute question relative aux aspects contractuels ou financiers, je vous invite en revanche a contacter directement votre certificateur.",
    "Je vous remercie par avance pour votre accueil et vous souhaite une excellente preparation d'ici notre rencontre.",
    "Au plaisir de faire votre connaissance.",
    "Bien cordialement,",
    "Pascale Barthaux\nAuditrice Qualiopi",
  ].join("\n\n");
  const rendered = renderSelenEmailFromText({
    title: "Confirmation de votre audit Qualiopi",
    bodyText,
  });

  return {
    to: audit.contact_email || "",
    subject,
    bodyText,
    html: rendered.html,
    text: rendered.text,
  };
}

export function renderExternalAuditConfirmationEmail({
  audit,
  subject,
  bodyText,
}: {
  audit: ExternalAuditRow;
  subject?: string | null;
  bodyText?: string | null;
}) {
  const model = buildExternalAuditConfirmationEmail(audit);
  const finalSubject = subject?.trim() || model.subject;
  const finalBodyText = bodyText?.trim() || model.bodyText;
  const rendered = renderSelenEmailFromText({
    title: finalSubject,
    bodyText: finalBodyText,
  });

  return {
    to: model.to,
    subject: finalSubject,
    bodyText: finalBodyText,
    html: rendered.html,
    text: rendered.text,
  };
}

export async function sendExternalAuditConfirmation(
  audit: ExternalAuditRow,
  options: { subject?: string | null; bodyText?: string | null } = {},
) {
  const email = renderExternalAuditConfirmationEmail({
    audit,
    subject: options.subject,
    bodyText: options.bodyText,
  });
  if (!email.to) {
    return { sent: false, error: "Email contact absent." };
  }

  return sendSelenEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}

export function buildExternalAuditReminderEmail(audit: ExternalAuditRow) {
  const maps = googleMapsUrl(audit.address);
  const notes =
    audit.metadata && typeof audit.metadata.notes === "string"
      ? audit.metadata.notes
      : "";
  const subject = `Rappel audit externe - ${audit.of_name}`;
  const bodyText = [
    `Audit externe demain : ${audit.of_name}`,
    `Contact : ${audit.contact_name || "-"}`,
    `Email : ${audit.contact_email || "-"}`,
    `Telephone : ${audit.contact_phone || "-"}`,
    `Adresse : ${audit.address || "-"}`,
    maps ? `Google Maps : ${maps}` : "",
    `Type d'audit : ${audit.audit_type}`,
    `Certificateur : ${audit.certifier || "-"}`,
    `Date : ${formatAuditDate(audit)}`,
    `Horaire : ${auditHours(audit)}`,
    notes ? `Notes : ${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const rendered = renderSelenEmailFromText({
    title: subject,
    bodyText,
  });

  return {
    to: process.env.LIL_NOTIFICATION_EMAIL || "hello@selen-editions.fr",
    subject,
    bodyText,
    html: rendered.html,
    text: rendered.text,
  };
}

export async function sendExternalAuditReminder(audit: ExternalAuditRow) {
  const email = buildExternalAuditReminderEmail(audit);
  return sendSelenEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
