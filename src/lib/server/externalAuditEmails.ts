import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import {
  auditDeliveryMode,
  auditEnd,
  auditStart,
  getAuditMeetLink,
  googleMapsUrl,
  isRemoteAudit,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";

export const DEFAULT_LIL_REMINDER_EMAIL = "crislil.redaction@gmail.com";

function formatDateValue(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(new Date(`${value}T12:00:00`));
}
function formatAuditDate(audit: Pick<ExternalAuditRow, "audit_date" | "start_time">) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(auditStart(audit));
}
function metadataText(audit: ExternalAuditRow, keys: string[]) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  for (const key of keys) { const value = metadata[key]; if (typeof value === "string" && value.trim()) return value.trim(); }
  return "";
}
function auditDateLabel(audit: ExternalAuditRow) {
  const endDate = metadataText(audit, ["audit_end_date", "end_date"]);
  if (!endDate || endDate === audit.audit_date) return formatAuditDate(audit);
  return `du ${formatDateValue(audit.audit_date)} au ${formatDateValue(endDate)}`;
}
function auditHours(audit: Pick<ExternalAuditRow, "start_time" | "end_time">) { return `${audit.start_time.slice(0, 5)}${audit.end_time ? ` - ${audit.end_time.slice(0, 5)}` : ""}`; }
function auditStartHour(audit: Pick<ExternalAuditRow, "start_time">) { return audit.start_time.slice(0, 5); }
function auditEndHour(audit: Pick<ExternalAuditRow, "audit_date" | "start_time" | "end_time">) { return audit.end_time ? audit.end_time.slice(0, 5) : auditEnd(audit).toTimeString().slice(0, 5); }
function formatTime(value: Date) { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(value); }
function isCertifopac(certifier?: string | null) { return String(certifier ?? "").trim().toLowerCase().includes("certifopac"); }
function metadataNumber(audit: ExternalAuditRow, keys: string[]) { const value = Number(metadataText(audit, keys)); return Number.isFinite(value) && value > 0 ? value : null; }
function auditContactBlock() {
  const phone = process.env.LIL_AUDIT_PHONE?.trim() || process.env.LIL_CONTACT_PHONE?.trim() || "06 73 58 57 47";
  return ["Coordonnées utiles :", "Pascale Barthaux", `Téléphone : ${phone}`, "Email : hello@selen-editions.fr"].join("\n");
}
function auditSummaryBlock(audit: ExternalAuditRow, remote: boolean, meetLink: string) {
  return [
    `Organisme de formation : ${audit.of_name}`,
    `Certificateur : ${audit.certifier || "à confirmer"}`,
    `Type d'audit : ${audit.audit_type}`,
    `Modalité : ${remote ? "Distanciel" : "Présentiel"}`,
    `Date${metadataText(audit, ["audit_end_date", "end_date"]) ? "s" : ""} : ${auditDateLabel(audit)}`,
    `Heure de début : ${auditStartHour(audit)}`,
    `Heure de fin : ${auditEndHour(audit)}`,
    remote ? `Lien Google Meet : ${meetLink || "lien en cours de génération"}` : `Adresse : ${audit.address || "adresse à confirmer"}`,
  ].join("\n");
}
export function getLilReminderRecipient() { return process.env.LIL_REMINDER_EMAIL?.trim() || DEFAULT_LIL_REMINDER_EMAIL; }
function formatSentStatus(value?: string | null) { if (!value) return "Non envoyé"; return `Envoyé le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))}`; }
export function buildTravelPreparation(audit: ExternalAuditRow) {
  const mode = metadataText(audit, ["departure_mode"]) || "home";
  const customAddress = metadataText(audit, ["departure_address"]);
  const travelMinutes = metadataNumber(audit, ["travel_duration_minutes", "travel_time_minutes", "estimated_travel_minutes"]);
  const start = auditStart(audit);
  const departureAt = travelMinutes ? new Date(start.getTime() - (travelMinutes + 30) * 60 * 1000) : null;
  const wakeAt = departureAt ? new Date(departureAt.getTime() - 60 * 60 * 1000) : null;
  if (mode === "mother") return { mode, label: "Chez maman", address: "Abbeville", travelMinutes, travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné", departureAt, departureLabel: departureAt ? formatTime(departureAt) : "-", wakeAt, wakeLabel: wakeAt ? formatTime(wakeAt) : "-" };
  if (mode === "custom") return { mode, label: "Hébergement temporaire", address: customAddress || "Adresse de départ non renseignée", travelMinutes, travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné", departureAt, departureLabel: departureAt ? formatTime(departureAt) : "-", wakeAt, wakeLabel: wakeAt ? formatTime(wakeAt) : "-" };
  return { mode: "home", label: "Domicile", address: "Droupt-Saint-Basle", travelMinutes, travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné", departureAt, departureLabel: departureAt ? formatTime(departureAt) : "-", wakeAt, wakeLabel: wakeAt ? formatTime(wakeAt) : "-" };
}
export function buildExternalAuditConfirmationEmail(audit: ExternalAuditRow) {
  const contact = audit.contact_name?.trim() || "Madame, Monsieur";
  const remote = isRemoteAudit(audit);
  const meetLink = getAuditMeetLink(audit);
  const subject = "Confirmation de votre audit Qualiopi";
  const certifopacParagraph = isCertifopac(audit.certifier) ? ["Par ailleurs, si cela n'est pas déjà fait, je vous invite à compléter le questionnaire disponible sur l'application Certifopac.", "Si vous rencontrez la moindre difficulté pour y accéder ou le compléter, n'hésitez pas à me contacter ; je vous accompagnerai avec plaisir."] : [];
  const summary = auditSummaryBlock(audit, remote, meetLink);
  const contacts = auditContactBlock();
  const bodyLines = remote ? [
    `Bonjour ${contact},`, "J'espère que vous allez bien.", "Je vous contacte car la réalisation de votre audit Qualiopi m'a été confiée.", "Je me présente : je suis Pascale Barthaux, auditrice Qualiopi, et j'aurai le plaisir de vous accompagner lors de cet audit à distance.", "Voici un récapitulatif des informations prévues :", summary, "Je vous invite à vous connecter quelques minutes avant le début afin que nous puissions démarrer à l'heure prévue.", contacts, ...certifopacParagraph, "Si vous avez des questions concernant l'organisation pratique de l'audit, n'hésitez pas à me répondre directement.", "Pour toute question relative aux aspects contractuels ou financiers, je vous invite en revanche à contacter directement votre certificateur.", "Je vous remercie par avance et vous souhaite une excellente préparation.", "Bien cordialement,", "Pascale Barthaux\nAuditrice Qualiopi"
  ] : [
    `Bonjour ${contact},`, "J'espère que vous allez bien.", "Je vous contacte car la réalisation de votre audit Qualiopi m'a été confiée.", "Je me présente : je suis Pascale Barthaux, auditrice Qualiopi, et j'aurai le plaisir de vous accompagner lors de cet audit.", "Voici un récapitulatif des informations prévues :", summary, contacts, "J'arriverai entre 5 et 15 minutes avant le début de l'audit afin que nous puissions nous installer sereinement.", "Pour le bon déroulement de la journée, il vous suffit de prévoir :\n\n- une table et des chaises ;\n- une prise de courant à proximité ;\n- une connexion Wi-Fi si possible.", "Il n'est pas nécessaire d'imprimer les documents à présenter : les supports numériques sont tout à fait acceptés.", "Afin de préparer le plan d'audit, pourriez-vous également m'indiquer, par retour de mail, les personnes qui seront présentes lors de l'audit ainsi que leur fonction au sein de l'organisme de formation ?", ...certifopacParagraph, "Si vous avez des questions concernant l'organisation pratique de l'audit, n'hésitez pas à me répondre directement.", "Pour toute question relative aux aspects contractuels ou financiers, je vous invite en revanche à contacter directement votre certificateur.", "Je vous remercie par avance pour votre accueil et vous souhaite une excellente préparation d'ici notre rencontre.", "Au plaisir de faire votre connaissance.", "Bien cordialement,", "Pascale Barthaux\nAuditrice Qualiopi"
  ];
  const bodyText = bodyLines.join("\n\n");
  const rendered = renderSelenEmailFromText({ title: subject, bodyText, ctaLabel: remote && meetLink ? "Rejoindre Google Meet" : undefined, ctaUrl: remote && meetLink ? meetLink : undefined });
  return { to: audit.contact_email || "", subject, bodyText, html: rendered.html, text: rendered.text };
}
export function renderExternalAuditConfirmationEmail({ audit, subject, bodyText }: { audit: ExternalAuditRow; subject?: string | null; bodyText?: string | null }) {
  const model = buildExternalAuditConfirmationEmail(audit); const finalSubject = subject?.trim() || model.subject; const finalBodyText = bodyText?.trim() || model.bodyText;
  const rendered = renderSelenEmailFromText({ title: finalSubject, bodyText: finalBodyText, ctaLabel: isRemoteAudit(audit) && getAuditMeetLink(audit) ? "Rejoindre Google Meet" : undefined, ctaUrl: isRemoteAudit(audit) ? getAuditMeetLink(audit) : undefined });
  return { to: model.to, subject: finalSubject, bodyText: finalBodyText, html: rendered.html, text: rendered.text };
}
export async function sendExternalAuditConfirmation(audit: ExternalAuditRow, options: { subject?: string | null; bodyText?: string | null } = {}) {
  const email = renderExternalAuditConfirmationEmail({ audit, subject: options.subject, bodyText: options.bodyText }); if (!email.to) return { sent: false, error: "Email contact absent." }; return sendClientEmailWithSilence({ email: email.to, to: email.to, subject: email.subject, html: email.html, text: email.text });
}
export function buildExternalAuditClientReminderEmail(audit: ExternalAuditRow) {
  const contact = audit.contact_name?.trim() || "Madame, Monsieur"; const date = auditDateLabel(audit); const remote = isRemoteAudit(audit); const meetLink = getAuditMeetLink(audit); const subject = `Rappel audit Qualiopi - ${audit.of_name}`;
  const bodyLines = remote ? [`Bonjour ${contact},`, "Je vous rappelle que votre audit Qualiopi à distance est prévu demain.", `Date : ${date}`, `Heure de début : ${auditStartHour(audit)}`, `Heure de fin : ${auditEndHour(audit)}`, `Lien Google Meet : ${meetLink || "lien en cours de génération"}`, "Je vous invite à vous connecter quelques minutes avant le début afin que nous puissions démarrer sereinement.", auditContactBlock(), "Bien cordialement,", "Pascale Barthaux\nAuditrice Qualiopi"] : [`Bonjour ${contact},`, "Je vous rappelle que votre audit Qualiopi en présentiel est prévu demain.", `Date : ${date}`, `Heure de début : ${auditStartHour(audit)}`, `Heure de fin : ${auditEndHour(audit)}`, `Adresse : ${audit.address || "adresse à confirmer"}`, auditContactBlock(), "L'audit commencera à l'heure prévue.", "En cas de retard exceptionnel lié à la circulation, je vous préviendrai par SMS.", "Bien cordialement,", "Pascale Barthaux\nAuditrice Qualiopi"];
  const bodyText = bodyLines.join("\n\n"); const rendered = renderSelenEmailFromText({ title: subject, bodyText, ctaLabel: remote && meetLink ? "Rejoindre Google Meet" : undefined, ctaUrl: remote && meetLink ? meetLink : undefined }); return { to: audit.contact_email || "", subject, bodyText, html: rendered.html, text: rendered.text };
}
export function buildLilReminderEmail(audit: ExternalAuditRow) {
  const maps = googleMapsUrl(audit.address); const travel = buildTravelPreparation(audit); const remote = isRemoteAudit(audit); const meetLink = getAuditMeetLink(audit); const notes = audit.metadata && typeof audit.metadata.notes === "string" ? audit.metadata.notes.trim() : ""; const auditPlanStatus = metadataText(audit, ["audit_plan_status", "plan_audit_status", "plan_status", "audit_plan"]) || "Non renseigné"; const subject = `Rappel audit externe - ${audit.of_name}`;
  const bodyText = (remote ? [`Organisme de formation : ${audit.of_name}`, `Contact : ${audit.contact_name || "-"}`, `Téléphone : ${audit.contact_phone || "-"}`, `Email : ${audit.contact_email || "-"}`, `Date : ${auditDateLabel(audit)}`, `Heure début : ${auditStartHour(audit)}`, `Heure fin : ${auditEndHour(audit)}`, `Type d'audit : ${audit.audit_type}`, `Modalité : ${auditDeliveryMode(audit)}`, `Lien Google Meet : ${meetLink || "-"}`, `Événement Google associé : ${audit.google_calendar_event_id || "Aucun événement Google associé"}`, `Statut mail confirmation : ${formatSentStatus(audit.confirmation_email_sent_at)}`, `Statut plan d'audit : ${auditPlanStatus}`, "", "--------------------------------------------------", "MES NOTES", "", notes || "Aucune note enregistrée.", "--------------------------------------------------"] : [`Organisme de formation : ${audit.of_name}`, `Contact : ${audit.contact_name || "-"}`, `Téléphone : ${audit.contact_phone || "-"}`, `Email : ${audit.contact_email || "-"}`, `Adresse complète : ${audit.address || "-"}`, `Date : ${auditDateLabel(audit)}`, `Horaires : ${auditHours(audit)}`, `Type d'audit : ${audit.audit_type}`, `Modalité : ${auditDeliveryMode(audit)}`, `Certificateur : ${audit.certifier || "-"}`, maps ? `Lien GPS : ${maps}` : "Lien GPS : adresse absente", `Événement Google associé : ${audit.google_calendar_event_id || "Aucun événement Google associé"}`, `Statut mail confirmation : ${formatSentStatus(audit.confirmation_email_sent_at)}`, `Statut plan d'audit : ${auditPlanStatus}`, "", "POINT DE DÉPART", travel.label, travel.address, "", "Temps estimé :", travel.travelLabel, "", "Départ conseillé :", travel.departureLabel, "", "Documents utiles :", auditPlanStatus, "", "--------------------------------------------------", "MES NOTES", "", notes || "Aucune note enregistrée.", "--------------------------------------------------"]).filter(Boolean).join("\n");
  const rendered = renderSelenEmailFromText({ title: subject, bodyText, ctaLabel: remote && meetLink ? "Rejoindre Google Meet" : maps ? "Ouvrir le GPS" : undefined, ctaUrl: remote && meetLink ? meetLink : maps || undefined }); return { to: getLilReminderRecipient(), subject, bodyText, html: rendered.html, text: rendered.text };
}
export const buildExternalAuditReminderEmail = buildLilReminderEmail;
export async function sendExternalAuditClientReminder(audit: ExternalAuditRow) { const email = buildExternalAuditClientReminderEmail(audit); if (!email.to) return { sent: false, error: "Email contact absent.", to: email.to }; const result = await sendClientEmailWithSilence({ email: email.to, to: email.to, subject: email.subject, html: email.html, text: email.text }); return { ...result, to: email.to }; }
export async function sendExternalAuditLilReminder(audit: ExternalAuditRow) { const email = buildLilReminderEmail(audit); const result = await sendSelenEmail({ to: email.to, subject: email.subject, html: email.html, text: email.text }); return { ...result, to: email.to }; }
export async function sendExternalAuditReminder(audit: ExternalAuditRow) { return sendExternalAuditLilReminder(audit); }
