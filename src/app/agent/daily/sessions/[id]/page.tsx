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
  daily_formations?: {
    id?: string | null;
    title?: string | null;
    status?: string | null;
    positioning_mode?: string | null;
    positioning_questions?: unknown;
  } | null;
};
type DailyRegistrationResponse = {
  id: string;
  response_type: string | null;
  respondent_first_name: string | null;
  respondent_last_name: string | null;
  company_name: string | null;
  need_answers: JsonRecord | null;
  positioning_answers: JsonRecord | null;
  participants: unknown;
};
type Participant = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};
type Company = {
  name?: string | null;
  email?: string | null;
  participants?: Participant[] | null;
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
};
type DailyOnboarding = {
  platform_contact_first_name: string | null;
  platform_contact_last_name: string | null;
  platform_contact_email: string | null;
  organisation_name: string | null;
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

function buildRecipientDefinitions(session: DailySessionRow, onboarding: DailyOnboarding | null) {
  const token = session.registration_token;
  const beneficiaryPath = token ? `/daily-inscription/${token}?type=beneficiary` : null;
  const companyPath = token ? `/daily-inscription/${token}?type=company` : null;
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
    metadata: { participant },
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
    metadata: { company },
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
        metadata: { contact: true },
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
  const title = isCompany
    ? "Votre dossier entreprise Selen Daily"
    : "Votre dossier d'inscription Selen Daily";
  const url = buildPublicUrl(recipient.public_path);
  const bodyText = [
    `Bonjour${recipient.recipient_name ? ` ${recipient.recipient_name}` : ""},`,
    "",
    isCompany
      ? "Selen prépare le dossier d'inscription de votre entreprise pour cette session."
      : "Selen prépare votre dossier d'inscription pour cette session.",
    "",
    `Formation : ${session.daily_formations?.title ?? "Selen Daily"}`,
    "",
    "Merci de compléter le formulaire d'analyse du besoin et de positionnement via le lien ci-dessous.",
    "Votre dossier sera relu par Selen afin d'éviter les oublis et de garder un dossier propre.",
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

export default async function AgentDailySessionPage({ params }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [sessionRes, responsesRes, recipientsRes, reviewRes] = await Promise.all([
    admin
      .from("daily_sessions")
      .select("*, daily_formations(id,title,status,global_objective,target_audience,positioning_mode,positioning_questions)")
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
  ]);

  if (sessionRes.error || responsesRes.error || recipientsRes.error || reviewRes.error) {
    return <main style={s.page}><p style={s.error}>{sessionRes.error?.message ?? responsesRes.error?.message ?? recipientsRes.error?.message ?? reviewRes.error?.message}</p></main>;
  }

  const session = sessionRes.data as unknown as DailySessionRow | null;
  const responses = (responsesRes.data ?? []) as unknown as DailyRegistrationResponse[];
  const storedRecipients = (recipientsRes.data ?? []) as DailyRecipient[];
  const review = reviewRes.data as DailyRegistrationReview | null;
  if (!session) return <main style={s.page}><p style={s.error}>Session introuvable.</p></main>;

  const { data: onboarding } = await admin
    .from("daily_onboarding")
    .select("platform_contact_first_name,platform_contact_last_name,platform_contact_email,organisation_name")
    .eq("user_id", session.user_id)
    .maybeSingle();

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
    } satisfies DailyRecipient;
  });

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
  error: { color: "var(--selen-danger)" },
};
