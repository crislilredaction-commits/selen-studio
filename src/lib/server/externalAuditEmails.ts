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

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function isCertifopac(certifier?: string | null) {
  return String(certifier ?? "")
    .trim()
    .toLowerCase()
    .includes("certifopac");
}

function metadataText(audit: ExternalAuditRow, keys: string[]) {
  const metadata =
    audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function metadataNumber(audit: ExternalAuditRow, keys: string[]) {
  const raw = metadataText(audit, keys);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatSentStatus(value?: string | null) {
  if (!value) return "Non envoyé";
  return `Envoyé le ${new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))}`;
}

export function buildTravelPreparation(audit: ExternalAuditRow) {
  const mode = metadataText(audit, ["departure_mode"]) || "home";
  const customAddress = metadataText(audit, ["departure_address"]);
  const travelMinutes = metadataNumber(audit, [
    "travel_duration_minutes",
    "travel_time_minutes",
    "estimated_travel_minutes",
  ]);
  const start = auditStart(audit);
  const departureAt = travelMinutes
    ? new Date(start.getTime() - (travelMinutes + 30) * 60 * 1000)
    : null;
  const wakeAt = departureAt
    ? new Date(departureAt.getTime() - 60 * 60 * 1000)
    : null;

  if (mode === "mother") {
    return {
      mode,
      label: "👩 Chez maman",
      address: "Abbeville",
      travelMinutes,
      travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné",
      departureAt,
      departureLabel: departureAt ? formatTime(departureAt) : "-",
      wakeAt,
      wakeLabel: wakeAt ? formatTime(wakeAt) : "-",
    };
  }

  if (mode === "custom") {
    return {
      mode,
      label: "🏨 Hébergement temporaire",
      address: customAddress || "Adresse de départ non renseignée",
      travelMinutes,
      travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné",
      departureAt,
      departureLabel: departureAt ? formatTime(departureAt) : "-",
      wakeAt,
      wakeLabel: wakeAt ? formatTime(wakeAt) : "-",
    };
  }

  return {
    mode: "home",
    label: "🏠 Domicile",
    address: "Droupt-Saint-Basle",
    travelMinutes,
    travelLabel: travelMinutes ? `${travelMinutes} minutes` : "Temps de trajet non renseigné",
    departureAt,
    departureLabel: departureAt ? formatTime(departureAt) : "-",
    wakeAt,
    wakeLabel: wakeAt ? formatTime(wakeAt) : "-",
  };
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

export function buildLilReminderEmail(audit: ExternalAuditRow) {
  const maps = googleMapsUrl(audit.address);
  const travel = buildTravelPreparation(audit);
  const notes =
    audit.metadata && typeof audit.metadata.notes === "string"
      ? audit.metadata.notes.trim()
      : "";
  const auditPlanStatus =
    metadataText(audit, [
      "audit_plan_status",
      "plan_audit_status",
      "plan_status",
      "audit_plan",
    ]) || "Non renseigné";
  const subject = `Rappel audit externe - ${audit.of_name}`;
  const bodyText = [
    `Organisme de formation : ${audit.of_name}`,
    `Contact : ${audit.contact_name || "-"}`,
    `Telephone : ${audit.contact_phone || "-"}`,
    `Email : ${audit.contact_email || "-"}`,
    `Adresse complète : ${audit.address || "-"}`,
    `Date : ${formatAuditDate(audit)}`,
    `Horaires : ${auditHours(audit)}`,
    `Type d'audit : ${audit.audit_type}`,
    `Certificateur : ${audit.certifier || "-"}`,
    maps ? `Lien Google Maps : ${maps}` : "Lien Google Maps : adresse absente",
    `Event Google associé : ${audit.google_calendar_event_id || "Aucun événement Google associé"}`,
    `Statut mail confirmation : ${formatSentStatus(audit.confirmation_email_sent_at)}`,
    `Statut plan d'audit : ${auditPlanStatus}`,
    "",
    "POINT DE DEPART",
    travel.label,
    travel.address,
    "",
    "Temps estimé :",
    travel.travelLabel,
    "",
    "Départ conseillé :",
    travel.departureLabel,
    "",
    "Réveil conseillé :",
    travel.wakeLabel,
    "",
    "--------------------------------------------------",
    "MES NOTES",
    "",
    notes || "Aucune note enregistrée.",
    "--------------------------------------------------",
  ]
    .filter(Boolean)
    .join("\n");
  const rendered = renderSelenEmailFromText({
    title: subject,
    bodyText,
    ctaLabel: maps ? "Ouvrir Google Maps" : undefined,
    ctaUrl: maps || undefined,
  });

  return {
    to: process.env.LIL_NOTIFICATION_EMAIL || "hello@selen-editions.fr",
    subject,
    bodyText,
    html: rendered.html,
    text: rendered.text,
  };
}

export const buildExternalAuditReminderEmail = buildLilReminderEmail;

export async function sendExternalAuditReminder(audit: ExternalAuditRow) {
  const email = buildLilReminderEmail(audit);
  return sendSelenEmail({
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });
}
