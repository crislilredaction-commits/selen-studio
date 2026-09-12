import type { SupabaseClient } from "@supabase/supabase-js";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";

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
  portal_type: "learner" | "enterprise";
  entity_key: string;
  entity_name: string | null;
  entity_email: string | null;
  metadata?: JsonRecord | null;
};

type ExistingPortalAccess = DirectSessionPortalDefinition & {
  id: string;
  token: string;
  status: "pending" | "viewed" | "expired";
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
  if (!access || access.status === "expired") return false;
  if (!access.expires_at) return true;
  const expiresAt = new Date(access.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

function publicPortalUrl(type: "learner" | "enterprise", token: string) {
  const role = type === "learner" ? "apprenant" : "entreprise";
  const base = String(process.env.NEXT_PUBLIC_VITRINE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://selen-editions.fr")
    .trim()
    .replace(/\/$/, "");
  return `${base}/daily/portail/${role}/${token}`;
}

function portalEmail(definition: DirectSessionPortalDefinition, token: string, formationTitle?: string | null) {
  const isEnterprise = definition.portal_type === "enterprise";
  const url = publicPortalUrl(definition.portal_type, token);
  const title = isEnterprise ? "Votre espace entreprise Selen Daily" : "Votre espace apprenant Selen Daily";
  const bodyText = [
    `Bonjour${definition.entity_name ? ` ${definition.entity_name}` : ""},`,
    "",
    isEnterprise
      ? "Votre accès entreprise Selen Daily est disponible. Vous pourrez y retrouver les éléments utiles au suivi de la formation et les actions qui vous concernent."
      : "Votre accès apprenant Selen Daily est disponible. Vous pourrez y retrouver les éléments utiles à votre parcours et les actions qui vous concernent.",
    formationTitle ? `Formation : ${formationTitle}` : "",
    "",
    "Accéder à votre espace :",
    url,
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
      ctaUrl: url,
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

    if (metadata.email_sent === true) {
      skipped += 1;
      continue;
    }

    const message = portalEmail(definition, access.token, input.formationTitle);
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
