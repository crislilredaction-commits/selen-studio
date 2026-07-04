import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";
import { renderSelenEmailFromText, sendSelenEmail } from "@/lib/server/selenEmailLayout";
import {
  DAILY_BENEFICIARY_NEED_QUESTIONS,
  DAILY_COMPANY_NEED_QUESTIONS,
  DAILY_POSITIONING_QUESTIONS,
} from "@/lib/dailyRegistrationConfig";
import { buildDailyConventionDocumentHtml } from "@/lib/server/dailyConventionDocumentHtml";
import { buildDailyConvocationDocumentHtml } from "@/lib/server/dailyConvocationDocumentHtml";

type PageProps = { params: Promise<{ id: string }> };
type JsonRecord = Record<string, unknown>;
type DailySessionRow = {
  id: string;
  user_id: string;
  registration_token: string | null;
  registration_status: string | null;
  registration_summary: JsonRecord | null;
  adaptation_needed: boolean | null;
  individual_beneficiaries: unknown;
  companies: unknown;
  beneficiaries: unknown;
  trainer_ids?: unknown;
  modality: string | null;
  distance_mode?: string | null;
  schedule_blocks: unknown;
  location_address: string | null;
  remote_url: string | null;
  daily_formations?: {
    id?: string | null;
    title?: string | null;
    status?: string | null;
    global_objective?: string | null;
    target_audience?: string | null;
    prerequisites?: string | null;
    duration_hours?: number | string | null;
    duration_days?: number | string | null;
    modality_details?: string | null;
    price?: string | null;
    pedagogical_resources?: string | null;
    evaluation_methods?: string | null;
    accessibility?: string | null;
    positioning_mode?: string | null;
    positioning_questions?: unknown;
  } | null;
};
type DailyRegistrationResponse = {
  id: string;
  response_type: string | null;
  respondent_first_name: string | null;
  respondent_last_name: string | null;
  respondent_email: string | null;
  company_name: string | null;
  need_answers: JsonRecord | null;
  positioning_answers: JsonRecord | null;
  participants: unknown;
};
type Participant = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};
type Company = {
  name?: string | null;
  email?: string | null;
  address?: string | null;
  siret?: string | null;
  phone?: string | null;
  participants?: Participant[] | null;
};
type DailyTrainer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};
type DailyRecipient = {
  id: string;
  session_id: string;
  recipient_type: "beneficiary" | "company" | "client_contact";
  recipient_key: string;
  recipient_name: string | null;
  recipient_email: string | null;
  company_name: string | null;
  public_path: string | null;
  status: "pending" | "sent" | "error" | "skipped";
  last_error: string | null;
  sent_at: string | null;
  last_attempt_at: string | null;
  resend_count: number;
  metadata?: JsonRecord | null;
};
type DailyOnboarding = {
  platform_contact_first_name: string | null;
  platform_contact_last_name: string | null;
  platform_contact_email: string | null;
  organisation_name: string | null;
  address?: string | null;
  siret?: string | null;
  nda_number?: string | null;
  organisation_logo_url?: string | null;
};
type DailyRegistrationReview = {
  id: string;
  session_id: string;
  prerequisites_expected: string | null;
  beneficiary_elements: string | null;
  prerequisites_validated: boolean | null;
  prerequisites_comment: string | null;
  positioning_result: string | null;
  starting_level: string | null;
  adaptation_required: boolean | null;
  adaptation_details: string | null;
  decision: "maintained" | "adapted" | "redirected" | null;
  justification: string | null;
  validated_at: string | null;
  evaluator_name: string | null;
};
type DailyConvention = {
  id: string;
  recipient_type: "beneficiary" | "company";
  recipient_key: string;
  recipient_name: string | null;
  recipient_email: string | null;
  company_name: string | null;
  version: number;
  document_name: string;
  storage_path: string;
  status: string;
  generated_at: string;
};
type DailyConventionSignature = {
  id: string;
  convention_id: string;
  signatory_type: "organisme" | "entreprise" | "beneficiaire";
  signatory_name: string | null;
  signatory_email: string | null;
  token: string;
  status: "pending" | "viewed" | "signed" | "expired" | "error";
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  proof_hash: string | null;
};
type DailyPortalAccess = {
  id: string;
  portal_type: "learner" | "enterprise" | "trainer";
  entity_key: string;
  entity_name: string | null;
  entity_email: string | null;
  token: string;
  status: "pending" | "viewed" | "expired";
  viewed_at: string | null;
  expires_at: string | null;
};
type DailyConvocation = {
  id: string;
  recipient_type: "beneficiary" | "company" | "trainer";
  recipient_key: string;
  recipient_name: string | null;
  recipient_email: string | null;
  company_name: string | null;
  version: number;
  document_name: string;
  storage_path: string;
  status: "generated" | "sent" | "viewed" | "archived";
  sent_at: string | null;
  viewed_at: string | null;
  last_error: string | null;
  generated_at: string;
};

function registrationStatusLabel(status?: string | null) {
  if (status === "to_prepare") return "À préparer";
  if (status === "to_review") return "À vérifier";
  if (status === "ready_to_send") return "Prêt à envoyer";
  if (status === "sent") return "Envoyé";
  if (status === "responses_received") return "Réponses reçues";
  if (status === "summary_to_review") return "Synthèse à relire";
  if (status === "summary_validated") return "Synthèse validée";
  return "À préparer";
}

function recipientStatusLabel(status?: string | null) {
  if (status === "sent") return "envoyé";
  if (status === "error") return "erreur";
  if (status === "skipped") return "non envoyé";
  return "en attente";
}

function count(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function asParticipants(value: unknown): Participant[] {
  return Array.isArray(value) ? (value as Participant[]) : [];
}

function asCompanies(value: unknown): Company[] {
  return Array.isArray(value) ? (value as Company[]) : [];
}

function fullName(first?: string | null, last?: string | null) {
  return [first, last].map((value) => value?.trim()).filter(Boolean).join(" ");
}

function normalizedEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function signatureToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function portalToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function publicSignatureUrl(token: string) {
  return `${getVitrineBaseUrl()}/daily-signature/${token}`;
}

function publicPortalUrl(type: "learner" | "enterprise" | "trainer", token: string) {
  const role = type === "learner" ? "apprenant" : type === "enterprise" ? "entreprise" : "formateur";
  return `${getVitrineBaseUrl()}/daily/portail/${role}/${token}`;
}

function publicConvocationUrl(id: string) {
  return `${getVitrineBaseUrl()}/api/client/daily/convocations/download?id=${id}`;
}

function signatureStatusLabel(status?: string | null) {
  if (status === "signed") return "signee";
  if (status === "viewed") return "consultee";
  if (status === "expired") return "expiree";
  if (status === "error") return "erreur";
  return "a signer";
}

function formText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function formBoolean(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function formatSummaryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(formatSummaryValue).filter(Boolean).join("\n") || "Aucun element";
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key.replaceAll("_", " ")} : ${formatSummaryValue(entry)}`)
      .join("\n") || "Aucun element";
  }
  return String(value ?? "").trim() || "Aucun element";
}

function buildPublicUrl(path?: string | null) {
  if (!path) return "";
  return `${getVitrineBaseUrl()}${path}`;
}

function metadataText(recipient: DailyRecipient, key: string) {
  return String(recipient.metadata?.[key] ?? "").trim();
}

function recipientPhone(recipient: DailyRecipient) {
  const participant = recipient.metadata?.participant;
  const company = recipient.metadata?.company;
  if (participant && typeof participant === "object") {
    return String((participant as JsonRecord).phone ?? "").trim();
  }
  if (company && typeof company === "object") {
    return String((company as JsonRecord).phone ?? "").trim();
  }
  return "";
}

function responseText(response: DailyRegistrationResponse | null, key: string) {
  return String(response?.need_answers?.[key] ?? "").trim();
}

function scheduleText(value: unknown) {
  if (!Array.isArray(value)) return "Non renseigne";
  return value
    .map((block) => {
      const row = block && typeof block === "object" ? block as JsonRecord : {};
      return [row.date, row.start && row.end ? `${row.start}-${row.end}` : "", row.note]
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean)
    .join("\n") || "Non renseigne";
}

function sessionLocation(session: DailySessionRow) {
  return [session.location_address, session.remote_url].map((value) => value?.trim()).filter(Boolean).join("\n") || "Non renseigne";
}

function usefulRegistrationInfo(response: DailyRegistrationResponse | null) {
  if (!response?.need_answers) return "Aucune information d'inscription transmise.";
  return [
    ["Besoin exprime", responseText(response, "expressed_need")],
    ["Objectif", responseText(response, "objective") || responseText(response, "employee_objectives")],
    ["Contraintes", responseText(response, "constraints")],
    ["Adaptations", responseText(response, "adaptation_details") || responseText(response, "company_adaptation_details")],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} : ${value}`)
    .join("\n") || "Aucune information d'inscription transmise.";
}

function responseForRecipient(
  recipient: Pick<DailyRecipient, "recipient_type" | "recipient_email" | "company_name">,
  responses: DailyRegistrationResponse[],
) {
  const email = normalizedEmail(recipient.recipient_email);
  const companyName = recipient.company_name?.trim().toLowerCase();
  return responses.find((item) => {
    if (email && normalizedEmail(item.respondent_email) === email) return true;
    return recipient.recipient_type === "company" &&
      Boolean(companyName) &&
      item.company_name?.trim().toLowerCase() === companyName;
  }) ?? null;
}

function recipientCompleted(recipient: DailyRecipient, responses: DailyRegistrationResponse[]) {
  if (recipient.recipient_type === "beneficiary") {
    const email = normalizedEmail(recipient.recipient_email);
    return responses.some(
      (response) =>
        response.response_type === "beneficiary" &&
        email &&
        normalizedEmail(response.respondent_email) === email,
    );
  }
  if (recipient.recipient_type === "company") {
    const email = normalizedEmail(recipient.recipient_email);
    const companyName = recipient.company_name?.trim().toLowerCase();
    return responses.some(
      (response) =>
        response.response_type === "company" &&
        ((email && normalizedEmail(response.respondent_email) === email) ||
          (companyName && response.company_name?.trim().toLowerCase() === companyName)),
    );
  }
  return true;
}

function daysSince(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}

function buildIncompleteReminderRows(recipients: DailyRecipient[], responses: DailyRegistrationResponse[]) {
  return recipients
    .filter((recipient) => recipient.recipient_type !== "client_contact")
    .filter((recipient) => recipient.status === "sent" && recipient.sent_at)
    .filter((recipient) => !recipientCompleted(recipient, responses))
    .map((recipient) => {
      const age = daysSince(recipient.sent_at ?? "");
      return {
        recipient,
        age,
        level: age >= 10 ? "phone" : age >= 7 ? "email" : "none",
      };
    })
    .filter((row) => row.level !== "none");
}

function recipientProgressLabel(recipient: DailyRecipient, responses: DailyRegistrationResponse[]) {
  if (recipient.recipient_type === "client_contact") return "Notification client";
  if (recipientCompleted(recipient, responses)) return "Dossier complete";
  if (recipient.status !== "sent" || !recipient.sent_at) return "Dossier non envoye";
  const age = daysSince(recipient.sent_at);
  if (age >= 10) return "Relance telephone J+10 recommandee";
  if (age >= 7) return "Relance J+7 a faire";
  return "Dossier envoye";
}

function responsePhoneForRecipient(recipient: DailyRecipient, responses: DailyRegistrationResponse[]) {
  const email = normalizedEmail(recipient.recipient_email);
  const response = responses.find((item) => email && normalizedEmail(item.respondent_email) === email);
  if (!response) return recipientPhone(recipient);
  return responseText(response, "phone") ||
    responseText(response, "admin_contact_phone") ||
    responseText(response, "training_contact_phone") ||
    recipientPhone(recipient);
}

function buildRecipientDefinitions(session: DailySessionRow, onboarding: DailyOnboarding | null) {
  const token = session.registration_token;
  const beneficiaryPath = token ? `/daily-inscription/${token}?type=beneficiary` : null;
  const companyPath = token ? `/daily-inscription/${token}?type=company` : null;
  const organisationName = onboarding?.organisation_name?.trim() || "votre organisme de formation";
  const beneficiaries = [
    ...asParticipants(session.individual_beneficiaries),
    ...asParticipants(session.beneficiaries),
  ];

  const beneficiaryRecipients = beneficiaries.map((participant, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    recipient_type: "beneficiary",
    recipient_key: normalizedEmail(participant.email) || `beneficiary_${index + 1}`,
    recipient_name: fullName(participant.first_name, participant.last_name) || null,
    recipient_email: normalizedEmail(participant.email) || null,
    company_name: null,
    public_path: beneficiaryPath,
    metadata: { participant, organisation_name: organisationName },
  }));

  const companyRecipients = asCompanies(session.companies).map((company, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    recipient_type: "company",
    recipient_key: normalizedEmail(company.email) || `company_${index + 1}`,
    recipient_name: company.name?.trim() || null,
    recipient_email: normalizedEmail(company.email) || null,
    company_name: company.name?.trim() || null,
    public_path: companyPath,
    metadata: { company, organisation_name: organisationName },
  }));

  const contactEmail = normalizedEmail(onboarding?.platform_contact_email);
  const contactRecipient = contactEmail
    ? [{
        session_id: session.id,
        user_id: session.user_id,
        recipient_type: "client_contact",
        recipient_key: contactEmail,
        recipient_name: fullName(onboarding?.platform_contact_first_name, onboarding?.platform_contact_last_name) || onboarding?.organisation_name || null,
        recipient_email: contactEmail,
        company_name: onboarding?.organisation_name ?? null,
        public_path: null,
        metadata: { contact: true, organisation_name: organisationName },
      }]
    : [];

  return [...beneficiaryRecipients, ...companyRecipients, ...contactRecipient] as Array<{
    session_id: string;
    user_id: string;
    recipient_type: "beneficiary" | "company" | "client_contact";
    recipient_key: string;
    recipient_name: string | null;
    recipient_email: string | null;
    company_name: string | null;
    public_path: string | null;
    metadata: Record<string, unknown>;
  }>;
}

function buildPortalDefinitions(session: DailySessionRow, trainers: DailyTrainer[]) {
  const beneficiaries = [
    ...asParticipants(session.individual_beneficiaries),
    ...asParticipants(session.beneficiaries),
  ];
  const trainerIds = Array.isArray(session.trainer_ids) ? session.trainer_ids.map(String) : [];

  const learnerPortals = beneficiaries.map((participant, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    portal_type: "learner" as const,
    entity_key: normalizedEmail(participant.email) || `learner_${index + 1}`,
    entity_name: fullName(participant.first_name, participant.last_name) || null,
    entity_email: normalizedEmail(participant.email) || null,
    metadata: { participant },
  }));

  const enterprisePortals = asCompanies(session.companies).map((company, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    portal_type: "enterprise" as const,
    entity_key: normalizedEmail(company.email) || company.name?.trim().toLowerCase() || `enterprise_${index + 1}`,
    entity_name: company.name?.trim() || null,
    entity_email: normalizedEmail(company.email) || null,
    metadata: { company },
  }));

  const trainerPortals = trainers
    .filter((trainer) => trainerIds.length === 0 || trainerIds.includes(trainer.id))
    .map((trainer, index) => ({
      session_id: session.id,
      user_id: session.user_id,
      portal_type: "trainer" as const,
      entity_key: trainer.id || normalizedEmail(trainer.email) || `trainer_${index + 1}`,
      entity_name: fullName(trainer.first_name, trainer.last_name) || null,
      entity_email: normalizedEmail(trainer.email) || null,
      metadata: { trainer_id: trainer.id },
    }));

  return [...learnerPortals, ...enterprisePortals, ...trainerPortals];
}

function buildConvocationDefinitions(session: DailySessionRow, trainers: DailyTrainer[]) {
  const beneficiaries = [
    ...asParticipants(session.individual_beneficiaries),
    ...asParticipants(session.beneficiaries),
  ];
  const trainerIds = Array.isArray(session.trainer_ids) ? session.trainer_ids.map(String) : [];

  return [
    ...beneficiaries.map((participant, index) => ({
      recipient_type: "beneficiary" as const,
      recipient_key: normalizedEmail(participant.email) || `beneficiary_${index + 1}`,
      recipient_name: fullName(participant.first_name, participant.last_name) || null,
      recipient_email: normalizedEmail(participant.email) || null,
      company_name: null,
      beneficiary_name: fullName(participant.first_name, participant.last_name) || null,
    })),
    ...asCompanies(session.companies).map((company, index) => ({
      recipient_type: "company" as const,
      recipient_key: normalizedEmail(company.email) || company.name?.trim().toLowerCase() || `company_${index + 1}`,
      recipient_name: company.name?.trim() || null,
      recipient_email: normalizedEmail(company.email) || null,
      company_name: company.name?.trim() || null,
      beneficiary_name: "",
    })),
    ...trainers
      .filter((trainer) => trainerIds.length === 0 || trainerIds.includes(trainer.id))
      .map((trainer, index) => ({
        recipient_type: "trainer" as const,
        recipient_key: trainer.id || normalizedEmail(trainer.email) || `trainer_${index + 1}`,
        recipient_name: fullName(trainer.first_name, trainer.last_name) || null,
        recipient_email: normalizedEmail(trainer.email) || null,
        company_name: null,
        beneficiary_name: "",
      })),
  ];
}

async function upsertRecipients(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  session: DailySessionRow,
  onboarding: DailyOnboarding | null,
) {
  const definitions = buildRecipientDefinitions(session, onboarding);
  if (definitions.length > 0) {
    const { error } = await admin
      .from("daily_registration_recipients")
      .upsert(definitions, { onConflict: "session_id,recipient_type,recipient_key" });
    if (error) throw new Error(error.message);
  }

  const { data, error } = await admin
    .from("daily_registration_recipients")
    .select("*")
    .eq("session_id", session.id)
    .order("recipient_type", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as DailyRecipient[];
}

function renderRegistrationEmail(session: DailySessionRow, recipient: DailyRecipient) {
  const isCompany = recipient.recipient_type === "company";
  const organisationName = metadataText(recipient, "organisation_name") || "votre organisme de formation";
  const title = isCompany
    ? "Votre dossier entreprise Selen Daily"
    : "Votre dossier d'inscription Selen Daily";
  const url = buildPublicUrl(recipient.public_path);
  const bodyText = [
    `Bonjour${recipient.recipient_name ? ` ${recipient.recipient_name}` : ""},`,
    "",
    isCompany
      ? `Nous vous contactons de la part de ${organisationName}.\n\nSelen accompagne ${organisationName} dans le suivi administratif de ses formations. A sa demande, nous vous transmettons le dossier entreprise a completer pour preparer l'inscription des participants.`
      : `Nous vous contactons de la part de ${organisationName}.\n\nSelen accompagne ${organisationName} dans le suivi administratif de ses formations. A sa demande, nous vous transmettons le dossier d'inscription a completer pour preparer votre entree en formation.`,
    "",
    `Formation : ${session.daily_formations?.title ?? "Selen Daily"}`,
    "",
    "Ce dossier permet de verifier les informations necessaires, d'analyser les besoins et, le cas echeant, d'identifier les adaptations utiles.",
    "",
    "Attention : tant que le dossier n'est pas complete, l'inscription ne peut pas etre garantie.",
    "",
    "Vous pouvez completer votre dossier ici :",
    url,
    "",
    "Merci et a bientot,",
    "L'equipe Selen",
  ].join("\n");

  return renderSelenEmailFromText({
    title,
    bodyText,
    ctaLabel: "Compléter mon dossier",
    ctaUrl: url,
  });
}

function renderContactSummaryEmail({
  session,
  sent,
  skipped,
  errors,
}: {
  session: DailySessionRow;
  sent: DailyRecipient[];
  skipped: DailyRecipient[];
  errors: DailyRecipient[];
}) {
  const bodyText = [
    "Bonjour,",
    "",
    `Selen a traité l'envoi des dossiers d'inscription pour la session : ${session.daily_formations?.title ?? "Selen Daily"}.`,
    "",
    `Dossiers envoyés : ${sent.length}`,
    ...sent.map((recipient) => `- ${recipient.recipient_name || recipient.recipient_email || recipient.recipient_key}`),
    "",
    `Dossiers non envoyés : ${skipped.length}`,
    ...skipped.map((recipient) => `- ${recipient.recipient_name || recipient.company_name || recipient.recipient_key} : ${recipient.last_error || "email manquant"}`),
    "",
    `Erreurs éventuelles : ${errors.length}`,
    ...errors.map((recipient) => `- ${recipient.recipient_name || recipient.recipient_email || recipient.recipient_key} : ${recipient.last_error || "erreur inconnue"}`),
  ].join("\n");

  return renderSelenEmailFromText({
    title: "Récapitulatif des dossiers Selen Daily",
    bodyText,
  });
}

async function sendOneRecipient(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  session: DailySessionRow,
  recipient: DailyRecipient,
  forceResend: boolean,
) {
  const now = new Date().toISOString();

  if (recipient.recipient_type === "client_contact") return recipient;
  if (recipient.status === "sent" && !forceResend) return recipient;

  if (!recipient.recipient_email) {
    const { data, error } = await admin
      .from("daily_registration_recipients")
      .update({
        status: "skipped",
        last_error: "Email manquant.",
        last_attempt_at: now,
      })
      .eq("id", recipient.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as DailyRecipient;
  }

  const email = renderRegistrationEmail(session, recipient);
  const result = await sendSelenEmail({
    to: recipient.recipient_email,
    subject: session.daily_formations?.title
      ? `Votre dossier d'inscription - ${session.daily_formations.title}`
      : "Votre dossier d'inscription Selen Daily",
    html: email.html,
    text: email.text,
  });

  const { data, error } = await admin
    .from("daily_registration_recipients")
    .update({
      status: result.sent ? "sent" : "error",
      last_error: result.sent ? null : result.error,
      sent_at: result.sent ? now : recipient.sent_at,
      last_attempt_at: now,
      resend_count: forceResend ? recipient.resend_count + 1 : recipient.resend_count,
    })
    .eq("id", recipient.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as DailyRecipient;
}

async function notifyClientContact(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  session: DailySessionRow,
  contact: DailyRecipient | null,
  processed: DailyRecipient[],
) {
  if (!contact?.recipient_email) return null;

  const sent = processed.filter((recipient) => recipient.status === "sent");
  const skipped = processed.filter((recipient) => recipient.status === "skipped");
  const errors = processed.filter((recipient) => recipient.status === "error");
  const email = renderContactSummaryEmail({ session, sent, skipped, errors });
  const result = await sendSelenEmail({
    to: contact.recipient_email,
    subject: `Récapitulatif des dossiers envoyés - ${session.daily_formations?.title ?? "Selen Daily"}`,
    html: email.html,
    text: email.text,
  });

  const { data, error } = await admin
    .from("daily_registration_recipients")
    .update({
      status: result.sent ? "sent" : "error",
      last_error: result.sent ? null : result.error,
      sent_at: result.sent ? new Date().toISOString() : contact.sent_at,
      last_attempt_at: new Date().toISOString(),
      resend_count: contact.status === "sent" ? contact.resend_count + 1 : contact.resend_count,
    })
    .eq("id", contact.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as DailyRecipient;
}

async function sendRegistrationDossiers(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = String(formData.get("id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  const recipientId = String(formData.get("recipient_id") ?? "").trim();
  const resendConfirmed = String(formData.get("confirm_resend") ?? "") === "on";
  const now = new Date().toISOString();

  if (!id) throw new Error("Session Daily introuvable.");
  const admin = createSupabaseAdminClient();

  if (action === "send" || action === "retry") {
    const { data: rawSession, error: sessionError } = await admin
      .from("daily_sessions")
      .select("*, daily_formations(id,title,status,global_objective,target_audience,positioning_mode,positioning_questions)")
      .eq("id", id)
      .maybeSingle();
    if (sessionError) throw new Error(sessionError.message);
    const session = rawSession as unknown as DailySessionRow | null;
    if (!session) throw new Error("Session Daily introuvable.");
    if (!session.registration_token) throw new Error("Lien d'inscription manquant.");
    if (!["ready_to_send", "sent"].includes(session.registration_status ?? "")) {
      throw new Error("Marquez le dossier prêt à envoyer avant l'envoi.");
    }
    if (action === "retry" && (!recipientId || !resendConfirmed)) {
      throw new Error("Confirmez explicitement le renvoi du dossier.");
    }

    const { data: onboarding } = await admin
      .from("daily_onboarding")
      .select("platform_contact_first_name,platform_contact_last_name,platform_contact_email,organisation_name")
      .eq("user_id", session.user_id)
      .maybeSingle();

    const recipients = await upsertRecipients(admin, session, (onboarding as DailyOnboarding | null) ?? null);
    const contact = recipients.find((recipient) => recipient.recipient_type === "client_contact") ?? null;
    const candidates =
      action === "retry"
        ? recipients.filter((recipient) => recipient.id === recipientId)
        : recipients.filter(
            (recipient) =>
              recipient.recipient_type !== "client_contact" &&
              recipient.status !== "sent",
          );

    const processed: DailyRecipient[] = [];
    for (const recipient of candidates) {
      processed.push(await sendOneRecipient(admin, session, recipient, action === "retry"));
    }

    if (processed.length > 0) {
      await notifyClientContact(admin, session, contact, processed);
    }

    const finalRecipients = await admin
      .from("daily_registration_recipients")
      .select("status")
      .eq("session_id", id)
      .neq("recipient_type", "client_contact");

    const statuses = (finalRecipients.data ?? []).map((row) => row.status);
    const hasSent = statuses.includes("sent");
    const hasPending = statuses.some((status) => status === "pending" || status === "error");

    await admin
      .from("daily_sessions")
      .update({
        registration_status: hasSent && !hasPending ? "sent" : "ready_to_send",
        registration_sent_at: hasSent ? now : null,
      })
      .eq("id", id);

    revalidatePath(`/agent/daily/sessions/${id}`);
    revalidatePath("/agent/daily");
    return;
  }

  const patch =
    action === "ready"
      ? { registration_status: "ready_to_send", registration_prepared_at: now }
      : action === "summary_validated"
          ? { registration_status: "summary_validated", registration_summary_validated_at: now }
          : null;

  if (!id || !patch) throw new Error("Action Daily invalide.");

  const { error } = await admin.from("daily_sessions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function saveRegistrationReview(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  if (!id) throw new Error("Session Daily introuvable.");

  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,user_id")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error("Session Daily introuvable.");

  const adaptationRequired = formBoolean(formData, "adaptation_required");
  const validatedAt = formText(formData, "validated_at");
  const decision = formText(formData, "decision");

  const { error } = await admin
    .from("daily_registration_reviews")
    .upsert(
      {
        session_id: session.id,
        user_id: session.user_id,
        prerequisites_expected: formText(formData, "prerequisites_expected"),
        beneficiary_elements: formText(formData, "beneficiary_elements"),
        prerequisites_validated: formBoolean(formData, "prerequisites_validated"),
        prerequisites_comment: formText(formData, "prerequisites_comment"),
        positioning_result: formText(formData, "positioning_result"),
        starting_level: formText(formData, "starting_level"),
        adaptation_required: adaptationRequired ?? false,
        adaptation_details: formText(formData, "adaptation_details"),
        decision: decision || null,
        justification: formText(formData, "justification"),
        validated_at: validatedAt ? new Date(validatedAt).toISOString() : null,
        evaluator_name: formText(formData, "evaluator_name"),
      },
      { onConflict: "session_id" },
    );
  if (error) throw new Error(error.message);

  if (adaptationRequired === true) {
    await admin.from("daily_sessions").update({ adaptation_needed: true }).eq("id", session.id);
  }

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function generateDailyConvention(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  const recipientType = formText(formData, "recipient_type");
  const recipientKey = formText(formData, "recipient_key");
  if (!id || !recipientType || !recipientKey) throw new Error("Contexte convention incomplet.");
  if (recipientType !== "beneficiary" && recipientType !== "company") throw new Error("Type de convention Daily invalide.");

  const admin = createSupabaseAdminClient();
  const { data: rawSession, error: sessionError } = await admin
    .from("daily_sessions")
    .select("*, daily_formations(*)")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  const session = rawSession as unknown as DailySessionRow | null;
  if (!session) throw new Error("Session Daily introuvable.");

  const [{ data: onboarding }, { data: responses }, { data: latest }] = await Promise.all([
    admin
      .from("daily_onboarding")
      .select("organisation_name,address,siret,nda_number,platform_contact_first_name,platform_contact_last_name,platform_contact_email")
      .eq("user_id", session.user_id)
      .maybeSingle(),
    admin
      .from("daily_registration_responses")
      .select("*")
      .eq("session_id", id),
    admin
      .from("daily_conventions")
      .select("version")
      .eq("session_id", id)
      .eq("recipient_type", recipientType)
      .eq("recipient_key", recipientKey)
      .order("version", { ascending: false })
      .limit(1),
  ]);

  const responseRows = (responses ?? []) as DailyRegistrationResponse[];
  const response = responseRows.find((item) => {
    const email = normalizedEmail(formText(formData, "recipient_email"));
    if (email && normalizedEmail(item.respondent_email) === email) return true;
    return recipientType === "company" && item.company_name?.trim().toLowerCase() === formText(formData, "company_name")?.toLowerCase();
  }) ?? null;

  const version = Number(latest?.[0]?.version ?? 0) + 1;
  const generatedAt = new Date();
  const formation = session.daily_formations;
  const recipientName = formText(formData, "recipient_name") ?? "";
  const companyName = formText(formData, "company_name") ?? "";
  const documentName = `Convention Daily - ${formation?.title ?? "formation"} - ${recipientName || companyName || recipientKey} - v${version}.doc`;
  const storagePath = `generated/daily/${session.user_id}/${session.id}/convention-${recipientType}-${safeFilename(recipientKey)}-v${version}-${generatedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.doc`;

  const html = buildDailyConventionDocumentHtml({
    generatedAt,
    conventionType: recipientType,
    organisationName: formText(formData, "organisation_name") || String(onboarding?.organisation_name ?? ""),
    organisationAddress: formText(formData, "organisation_address") || String(onboarding?.address ?? ""),
    organisationEmail: formText(formData, "organisation_email") || String(onboarding?.platform_contact_email ?? ""),
    organisationPhone: formText(formData, "organisation_phone") || "",
    organisationSiret: formText(formData, "organisation_siret") || String(onboarding?.siret ?? ""),
    organisationNda: formText(formData, "organisation_nda") || String(onboarding?.nda_number ?? ""),
    clientName: formText(formData, "client_name") || companyName || recipientName,
    clientAddress: formText(formData, "client_address") || responseText(response, "company_address"),
    clientSiret: formText(formData, "client_siret") || responseText(response, "company_siret"),
    clientRepresentative: formText(formData, "client_representative") || responseText(response, "admin_contact_name"),
    beneficiaryName: formText(formData, "beneficiary_name") || recipientName,
    beneficiaryEmail: formText(formData, "recipient_email") || "",
    formationTitle: formText(formData, "formation_title") || String(formation?.title ?? ""),
    formationObjective: formText(formData, "formation_objective") || String(formation?.global_objective ?? ""),
    targetAudience: formText(formData, "target_audience") || String(formation?.target_audience ?? ""),
    prerequisites: formText(formData, "prerequisites") || String(formation?.prerequisites ?? ""),
    durationHours: formText(formData, "duration_hours") || String(formation?.duration_hours ?? ""),
    durationDays: formText(formData, "duration_days") || String(formation?.duration_days ?? ""),
    modality: formText(formData, "modality") || String(session.modality ?? ""),
    modalityDetails: formText(formData, "modality_details") || String(formation?.modality_details ?? ""),
    schedule: formText(formData, "schedule") || scheduleText(session.schedule_blocks),
    location: formText(formData, "location") || sessionLocation(session),
    price: formText(formData, "price") || String(formation?.price ?? ""),
    pedagogicalResources: String(formation?.pedagogical_resources ?? ""),
    evaluationMethods: String(formation?.evaluation_methods ?? ""),
    accessibility: String(formation?.accessibility ?? ""),
    usefulRegistrationInfo: usefulRegistrationInfo(response),
    signaturePlace: formText(formData, "signature_place") || "",
    signatureDate: formText(formData, "signature_date") || generatedAt.toLocaleDateString("fr-FR"),
  });

  const upload = await admin.storage.from("documents").upload(storagePath, new TextEncoder().encode(html), {
    contentType: "application/msword; charset=utf-8",
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const { error } = await admin.from("daily_conventions").insert({
    session_id: session.id,
    user_id: session.user_id,
    recipient_type: recipientType,
    recipient_key: recipientKey,
    recipient_name: recipientName || null,
    recipient_email: formText(formData, "recipient_email"),
    company_name: companyName || null,
    version,
    document_name: documentName,
    storage_path: storagePath,
    metadata: { pack: "convention", generated_model: "daily_convention_html_v1" },
    generated_at: generatedAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function prepareDailyConventionSignatureLinks(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  const conventionId = formText(formData, "convention_id");
  if (!id || !conventionId) throw new Error("Convention Daily introuvable.");

  const admin = createSupabaseAdminClient();
  const { data: convention, error: conventionError } = await admin
    .from("daily_conventions")
    .select("*, daily_sessions(id,user_id)")
    .eq("id", conventionId)
    .eq("session_id", id)
    .maybeSingle();
  if (conventionError) throw new Error(conventionError.message);
  if (!convention) throw new Error("Convention Daily introuvable.");

  const { data: onboarding } = await admin
    .from("daily_onboarding")
    .select("organisation_name,platform_contact_first_name,platform_contact_last_name,platform_contact_email")
    .eq("user_id", convention.user_id)
    .maybeSingle();

  const clientName = fullName(onboarding?.platform_contact_first_name, onboarding?.platform_contact_last_name) ||
    String(onboarding?.organisation_name ?? "").trim() ||
    "Organisme de formation";
  const signatories = [
    {
      convention_id: convention.id,
      session_id: convention.session_id,
      user_id: convention.user_id,
      signatory_type: "organisme",
      signatory_name: clientName,
      signatory_email: normalizedEmail(onboarding?.platform_contact_email) || null,
      token: signatureToken(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      metadata: { source: "studio_prepare_links" },
    },
    {
      convention_id: convention.id,
      session_id: convention.session_id,
      user_id: convention.user_id,
      signatory_type: convention.recipient_type === "company" ? "entreprise" : "beneficiaire",
      signatory_name: convention.company_name || convention.recipient_name || null,
      signatory_email: normalizedEmail(convention.recipient_email) || null,
      token: signatureToken(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString(),
      metadata: { source: "studio_prepare_links" },
    },
  ];

  const { error } = await admin
    .from("daily_convention_signatures")
    .upsert(signatories, { onConflict: "convention_id,signatory_type", ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function prepareDailyPortalLinks(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  if (!id) throw new Error("Session Daily introuvable.");

  const admin = createSupabaseAdminClient();
  const { data: rawSession, error: sessionError } = await admin
    .from("daily_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  const session = rawSession as unknown as DailySessionRow | null;
  if (!session) throw new Error("Session Daily introuvable.");

  const { data: trainers, error: trainersError } = await admin
    .from("daily_trainers")
    .select("id,first_name,last_name,email")
    .eq("user_id", session.user_id);
  if (trainersError) throw new Error(trainersError.message);

  const definitions = buildPortalDefinitions(session, (trainers ?? []) as DailyTrainer[]);
  if (definitions.length > 0) {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
    const payload = definitions.map((definition) => ({
      ...definition,
      token: portalToken(),
      expires_at: expiresAt,
    }));
    const { error } = await admin
      .from("daily_portal_access_tokens")
      .upsert(payload, { onConflict: "session_id,portal_type,entity_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function generateDailyConvocation(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  const recipientType = formText(formData, "recipient_type");
  const recipientKey = formText(formData, "recipient_key");
  if (!id || !recipientType || !recipientKey) throw new Error("Contexte convocation incomplet.");

  const admin = createSupabaseAdminClient();
  const [{ data: rawSession, error: sessionError }, { data: onboarding }, { data: trainers }, { data: latest }, { data: templates }] = await Promise.all([
    admin.from("daily_sessions").select("*, daily_formations(*)").eq("id", id).maybeSingle(),
    admin.from("daily_onboarding").select("*").eq("user_id", formText(formData, "user_id")).maybeSingle(),
    admin.from("daily_trainers").select("id,first_name,last_name,email").eq("user_id", formText(formData, "user_id")),
    admin
      .from("daily_convocations")
      .select("version")
      .eq("session_id", id)
      .eq("recipient_type", recipientType)
      .eq("recipient_key", recipientKey)
      .order("version", { ascending: false })
      .limit(1),
    admin
      .from("daily_document_templates")
      .select("*")
      .eq("user_id", formText(formData, "user_id"))
      .eq("document_type", "convocation")
      .eq("status", "active")
      .order("template_source", { ascending: true })
      .limit(1),
  ]);
  if (sessionError) throw new Error(sessionError.message);
  const session = rawSession as unknown as DailySessionRow | null;
  if (!session) throw new Error("Session Daily introuvable.");

  const generatedAt = new Date();
  const version = Number(latest?.[0]?.version ?? 0) + 1;
  const formation = session.daily_formations;
  const recipientName = formText(formData, "recipient_name");
  const companyName = formText(formData, "company_name");
  const recipientEmail = formText(formData, "recipient_email");
  const template = templates?.[0] as JsonRecord | undefined;
  const templateSource = String(template?.template_source ?? "SELEN");
  const templateName = String(template?.template_name ?? "selen_daily_convocation");
  const templateVersion = Number(template?.template_version ?? 1);
  const documentName = `Convocation Daily - ${formation?.title ?? "formation"} - ${recipientName || companyName || recipientKey} - v${version}.doc`;
  const storagePath = `generated/daily/${session.user_id}/${session.id}/convocation-${recipientType}-${safeFilename(recipientKey)}-v${version}-${generatedAt.toISOString().replaceAll(":", "-").replaceAll(".", "-")}.doc`;
  const trainerNames = ((trainers ?? []) as DailyTrainer[]).map((trainer) => fullName(trainer.first_name, trainer.last_name)).filter(Boolean).join(", ");

  const variables = {
    organisation: onboarding,
    formation,
    session: { schedule_blocks: session.schedule_blocks, modality: session.modality, location_address: session.location_address, remote_url: session.remote_url },
    recipient: { recipientType, recipientKey, recipientName, recipientEmail, companyName },
  };
  const html = buildDailyConvocationDocumentHtml({
    generatedAt,
    organisationName: formText(formData, "organisation_name") || String(onboarding?.organisation_name ?? ""),
    organisationAddress: formText(formData, "organisation_address") || String(onboarding?.address ?? ""),
    organisationEmail: formText(formData, "organisation_email") || String(onboarding?.platform_contact_email ?? ""),
    organisationLogoUrl: String(onboarding?.organisation_logo_url ?? ""),
    formationTitle: formText(formData, "formation_title") || String(formation?.title ?? ""),
    durationHours: formText(formData, "duration_hours") || String(formation?.duration_hours ?? ""),
    durationDays: formText(formData, "duration_days") || String(formation?.duration_days ?? ""),
    modality: formText(formData, "modality") || String(session.modality ?? ""),
    modalityDetails: formText(formData, "modality_details") || String(formation?.modality_details ?? ""),
    schedule: formText(formData, "schedule") || scheduleText(session.schedule_blocks),
    location: formText(formData, "location") || sessionLocation(session),
    trainerNames: formText(formData, "trainer_names") || trainerNames,
    recipientType: recipientType as "beneficiary" | "company" | "trainer",
    recipientName: recipientName || "",
    recipientEmail: recipientEmail || "",
    companyName: companyName || "",
    beneficiaryName: formText(formData, "beneficiary_name") || "",
    practicalNotes: formText(formData, "practical_notes") || "",
  });

  const upload = await admin.storage.from("documents").upload(storagePath, new TextEncoder().encode(html), {
    contentType: "application/msword; charset=utf-8",
    upsert: false,
  });
  if (upload.error) throw new Error(upload.error.message);

  const { error } = await admin.from("daily_convocations").insert({
    session_id: session.id,
    user_id: session.user_id,
    recipient_type: recipientType,
    recipient_key: recipientKey,
    recipient_name: recipientName || null,
    recipient_email: recipientEmail || null,
    company_name: companyName || null,
    version,
    document_name: documentName,
    storage_path: storagePath,
    template_source: templateSource,
    template_name: templateName,
    template_version: templateVersion,
    variables,
    metadata: { pack: "convocation", generated_model: "daily_convocation_html_v1" },
    generated_at: generatedAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

async function sendDailyConvocation(formData: FormData) {
  "use server";

  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);

  const id = formText(formData, "id");
  const convocationId = formText(formData, "convocation_id");
  const admin = createSupabaseAdminClient();
  const { data: convocation, error } = await admin
    .from("daily_convocations")
    .select("*, daily_sessions(daily_formations(title)), daily_onboarding:daily_sessions(user_id)")
    .eq("id", convocationId)
    .eq("session_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!convocation) throw new Error("Convocation introuvable.");
  if (!convocation.recipient_email) throw new Error("Email destinataire manquant.");

  const { data: onboarding } = await admin
    .from("daily_onboarding")
    .select("organisation_name")
    .eq("user_id", convocation.user_id)
    .maybeSingle();
  const organisationName = String(onboarding?.organisation_name ?? "l'organisme de formation");
  const email = renderSelenEmailFromText({
    title: "Convocation a la formation",
    bodyText: [
      "Bonjour,",
      "",
      `Nous vous adressons cette convocation a la demande de ${organisationName}.`,
      "",
      `Formation : ${String(convocation.daily_sessions?.daily_formations?.title ?? "Selen Daily")}`,
      "",
      "Vous pouvez consulter et telecharger votre convocation depuis le lien ci-dessous.",
      "",
      "Le Pack Formation complet sera enrichi progressivement avec les informations AF, la politique handicap et les annexes disponibles.",
      "",
      "Merci,",
      "L'equipe Selen",
    ].join("\n"),
    ctaLabel: "Telecharger la convocation",
    ctaUrl: publicConvocationUrl(convocation.id),
  });
  const result = await sendSelenEmail({
    to: convocation.recipient_email,
    subject: `Votre convocation - ${String(convocation.daily_sessions?.daily_formations?.title ?? "Selen Daily")}`,
    html: email.html,
    text: email.text,
  });
  const { error: updateError } = await admin
    .from("daily_convocations")
    .update({
      status: result.sent ? "sent" : "generated",
      sent_at: result.sent ? new Date().toISOString() : convocation.sent_at,
      last_error: result.sent ? null : result.error,
    })
    .eq("id", convocation.id);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/agent/daily/sessions/${id}`);
  revalidatePath("/agent/daily");
}

export default async function AgentDailySessionPage({ params }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [sessionRes, responsesRes, recipientsRes, reviewRes, conventionsRes, signaturesRes, portalLinksRes, convocationsRes] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("*, daily_formations(*)")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("daily_registration_responses")
      .select("*")
      .eq("session_id", id)
      .order("submitted_at", { ascending: false }),
    admin
      .from("daily_registration_recipients")
      .select("*")
      .eq("session_id", id)
      .order("recipient_type", { ascending: true }),
    admin
      .from("daily_registration_reviews")
      .select("*")
      .eq("session_id", id)
      .maybeSingle(),
    admin
      .from("daily_conventions")
      .select("*")
      .eq("session_id", id)
      .order("generated_at", { ascending: false }),
    admin
      .from("daily_convention_signatures")
      .select("*")
      .eq("session_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("daily_portal_access_tokens")
      .select("*")
      .eq("session_id", id)
      .order("portal_type", { ascending: true }),
    admin
      .from("daily_convocations")
      .select("*")
      .eq("session_id", id)
      .order("generated_at", { ascending: false }),
  ]);

  if (sessionRes.error || responsesRes.error || recipientsRes.error || reviewRes.error || conventionsRes.error || signaturesRes.error || portalLinksRes.error || convocationsRes.error) {
    return <main style={s.page}><p style={s.error}>{sessionRes.error?.message ?? responsesRes.error?.message ?? recipientsRes.error?.message ?? reviewRes.error?.message ?? conventionsRes.error?.message ?? signaturesRes.error?.message ?? portalLinksRes.error?.message ?? convocationsRes.error?.message}</p></main>;
  }

  const session = sessionRes.data as unknown as DailySessionRow | null;
  const responses = (responsesRes.data ?? []) as unknown as DailyRegistrationResponse[];
  const storedRecipients = (recipientsRes.data ?? []) as DailyRecipient[];
  const review = reviewRes.data as DailyRegistrationReview | null;
  const conventions = (conventionsRes.data ?? []) as DailyConvention[];
  const signatures = (signaturesRes.data ?? []) as DailyConventionSignature[];
  const portalLinks = (portalLinksRes.data ?? []) as DailyPortalAccess[];
  const convocations = (convocationsRes.data ?? []) as DailyConvocation[];
  if (!session) return <main style={s.page}><p style={s.error}>Session introuvable.</p></main>;

  const [{ data: onboarding }, { data: trainers }] = await Promise.all([
    admin
      .from("daily_onboarding")
      .select("platform_contact_first_name,platform_contact_last_name,platform_contact_email,organisation_name,address,siret,nda_number")
      .eq("user_id", session.user_id)
      .maybeSingle(),
    admin
      .from("daily_trainers")
      .select("id,first_name,last_name,email")
      .eq("user_id", session.user_id),
  ]);

  const previewRecipients = buildRecipientDefinitions(session, (onboarding as DailyOnboarding | null) ?? null).map((definition) => {
    const existing = storedRecipients.find(
      (recipient) =>
        recipient.recipient_type === definition.recipient_type &&
        recipient.recipient_key === definition.recipient_key,
    );
    return existing ?? {
      id: `${definition.recipient_type}_${definition.recipient_key}`,
      session_id: definition.session_id,
      recipient_type: definition.recipient_type,
      recipient_key: definition.recipient_key,
      recipient_name: definition.recipient_name,
      recipient_email: definition.recipient_email,
      company_name: definition.company_name,
      public_path: definition.public_path,
      status: definition.recipient_email ? "pending" : "skipped",
      last_error: definition.recipient_email ? null : "Email manquant.",
      sent_at: null,
      last_attempt_at: null,
      resend_count: 0,
      metadata: definition.metadata,
    } satisfies DailyRecipient;
  });
  const reminderRows = buildIncompleteReminderRows(previewRecipients, responses);
  const conventionRecipients = previewRecipients.filter((recipient) => recipient.recipient_type !== "client_contact");
  const onboardingRow = (onboarding as DailyOnboarding | null) ?? null;
  const portalDefinitions = buildPortalDefinitions(session, (trainers ?? []) as DailyTrainer[]);
  const convocationDefinitions = buildConvocationDefinitions(session, (trainers ?? []) as DailyTrainer[]);

  const registrationUrl = session.registration_token
    ? `/daily-inscription/${session.registration_token}`
    : "Token non généré";
  const summary = session.registration_summary ?? {};
  const summaryRows: Array<[string, unknown]> = [
    ["Synthese beneficiaire", formatSummaryValue(summary.synthese_beneficiaire)],
    ["Synthese entreprise", formatSummaryValue(summary.synthese_entreprise)],
    ["Points communs", summary.points_communs],
    ["Besoins d'adaptation", summary.besoins_adaptation],
    ["Positionnement", formatSummaryValue(summary.positionnement)],
    ["Attentes", summary.attentes],
    ["Motivations", summary.motivations],
    ["Contraintes", summary.contraintes],
    ["Demandes spécifiques", summary.demandes_specifiques],
    ["Adaptations", summary.adaptations],
    ["Points formateur", summary.points_formateur],
  ];

  return (
    <main style={s.page}>
      <Link href="/agent/daily" style={s.back}>← Retour Daily</Link>

      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily</p>
          <h1 style={s.title}>{session.daily_formations?.title ?? "Session Daily"}</h1>
          <p style={s.subtitle}>Dossier d&apos;inscription, analyse du besoin et positionnement.</p>
        </div>
        <div style={s.counter}>
          <strong>{registrationStatusLabel(session.registration_status)}</strong>
          <span>état dossier</span>
        </div>
      </header>

      {session.adaptation_needed ? (
        <section style={{ ...s.card, ...s.alertCard }}>
          <strong>Adaptation à suivre</strong>
          <span>Une réponse signale une situation de handicap, une contrainte forte ou une demande d&apos;adaptation.</span>
          <span>À préparer pour le formateur si un formateur est associé à la session.</span>
        </section>
      ) : null}

      <section style={s.card}>
        <p style={s.badge}>Vue session</p>
        <div style={s.summaryGrid}>
          <p><strong>Formation</strong><span>{session.daily_formations?.status ?? "Statut inconnu"}</span></p>
          <p><strong>Apprenants individuels</strong><span>{count(session.individual_beneficiaries)}</span></p>
          <p><strong>Entreprises</strong><span>{count(session.companies)}</span></p>
          <p><strong>Lien public</strong><span>{registrationUrl}</span></p>
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Dossier généré</p>
        <div style={s.columns}>
          <QuestionList title="Dossier bénéficiaire" items={DAILY_BENEFICIARY_NEED_QUESTIONS} />
          <QuestionList title="Dossier entreprise" items={DAILY_COMPANY_NEED_QUESTIONS} />
          <QuestionList title="Positionnement" items={DAILY_POSITIONING_QUESTIONS} />
          <PositioningQuestionList
            mode={session.daily_formations?.positioning_mode}
            questions={session.daily_formations?.positioning_questions}
          />
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Actions agent</p>
        <form action={sendRegistrationDossiers} style={s.actions}>
          <input type="hidden" name="id" value={session.id} />
          <button name="action" value="ready" style={s.primaryButton}>Marquer prêt à envoyer</button>
          <button name="action" value="send" style={s.secondaryButton}>Envoyer les dossiers</button>
          <button name="action" value="summary_validated" style={s.secondaryButton}>Synthèse validée</button>
        </form>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Destinataires avant envoi</p>
        <div style={s.recipientGrid}>
          {previewRecipients.map((recipient) => (
            <article key={`${recipient.recipient_type}_${recipient.recipient_key}`} style={s.recipientCard}>
              <strong>{recipient.recipient_name || recipient.company_name || recipient.recipient_email || recipient.recipient_key}</strong>
              <span>{recipient.recipient_type === "company" ? "Entreprise" : recipient.recipient_type === "client_contact" ? "Contact client" : "Bénéficiaire"}</span>
              <span>{recipient.recipient_email || "email entreprise manquant"}</span>
              <span>Statut : {recipientStatusLabel(recipient.status)}</span>
              <span>Suivi : {recipientProgressLabel(recipient, responses)}</span>
              {recipient.sent_at ? <span>Envoyé le {new Date(recipient.sent_at).toLocaleString("fr-FR")}</span> : null}
              {recipient.last_error ? <span style={s.error}>{recipient.last_error}</span> : null}
              {recipient.public_path ? <span>{buildPublicUrl(recipient.public_path)}</span> : null}
              {recipient.public_path ? (
                <input readOnly value={buildPublicUrl(recipient.public_path)} style={s.input} />
              ) : null}
              {storedRecipients.some((stored) => stored.id === recipient.id) ? (
                <form action={sendRegistrationDossiers} style={s.retryForm}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="recipient_id" value={recipient.id} />
                  <label style={s.check}>
                    <input type="checkbox" name="confirm_resend" required />
                    Confirmer le renvoi
                  </label>
                  <button name="action" value="retry" style={s.secondaryButton}>
                    Réessayer
                  </button>
                </form>
              ) : null}
            </article>
          ))}
          {previewRecipients.length === 0 ? (
            <p style={s.subtitle}>Aucun destinataire détecté pour cette session.</p>
          ) : null}
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Portails</p>
        <p style={s.subtitle}>
          Liens filtres par role : apprenant, entreprise ou formateur. Aucun email automatique n&apos;est envoye depuis cette action.
        </p>
        <form action={prepareDailyPortalLinks} style={s.actions}>
          <input type="hidden" name="id" value={session.id} />
          <button style={s.primaryButton}>Preparer les liens de portails</button>
        </form>
        <div style={s.recipientGrid}>
          {portalDefinitions.map((definition) => {
            const existing = portalLinks.find(
              (link) =>
                link.portal_type === definition.portal_type &&
                link.entity_key === definition.entity_key,
            );
            return (
              <article key={`${definition.portal_type}_${definition.entity_key}`} style={s.recipientCard}>
                <strong>
                  {definition.portal_type === "learner" ? "Portail apprenant" : definition.portal_type === "enterprise" ? "Portail entreprise" : "Portail formateur"}
                </strong>
                <span>{definition.entity_name || definition.entity_email || definition.entity_key}</span>
                <span>{definition.entity_email || "email non renseigne"}</span>
                <span>
                  Statut : {existing?.status === "viewed" ? "consulte" : existing ? "a transmettre" : "lien non prepare"}
                  {existing?.viewed_at ? ` le ${new Date(existing.viewed_at).toLocaleString("fr-FR")}` : ""}
                </span>
                {existing ? (
                  <input readOnly value={publicPortalUrl(existing.portal_type, existing.token)} style={s.input} />
                ) : null}
              </article>
            );
          })}
          {portalDefinitions.length === 0 ? (
            <p style={s.subtitle}>Aucun apprenant, entreprise ou formateur detecte pour cette session.</p>
          ) : null}
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Conventions</p>
        <p style={s.subtitle}>
          Pack Convention Daily : convention versionnee maintenant, annexes, signature et preuve d&apos;envoi plus tard.
        </p>
        <div style={s.recipientGrid}>
          {conventionRecipients.map((recipient) => {
            const response = responseForRecipient(recipient, responses);
            const history = conventions.filter(
              (convention) =>
                convention.recipient_type === recipient.recipient_type &&
                convention.recipient_key === recipient.recipient_key,
            );
            const companyMeta = recipient.metadata?.company && typeof recipient.metadata.company === "object"
              ? recipient.metadata.company as JsonRecord
              : {};
            const recipientName = recipient.recipient_name || recipient.recipient_email || recipient.recipient_key;
            const companyName = recipient.company_name || String(companyMeta.name ?? "").trim();
            const clientName = recipient.recipient_type === "company" ? companyName : recipientName;

            return (
              <article key={`convention_${recipient.recipient_type}_${recipient.recipient_key}`} style={s.recipientCard}>
                <strong>{recipient.recipient_type === "company" ? "Convention entreprise" : "Convention beneficiaire individuel"}</strong>
                <span>{recipientName}</span>
                <span>{recipient.recipient_email || "email non renseigne"}</span>

                <form action={generateDailyConvention} style={s.reviewForm}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="recipient_type" value={recipient.recipient_type} />
                  <input type="hidden" name="recipient_key" value={recipient.recipient_key} />
                  <div style={s.formGrid}>
                    <label style={s.field}>
                      <span>Organisme de formation</span>
                      <input name="organisation_name" defaultValue={onboardingRow?.organisation_name ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Email organisme</span>
                      <input name="organisation_email" defaultValue={onboardingRow?.platform_contact_email ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Telephone organisme</span>
                      <input name="organisation_phone" defaultValue="" style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>SIRET organisme</span>
                      <input name="organisation_siret" defaultValue={onboardingRow?.siret ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>NDA organisme</span>
                      <input name="organisation_nda" defaultValue={onboardingRow?.nda_number ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Date signature</span>
                      <input name="signature_date" defaultValue={new Date().toLocaleDateString("fr-FR")} style={s.input} />
                    </label>
                  </div>
                  <label style={s.field}>
                    <span>Adresse organisme</span>
                    <textarea name="organisation_address" defaultValue={onboardingRow?.address ?? ""} style={s.textarea} />
                  </label>

                  <div style={s.formGrid}>
                    <label style={s.field}>
                      <span>Client / entreprise</span>
                      <input name="client_name" defaultValue={clientName} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Representant</span>
                      <input name="client_representative" defaultValue={responseText(response, "admin_contact_name")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>SIRET client</span>
                      <input name="client_siret" defaultValue={responseText(response, "company_siret") || String(companyMeta.siret ?? "")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Beneficiaire</span>
                      <input name="beneficiary_name" defaultValue={recipientName} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Email beneficiaire</span>
                      <input name="recipient_email" defaultValue={recipient.recipient_email ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Lieu de signature</span>
                      <input name="signature_place" defaultValue="" style={s.input} />
                    </label>
                  </div>
                  <label style={s.field}>
                    <span>Adresse client</span>
                    <textarea name="client_address" defaultValue={responseText(response, "company_address") || String(companyMeta.address ?? "")} style={s.textarea} />
                  </label>

                  <div style={s.formGrid}>
                    <label style={s.field}>
                      <span>Formation</span>
                      <input name="formation_title" defaultValue={session.daily_formations?.title ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Duree heures</span>
                      <input name="duration_hours" defaultValue={String(session.daily_formations?.duration_hours ?? "")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Duree jours</span>
                      <input name="duration_days" defaultValue={String(session.daily_formations?.duration_days ?? "")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Modalite</span>
                      <input name="modality" defaultValue={session.modality ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Tarif</span>
                      <input name="price" defaultValue={String(session.daily_formations?.price ?? "")} style={s.input} />
                    </label>
                  </div>
                  <label style={s.field}>
                    <span>Objectif</span>
                    <textarea name="formation_objective" defaultValue={session.daily_formations?.global_objective ?? ""} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Public vise</span>
                    <textarea name="target_audience" defaultValue={session.daily_formations?.target_audience ?? ""} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Prerequis</span>
                    <textarea name="prerequisites" defaultValue={session.daily_formations?.prerequisites ?? ""} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Modalites pratiques</span>
                    <textarea name="modality_details" defaultValue={session.daily_formations?.modality_details ?? ""} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Dates et horaires</span>
                    <textarea name="schedule" defaultValue={scheduleText(session.schedule_blocks)} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Lieu / acces</span>
                    <textarea name="location" defaultValue={sessionLocation(session)} style={s.textarea} />
                  </label>
                  <button style={s.primaryButton}>Generer la convention</button>
                </form>

                <div style={s.questionList}>
                  <strong>Historique</strong>
                  {history.map((convention) => {
                    const conventionSignatures = signatures.filter((signature) => signature.convention_id === convention.id);
                    return (
                      <div key={convention.id} style={s.signatureBox}>
                        <a
                          href={`/agent/api/daily/conventions/download?id=${convention.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={s.downloadLink}
                        >
                          v{convention.version} - {new Date(convention.generated_at).toLocaleString("fr-FR")} - convention originale
                        </a>
                        <form action={prepareDailyConventionSignatureLinks} style={s.retryForm}>
                          <input type="hidden" name="id" value={session.id} />
                          <input type="hidden" name="convention_id" value={convention.id} />
                          <button style={s.secondaryButton}>Preparer les liens de signature</button>
                        </form>
                        {conventionSignatures.map((signature) => (
                          <div key={signature.id} style={s.signatureRow}>
                            <span>
                              {signature.signatory_type} : {signatureStatusLabel(signature.status)}
                              {signature.signed_at ? ` le ${new Date(signature.signed_at).toLocaleString("fr-FR")}` : ""}
                            </span>
                            <span>{signature.signatory_name || signature.signatory_email || "Signataire a completer"}</span>
                            {signature.proof_hash ? <span>Preuve : {signature.proof_hash.slice(0, 18)}...</span> : null}
                            <input readOnly value={publicSignatureUrl(signature.token)} style={s.input} />
                          </div>
                        ))}
                        {conventionSignatures.length === 0 ? (
                          <span>Liens de signature non prepares.</span>
                        ) : null}
                      </div>
                    );
                  })}
                  {history.length === 0 ? <span>Non generee.</span> : null}
                </div>
              </article>
            );
          })}
          {conventionRecipients.length === 0 ? (
            <p style={s.subtitle}>Ajoutez au moins un beneficiaire ou une entreprise pour generer une convention.</p>
          ) : null}
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Convocations</p>
        <p style={s.subtitle}>
          Generation avec modele client prioritaire si un modele actif existe, sinon modele Selen. L&apos;envoi reste declenche par l&apos;agent.
        </p>
        <div style={s.recipientGrid}>
          {convocationDefinitions.map((recipient) => {
            const history = convocations.filter(
              (convocation) =>
                convocation.recipient_type === recipient.recipient_type &&
                convocation.recipient_key === recipient.recipient_key,
            );
            return (
              <article key={`convocation_${recipient.recipient_type}_${recipient.recipient_key}`} style={s.recipientCard}>
                <strong>{recipient.recipient_type === "trainer" ? "Convocation formateur" : recipient.recipient_type === "company" ? "Convocation entreprise" : "Convocation beneficiaire"}</strong>
                <span>{recipient.recipient_name || recipient.recipient_email || recipient.recipient_key}</span>
                <span>{recipient.recipient_email || "email non renseigne"}</span>
                <form action={generateDailyConvocation} style={s.reviewForm}>
                  <input type="hidden" name="id" value={session.id} />
                  <input type="hidden" name="user_id" value={session.user_id} />
                  <input type="hidden" name="recipient_type" value={recipient.recipient_type} />
                  <input type="hidden" name="recipient_key" value={recipient.recipient_key} />
                  <div style={s.formGrid}>
                    <label style={s.field}>
                      <span>Organisme</span>
                      <input name="organisation_name" defaultValue={onboardingRow?.organisation_name ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Email organisme</span>
                      <input name="organisation_email" defaultValue={onboardingRow?.platform_contact_email ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Destinataire</span>
                      <input name="recipient_name" defaultValue={recipient.recipient_name ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Email destinataire</span>
                      <input name="recipient_email" defaultValue={recipient.recipient_email ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Entreprise</span>
                      <input name="company_name" defaultValue={recipient.company_name ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Beneficiaire</span>
                      <input name="beneficiary_name" defaultValue={recipient.beneficiary_name ?? ""} style={s.input} />
                    </label>
                  </div>
                  <label style={s.field}>
                    <span>Adresse organisme</span>
                    <textarea name="organisation_address" defaultValue={onboardingRow?.address ?? ""} style={s.textarea} />
                  </label>
                  <div style={s.formGrid}>
                    <label style={s.field}>
                      <span>Formation</span>
                      <input name="formation_title" defaultValue={session.daily_formations?.title ?? ""} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Duree heures</span>
                      <input name="duration_hours" defaultValue={String(session.daily_formations?.duration_hours ?? "")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Duree jours</span>
                      <input name="duration_days" defaultValue={String(session.daily_formations?.duration_days ?? "")} style={s.input} />
                    </label>
                    <label style={s.field}>
                      <span>Modalite</span>
                      <input name="modality" defaultValue={session.modality ?? ""} style={s.input} />
                    </label>
                  </div>
                  <label style={s.field}>
                    <span>Modalites</span>
                    <textarea name="modality_details" defaultValue={session.daily_formations?.modality_details ?? ""} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Dates et horaires</span>
                    <textarea name="schedule" defaultValue={scheduleText(session.schedule_blocks)} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Lieu / lien</span>
                    <textarea name="location" defaultValue={sessionLocation(session)} style={s.textarea} />
                  </label>
                  <label style={s.field}>
                    <span>Formateur</span>
                    <input name="trainer_names" defaultValue={((trainers ?? []) as DailyTrainer[]).map((trainer) => fullName(trainer.first_name, trainer.last_name)).filter(Boolean).join(", ")} style={s.input} />
                  </label>
                  <label style={s.field}>
                    <span>Notes pratiques</span>
                    <textarea name="practical_notes" defaultValue="" style={s.textarea} />
                  </label>
                  <button style={s.primaryButton}>Generer la convocation</button>
                </form>
                <div style={s.questionList}>
                  <strong>Historique</strong>
                  {history.map((convocation) => (
                    <div key={convocation.id} style={s.signatureBox}>
                      <a href={`/agent/api/daily/convocations/download?id=${convocation.id}`} target="_blank" rel="noreferrer" style={s.downloadLink}>
                        v{convocation.version} - {new Date(convocation.generated_at).toLocaleString("fr-FR")} - telecharger
                      </a>
                      <span>Statut : {convocation.status}{convocation.sent_at ? ` le ${new Date(convocation.sent_at).toLocaleString("fr-FR")}` : ""}</span>
                      {convocation.last_error ? <span style={s.error}>{convocation.last_error}</span> : null}
                      <form action={sendDailyConvocation} style={s.retryForm}>
                        <input type="hidden" name="id" value={session.id} />
                        <input type="hidden" name="convocation_id" value={convocation.id} />
                        <button style={s.secondaryButton}>Envoyer</button>
                      </form>
                    </div>
                  ))}
                  {history.length === 0 ? <span>Non generee.</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {reminderRows.length > 0 ? (
        <section style={{ ...s.card, ...s.alertCard }}>
          <p style={s.badge}>Relances dossier incomplet</p>
          <div style={s.recipientGrid}>
            {reminderRows.map(({ recipient, age, level }) => (
              <article key={`reminder_${recipient.id}`} style={s.recipientCard}>
                <strong>{recipient.recipient_name || recipient.company_name || recipient.recipient_email || recipient.recipient_key}</strong>
                <span>{level === "phone" ? "Relance telephonique recommandee" : "Relance J+7 a effectuer"}</span>
                <span>Dossier envoye depuis {age} jour(s)</span>
                <span>Email : {recipient.recipient_email || "email manquant"}</span>
                <span>Telephone : {responsePhoneForRecipient(recipient, responses) || "telephone non renseigne"}</span>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section style={s.card}>
        <p style={s.badge}>Synthèse des besoins</p>
        <div style={s.summaryGrid}>
          {summaryRows.map(([label, value]) => (
            <p key={label}>
              <strong>{label}</strong>
              <span>{Array.isArray(value) ? value.join("\n") || "Aucun élément" : String(value ?? "Aucun élément")}</span>
            </p>
          ))}
        </div>
      </section>

      <section style={s.card}>
        <p style={s.badge}>Réponses brutes</p>
        {responses.map((response) => (
          <article key={response.id} style={s.response}>
            <strong>{response.response_type === "company" ? response.company_name || "Entreprise" : `${response.respondent_first_name ?? ""} ${response.respondent_last_name ?? ""}`.trim() || "Bénéficiaire"}</strong>
            <pre style={s.pre}>{JSON.stringify({
              analyse: response.need_answers,
              positionnement: response.positioning_answers,
              participants: response.participants,
            }, null, 2)}</pre>
          </article>
        ))}
        {responses.length === 0 ? <p style={s.subtitle}>Aucune réponse reçue pour le moment.</p> : null}
      </section>
      <section style={s.card}>
        <p style={s.badge}>Analyse agent / formateur</p>
        <p style={s.subtitle}>
          Champs internes reserves a Selen : validation des prerequis, positionnement, conclusion et decision de suivi.
        </p>
        <form action={saveRegistrationReview} style={s.reviewForm}>
          <input type="hidden" name="id" value={session.id} />
          <label style={s.field}>
            <span>Prerequis attendus</span>
            <textarea name="prerequisites_expected" defaultValue={review?.prerequisites_expected ?? ""} style={s.textarea} />
          </label>
          <label style={s.field}>
            <span>Elements fournis par le beneficiaire</span>
            <textarea name="beneficiary_elements" defaultValue={review?.beneficiary_elements ?? ""} style={s.textarea} />
          </label>
          <div style={s.formGrid}>
            <label style={s.field}>
              <span>Prerequis valides</span>
              <select name="prerequisites_validated" defaultValue={review?.prerequisites_validated === true ? "yes" : review?.prerequisites_validated === false ? "no" : ""} style={s.input}>
                <option value="">A verifier</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
            </label>
            <label style={s.field}>
              <span>Niveau de depart</span>
              <input name="starting_level" defaultValue={review?.starting_level ?? ""} style={s.input} />
            </label>
          </div>
          <label style={s.field}>
            <span>Commentaire prerequis</span>
            <textarea name="prerequisites_comment" defaultValue={review?.prerequisites_comment ?? ""} style={s.textarea} />
          </label>
          <label style={s.field}>
            <span>Resultat du positionnement</span>
            <textarea name="positioning_result" defaultValue={review?.positioning_result ?? ""} style={s.textarea} />
          </label>
          <div style={s.formGrid}>
            <label style={s.field}>
              <span>Adaptation necessaire</span>
              <select name="adaptation_required" defaultValue={review?.adaptation_required ? "yes" : "no"} style={s.input}>
                <option value="no">Non</option>
                <option value="yes">Oui</option>
              </select>
            </label>
            <label style={s.field}>
              <span>Decision</span>
              <select name="decision" defaultValue={review?.decision ?? ""} style={s.input}>
                <option value="">A verifier</option>
                <option value="maintained">Maintenue</option>
                <option value="adapted">Adaptee</option>
                <option value="redirected">Reorientation</option>
              </select>
            </label>
          </div>
          <label style={s.field}>
            <span>Details adaptation</span>
            <textarea name="adaptation_details" defaultValue={review?.adaptation_details ?? ""} style={s.textarea} />
          </label>
          <label style={s.field}>
            <span>Justification</span>
            <textarea name="justification" defaultValue={review?.justification ?? ""} style={s.textarea} />
          </label>
          <div style={s.formGrid}>
            <label style={s.field}>
              <span>Valide le</span>
              <input type="datetime-local" name="validated_at" defaultValue={review?.validated_at ? review.validated_at.slice(0, 16) : ""} style={s.input} />
            </label>
            <label style={s.field}>
              <span>Nom de l&apos;evaluateur</span>
              <input name="evaluator_name" defaultValue={review?.evaluator_name ?? ""} style={s.input} />
            </label>
          </div>
          <button style={s.primaryButton}>Enregistrer l&apos;analyse</button>
        </form>
      </section>
    </main>
  );
}

function QuestionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={s.questionList}>
      <strong>{title}</strong>
      {items.map((item) => <span key={item}>{item}</span>)}
    </div>
  );
}

function PositioningQuestionList({ mode, questions }: { mode?: string | null; questions: unknown }) {
  const rows = Array.isArray(questions) ? questions as Array<Record<string, unknown>> : [];
  return (
    <div style={s.questionList}>
      <strong>Questionnaire formation</strong>
      <span>{mode === "selen" ? "Integre dans Selen" : "Hors plateforme"}</span>
      {mode === "selen" && rows.length > 0 ? rows.map((question, index) => (
        <span key={String(question.id ?? index)}>
          {index + 1}. {String(question.label ?? "Question sans intitule")}
          {" - "}
          {String(question.type ?? "type non renseigne")}
          {question.required ? " - obligatoire" : ""}
          {Array.isArray(question.options) && question.options.length > 0
            ? ` - options : ${question.options.join(", ")}`
            : ""}
        </span>
      )) : null}
      {mode === "selen" && rows.length === 0 ? <span>Questionnaire a completer.</span> : null}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "28px 32px 56px", color: "var(--selen-text)" },
  back: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 800 },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", margin: "18px 0 22px" },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 34, margin: "8px 0", color: "var(--selen-text)" },
  subtitle: { color: "var(--selen-text2)", lineHeight: 1.6, margin: 0 },
  counter: { display: "grid", gap: 2, minWidth: 150, border: "1px solid var(--selen-border)", padding: 14, textAlign: "center", color: "var(--selen-gold2)" },
  card: { background: "var(--selen-card-texture), var(--selen-card)", border: "1px solid rgba(245,208,138,0.18)", borderRadius: "var(--radius-sm)", padding: 18, color: "var(--selen-text-oncard)", marginBottom: 14 },
  alertCard: { borderColor: "rgba(220,90,70,0.5)" },
  badge: { color: "var(--selen-gold2)", fontSize: 12, fontWeight: 800, margin: 0 },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginTop: 14, whiteSpace: "pre-wrap" },
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 12 },
  questionList: { display: "grid", gap: 8, border: "1px solid rgba(245,208,138,0.14)", padding: 12 },
  recipientGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12, marginTop: 12 },
  recipientCard: { display: "grid", gap: 6, border: "1px solid rgba(245,208,138,0.14)", padding: 12, color: "var(--selen-text2-oncard)" },
  actions: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 },
  retryForm: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 },
  check: { display: "flex", gap: 6, alignItems: "center", color: "var(--selen-text2-oncard)" },
  input: { minHeight: 36, borderRadius: "var(--radius-sm)", border: "1px solid rgba(245,208,138,0.22)", background: "#f7ecd8", color: "#3b281b", padding: "0 10px" },
  textarea: { minHeight: 92, borderRadius: "var(--radius-sm)", border: "1px solid rgba(245,208,138,0.22)", background: "#f7ecd8", color: "#3b281b", padding: 10 },
  field: { display: "grid", gap: 6, color: "var(--selen-text2-oncard)", fontWeight: 700 },
  reviewForm: { display: "grid", gap: 12, marginTop: 14 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 },
  primaryButton: { minHeight: 38, border: 0, borderRadius: "var(--radius-sm)", padding: "0 14px", background: "linear-gradient(135deg, var(--selen-gold), var(--selen-copper))", color: "var(--selen-ink)", fontWeight: 800 },
  secondaryButton: { minHeight: 38, borderRadius: "var(--radius-sm)", padding: "0 14px", border: "1px solid rgba(245,208,138,0.24)", background: "rgba(247,239,224,0.08)", color: "var(--selen-text2-oncard)", fontWeight: 700 },
  response: { display: "grid", gap: 8, border: "1px solid rgba(245,208,138,0.14)", padding: 12, marginTop: 10 },
  pre: { whiteSpace: "pre-wrap", overflow: "auto", background: "rgba(0,0,0,0.2)", padding: 12, color: "var(--selen-text2-oncard)" },
  signatureBox: { display: "grid", gap: 8, border: "1px solid rgba(245,208,138,0.14)", padding: 10 },
  signatureRow: { display: "grid", gap: 6, borderTop: "1px solid rgba(245,208,138,0.12)", paddingTop: 8 },
  downloadLink: { color: "var(--selen-gold2)", fontWeight: 800, textDecoration: "none" },
  error: { color: "var(--selen-danger)" },
};
