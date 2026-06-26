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

export function buildExternalAuditConfirmationEmail(audit: ExternalAuditRow) {
  const contact = audit.contact_name?.trim() || "Madame, Monsieur";
  const date = formatAuditDate(audit);
  const hours = auditHours(audit);
  const address = audit.address || "adresse a confirmer";
  const certifier = audit.certifier || "a confirmer";
  const subject = `Confirmation de votre audit Qualiopi - ${audit.of_name}`;
  const bodyText = [
    `Bonjour ${contact},`,
    "Je me permets de vous confirmer que la realisation de votre audit Qualiopi m'a ete confiee.",
    "Je suis Pascale Barthaux, auditrice Qualiopi, et j'interviendrai pour votre audit selon les modalites suivantes :",
    `Organisme de formation : ${audit.of_name}`,
    `Contact : ${audit.contact_name || "-"}`,
    `Date : ${date}`,
    `Horaires : ${hours}`,
    `Adresse : ${address}`,
    `Type d'audit : ${audit.audit_type}`,
    `Certificateur : ${certifier}`,
    "J'arriverai environ 5 a 15 minutes avant le debut de l'audit.",
    "Pour le bon deroulement de l'audit, merci de prevoir : une table, des chaises, une connexion Wi-Fi et une prise de courant a proximite.",
    "Il n'est pas necessaire d'imprimer les elements a presenter : les documents au format numerique sont acceptes.",
    "Pour toute question organisationnelle concernant le deroulement pratique de l'audit, vous pouvez repondre directement a Pascale.",
    "Pour toute question financiere ou contractuelle, merci de contacter directement votre certificateur.",
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

export async function sendExternalAuditConfirmation(audit: ExternalAuditRow) {
  const email = buildExternalAuditConfirmationEmail(audit);
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
