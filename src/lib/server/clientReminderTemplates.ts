import { getVitrineClientUrl } from "@/lib/vitrineLinks";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";

export type ClientReminderType =
  | "preaudit_incomplete_15_days"
  | "audit_blanc_booking_reminder_7_days"
  | "audit_blanc_48h_reminder"
  | "nda_inactive_9_days";

export type ReminderTemplateInput = {
  clientName?: string | null;
  clientEmail: string;
  dossierId?: string | null;
  dossierTitle?: string | null;
  dossierType?: string | null;
  currentStep?: string | null;
  expectedAction?: string | null;
  appointmentAt?: string | null;
  meetingUrl?: string | null;
};

function greeting(name?: string | null) {
  const clean = name?.trim();
  return clean ? `Bonjour ${clean},` : "Bonjour,";
}

function formatAppointment(value?: string | null) {
  if (!value) return "votre rendez-vous";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export function buildReminderTemplate(
  type: ClientReminderType,
  input: ReminderTemplateInput,
) {
  const clientUrl = getVitrineClientUrl(
    input.dossierType || "nda",
    input.dossierId || "",
  );

  if (type === "preaudit_incomplete_15_days") {
    const bodyText = [
      greeting(input.clientName),
      "Votre préaudit Qualiopi est encore disponible dans votre espace client Selen.",
      "Il n'est pas encore terminé. Vous pouvez reprendre vos réponses à votre rythme tant que votre période d'accès est active.",
      "Une fois finalisé, vous pourrez consulter votre synthèse et vos résultats depuis votre espace client.",
    ].join("\n\n");

    return {
      subject: "Votre préaudit Qualiopi vous attend",
      ...renderSelenEmailFromText({
        title: "Votre préaudit Qualiopi vous attend",
        bodyText,
        ctaLabel: "Reprendre mon préaudit",
        ctaUrl: clientUrl,
      }),
    };
  }

  if (type === "audit_blanc_booking_reminder_7_days") {
    const bodyText = [
      greeting(input.clientName),
      "Votre audit blanc Selen Review est prêt à être planifié.",
      "Pour avancer sereinement, nous vous invitons à choisir votre rendez-vous depuis votre espace client.",
      "Le rendez-vous est organisé côté Vitrine : Studio sert uniquement au suivi par l'agent.",
    ].join("\n\n");

    return {
      subject: "Planifiez votre audit blanc Selen Review",
      ...renderSelenEmailFromText({
        title: "Planifiez votre audit blanc Selen Review",
        bodyText,
        ctaLabel: "Choisir mon rendez-vous",
        ctaUrl: getVitrineClientUrl("review", input.dossierId || ""),
      }),
    };
  }

  if (type === "audit_blanc_48h_reminder") {
    const appointmentLabel = formatAppointment(input.appointmentAt);
    const meetLine = input.meetingUrl
      ? `Lien Google Meet : ${input.meetingUrl}`
      : "Le lien Google Meet sera visible dans votre espace client s'il a été renseigné.";
    const bodyText = [
      greeting(input.clientName),
      `Votre audit blanc Selen Review est prévu le ${appointmentLabel}.`,
      "Le rendez-vous se déroule en visioconférence.",
      "Avant l'appel, pensez à vérifier votre caméra et votre micro.",
      "Préparez vos documents au format numérique et prévoyez de les partager à l'écran pendant l'échange.",
      meetLine,
    ].join("\n\n");

    return {
      subject: "Rappel : votre audit blanc approche",
      ...renderSelenEmailFromText({
        title: "Votre audit blanc approche",
        bodyText,
        ctaLabel: "Ouvrir mon espace client",
        ctaUrl: getVitrineClientUrl("review", input.dossierId || ""),
      }),
    };
  }

  const bodyText = [
    greeting(input.clientName),
    `Votre dossier ${input.dossierTitle || "NDA"} est en cours côté Selen.`,
    `Étape actuelle : ${input.currentStep || "suivi du dossier"}.`,
    `Ce qui est attendu : ${input.expectedAction || "consulter votre espace client et réaliser l'action demandée"}.`,
    "Vous pouvez reprendre votre dossier depuis votre espace client.",
  ].join("\n\n");

  return {
    subject: "Votre dossier Selen attend votre action",
    ...renderSelenEmailFromText({
      title: "Votre dossier Selen attend votre action",
      bodyText,
      ctaLabel: "Ouvrir mon espace client",
      ctaUrl: clientUrl,
    }),
  };
}

