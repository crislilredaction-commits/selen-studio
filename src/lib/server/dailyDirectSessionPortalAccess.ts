import type { SupabaseClient } from "@supabase/supabase-js";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { buildDailyPortalAuthEntryUrl } from "@/lib/server/dailyPortalAuthEntry";

type JsonRecord = Record<string, unknown>;

type DirectParticipant = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type DirectCompany = {
  name?: string | null;
  email?: string | null;
};

export type DirectSessionPortalSource = {
  id: string;
  user_id: string;
  individual_beneficiaries?: unknown;
  beneficiaries?: unknown;
  companies?: unknown;
};

export type DirectSessionPortalDefinition = {
  session_id: string;
  user_id: string;
  portal_type: "learner" | "enterprise" | "trainer";
  entity_key: string;
  entity_name: string | null;
  entity_email: string | null;
  metadata?: JsonRecord | null;
};

type ExistingPortalAccess = DirectSessionPortalDefinition & {
  id: string;
  token: string;
  status: "pending" | "viewed" | "revoked" | "expired";
  expires_at: string | null;
  metadata?: JsonRecord | null;
};

type ProvisionInput = {
  supabase: SupabaseClient;
  sessionId: string;
  formationTitle?: string | null;
  definitions: DirectSessionPortalDefinition[];
};

function normalizedEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

const INACTIVE_LEARNER_ENROLMENT_STATUSES = new Set([
  "declined",
  "cancelled",
  "canceled",
  "abandoned",
]);

export function isDailyLearnerEnrolmentActive(status: unknown) {
  return !INACTIVE_LEARNER_ENROLMENT_STATUSES.has(
    String(status ?? "").trim().toLowerCase(),
  );
}

function fullName(first?: string | null, last?: string | null) {
  return [first, last].map((value) => value?.trim()).filter(Boolean).join(" ");
}

function participants(value: unknown): DirectParticipant[] {
  return Array.isArray(value) ? value as DirectParticipant[] : [];
}

function companies(value: unknown): DirectCompany[] {
  return Array.isArray(value) ? value as DirectCompany[] : [];
}

export function buildDirectSessionPortalDefinitions(session: DirectSessionPortalSource) {
  const learners = [
    ...participants(session.individual_beneficiaries),
    ...participants(session.beneficiaries),
  ].map((participant, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    portal_type: "learner" as const,
    entity_key: normalizedEmail(participant.email) || `learner_${index + 1}`,
    entity_name: fullName(participant.first_name, participant.last_name) || null,
    entity_email: normalizedEmail(participant.email) || null,
    metadata: { participant, source: "studio_summary_validated" },
  }));

  const enterprises = companies(session.companies).map((company, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    portal_type: "enterprise" as const,
    entity_key: normalizedEmail(company.email) || company.name?.trim().toLowerCase() || `enterprise_${index + 1}`,
    entity_name: company.name?.trim() || null,
    entity_email: normalizedEmail(company.email) || null,
    metadata: { company, source: "studio_summary_validated" },
  }));

  return [...learners, ...enterprises] satisfies DirectSessionPortalDefinition[];
}

function isSyntheticEmail(value?: string | null) {
  return normalizedEmail(value).endsWith(".invalid");
}

function metadataRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function isActiveAccess(access: ExistingPortalAccess | undefined, now = Date.now()) {
  if (!access || access.status === "expired" || access.status === "revoked") return false;
  if (!access.expires_at) return true;
  const expiresAt = new Date(access.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function portalEmail(
  definition: DirectSessionPortalDefinition,
  authUrl: string,
  formationTitle?: string | null,
) {
  const isEnterprise = definition.portal_type === "enterprise";
  const title = isEnterprise ? "Votre espace entreprise Selen Daily" : "Votre espace apprenant Selen Daily";
  const bodyText = [
    `Bonjour${definition.entity_name ? ` ${definition.entity_name}` : ""},`,
    "",
    isEnterprise
      ? "Votre accès entreprise Selen Daily est disponible. Vous pourrez y retrouver les éléments utiles au suivi de la formation et les actions qui vous concernent."
      : "Votre accès apprenant Selen Daily est disponible. Vous pourrez y retrouver les éléments utiles à votre parcours et les actions qui vous concernent.",
    formationTitle ? `Formation : ${formationTitle}` : "",
    "",
    "Pour activer votre accès ou vous connecter :",
    authUrl,
    "",
    "Merci,",
    "L'équipe Selen",
  ].filter(Boolean).join("\n");

  return {
    subject: isEnterprise ? "Votre accès entreprise Selen Daily" : "Votre accès apprenant Selen Daily",
    rendered: renderSelenEmailFromText({
      title,
      bodyText,
      ctaLabel: isEnterprise ? "Accéder à l'espace entreprise" : "Accéder à mon espace",
      ctaUrl: authUrl,
    }),
  };
}

async function persistMetadata(
  supabase: SupabaseClient,
  access: ExistingPortalAccess,
  metadata: JsonRecord,
) {
  const { error } = await supabase
    .from("daily_portal_access_tokens")
    .update({ metadata })
    .eq("id", access.id);
  if (error) throw new Error(error.message);
}

export async function provisionDirectSessionPortalAccesses(input: ProvisionInput) {
  const definitions = input.definitions.filter(
    (definition) => definition.portal_type === "learner" || definition.portal_type === "enterprise",
  );
  if (!definitions.length) return { created: 0, sent: 0, skipped: 0, paused: 0 };

  const { data: existingRows, error: existingError } = await input.supabase
    .from("daily_portal_access_tokens")
    .select("id,session_id,user_id,portal_type,entity_key,entity_name,entity_email,token,status,expires_at,metadata")
    .eq("session_id", input.sessionId)
    .in("portal_type", ["learner", "enterprise"]);
  if (existingError) throw new Error(existingError.message);

  const existing = (existingRows ?? []) as ExistingPortalAccess[];
  let created = 0;
  let sent = 0;
  let skipped = 0;
  let paused = 0;
  const failures: string[] = [];

  for (const definition of definitions) {
    const current = existing.find(
      (row) => row.portal_type === definition.portal_type && row.entity_key === definition.entity_key,
    );
    let access = current;

    if (!isActiveAccess(current)) {
      const token = crypto.randomUUID().replaceAll("-", "");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90).toISOString();
      const metadata = {
        ...metadataRecord(definition.metadata),
        source: "studio_summary_validated",
        email_sent: false,
        email_paused: false,
        email_skipped: false,
      };
      const payload = {
        ...definition,
        token,
        status: "pending",
        viewed_at: null,
        expires_at: expiresAt,
        metadata,
      };
      const { data, error } = await input.supabase
        .from("daily_portal_access_tokens")
        .upsert(payload, { onConflict: "session_id,portal_type,entity_key" })
        .select("id,session_id,user_id,portal_type,entity_key,entity_name,entity_email,token,status,expires_at,metadata")
        .single();
      if (error) throw new Error(error.message);
      access = data as ExistingPortalAccess;
      created += 1;
    }

    if (!access) continue;
    const metadata = metadataRecord(access.metadata);
    const email = normalizedEmail(definition.entity_email);

    if (!email || isSyntheticEmail(email)) {
      await persistMetadata(input.supabase, access, {
        ...metadata,
        email_sent: false,
        email_paused: false,
        email_skipped: true,
        email_skip_reason: !email ? "missing_email" : "synthetic_invalid_email",
      });
      skipped += 1;
      continue;
    }

    if (metadata.email_sent === true && metadata.auth_protected === true) {
      skipped += 1;
      continue;
    }

    let authUrl: string;
    try {
      authUrl = await buildDailyPortalAuthEntryUrl({
        email,
        portalType: definition.portal_type,
        token: access.token,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Préparation Auth impossible.";
      await persistMetadata(input.supabase, access, {
        ...metadata,
        email_sent: false,
        email_paused: false,
        email_skipped: false,
        email_error: message,
      });
      failures.push(`${definition.entity_name || email}: ${message}`);
      continue;
    }

    const message = portalEmail(definition, authUrl, input.formationTitle);
    const result = await sendClientEmailWithSilence({
      supabase: input.supabase,
      email,
      to: email,
      subject: message.subject,
      html: message.rendered.html,
      text: message.rendered.text,
    });

    if (result.sent) {
      await persistMetadata(input.supabase, access, {
        ...metadata,
        email_sent: true,
        email_sent_at: new Date().toISOString(),
        email_paused: false,
        email_skipped: false,
        email_error: null,
        auth_protected: true,
      });
      sent += 1;
      continue;
    }

    if (result.paused) {
      await persistMetadata(input.supabase, access, {
        ...metadata,
        email_sent: false,
        email_paused: true,
        email_skipped: false,
        email_error: result.error ?? null,
      });
      paused += 1;
      continue;
    }

    await persistMetadata(input.supabase, access, {
      ...metadata,
      email_sent: false,
      email_paused: false,
      email_skipped: false,
      email_error: result.error ?? "Envoi impossible.",
    });
    failures.push(`${definition.entity_name || email}: ${result.error || "envoi impossible"}`);
  }

  if (failures.length) {
    throw new Error(`Accès Daily non envoyés : ${failures.join(" ; ")}`);
  }

  return { created, sent, skipped, paused };
}

export async function resendExistingDailyPortalAccess(input: { supabase: SupabaseClient; accessId: string; organisationId: string; createdBy?: string | null }) {
  const { data: access, error: accessError } = await input.supabase.from("daily_portal_access_tokens").select("id,session_id,portal_type,entity_key,entity_name,entity_email,token,status,expires_at,daily_sessions!inner(organisation_id,daily_formations(title))").eq("id", input.accessId).eq("daily_sessions.organisation_id", input.organisationId).in("portal_type", ["learner", "trainer"]).maybeSingle();
  if (accessError) throw new Error(accessError.message);
  if (!access) throw new Error("Accès introuvable dans cet organisme.");
  if (["revoked", "expired"].includes(String(access.status))) throw new Error("Cet accès est clos et ne peut pas être renvoyé.");
  if (access.expires_at && new Date(access.expires_at).getTime() < Date.now()) throw new Error("Cet accès est expiré.");
  const email = normalizedEmail(access.entity_email);
  if (!email || isSyntheticEmail(email)) throw new Error("Adresse réelle du destinataire manquante.");
  const session = Array.isArray(access.daily_sessions) ? access.daily_sessions[0] : access.daily_sessions;
  const formation = Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations;
  let enrolmentId: string | null = null;
  if (access.portal_type === "learner") {
    const learnerId = String(access.entity_key || "").startsWith("learner:") ? String(access.entity_key).slice(8) : "";
    let learner: { id: string; email: string | null } | null = null;
    if (learnerId) { const { data } = await input.supabase.from("daily_learners").select("id,email").eq("id", learnerId).eq("organisation_id", input.organisationId).maybeSingle(); learner = data; }
    else { const { data } = await input.supabase.from("daily_learners").select("id,email").eq("organisation_id", input.organisationId).ilike("email", email).limit(1).maybeSingle(); learner = data; }
    if (!learner || normalizedEmail(learner.email) !== email) throw new Error("Le destinataire ne correspond plus à l’apprenant rattaché.");
    const { data: enrolment, error: enrolmentError } = await input.supabase.from("daily_session_enrolments").select("id,status").eq("organisation_id", input.organisationId).eq("session_id", access.session_id).eq("learner_id", learner.id).maybeSingle();
    if (enrolmentError) throw new Error(enrolmentError.message);
    if (!enrolment || !isDailyLearnerEnrolmentActive(enrolment.status)) throw new Error("L’inscription liée à cet accès n’est plus active.");
    enrolmentId = enrolment.id;
  }
  const communicationType = access.portal_type === "trainer" ? "trainer_portal_access" : "learner_portal_access";
  const cooldownStart = new Date(Date.now() - 60_000).toISOString();
  const { data: recent, error: recentError } = await input.supabase.from("daily_communications").select("id,status,created_at").eq("organisation_id", input.organisationId).eq("session_id", access.session_id).eq("communication_type", communicationType).eq("recipient_email", email).contains("metadata", { portal_access_id: access.id, auth_protected: true }).gte("created_at", cooldownStart).in("status", ["queued", "sent", "delivered"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (recentError) throw new Error(recentError.message);
  if (recent) return { status: "already_sent" as const, communicationId: recent.id };
  const portalType = access.portal_type as "learner" | "trainer";
  const authUrl = await buildDailyPortalAuthEntryUrl({ email, portalType, token: access.token });
  const definition: DirectSessionPortalDefinition = { session_id: access.session_id, user_id: "", portal_type: "learner", entity_key: access.entity_key, entity_name: access.entity_name, entity_email: email };
  const message = portalEmail({ ...definition, portal_type: portalType }, authUrl, formation?.title ?? null);
  const { data: communication, error: communicationError } = await input.supabase.from("daily_communications").insert({ organisation_id: input.organisationId, session_id: access.session_id, enrolment_id: enrolmentId, communication_type: communicationType, channel: "email", recipient_email: email, recipient_name: access.entity_name, subject: message.subject, text_body: message.rendered.text, html_body: message.rendered.html, provider: "resend", status: "queued", created_by: input.createdBy ?? null, metadata: { portal_access_id: access.id, source: "studio_manual_resend", auth_protected: true } }).select("id").single();
  if (communicationError) throw new Error(communicationError.message);
  const delivery = await sendClientEmailWithSilence({ supabase: input.supabase, organisationId: input.organisationId, email, to: email, subject: message.subject, html: message.rendered.html, text: message.rendered.text });
  if (delivery.sent) { const { error } = await input.supabase.from("daily_communications").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: "resendId" in delivery ? delivery.resendId ?? null : null }).eq("id", communication.id); if (error) throw new Error(error.message); return { status: "sent" as const, communicationId: communication.id }; }
  await input.supabase.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: delivery.error ?? "Envoi impossible." }).eq("id", communication.id);
  if (delivery.paused) return { status: "paused" as const, communicationId: communication.id };
  throw new Error(delivery.error ?? "Envoi impossible.");
}
