import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendSelenEmail } from "@/lib/server/selenEmailLayout";

export const CLIENT_NOTIFICATION_PAUSED_MESSAGE =
  "Le mode préparation silencieuse est activé. Réactivez les emails client pour envoyer ce message.";

type SilenceLookup = {
  organisationId?: string | null;
  dossierId?: string | null;
  email?: string | null;
};

type ClientEmailInput = SilenceLookup & {
  supabase?: SupabaseClient;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
};

function cleanEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

async function resolveOrganisationId(
  supabase: SupabaseClient,
  lookup: SilenceLookup,
) {
  if (lookup.organisationId) return lookup.organisationId;

  if (lookup.dossierId) {
    const { data } = await supabase
      .from("dossiers")
      .select("organisation_id")
      .eq("id", lookup.dossierId)
      .maybeSingle();

    if (data?.organisation_id) return String(data.organisation_id);
  }

  return null;
}

export async function getClientNotificationSilence(
  supabase: SupabaseClient,
  lookup: SilenceLookup,
) {
  const organisationId = await resolveOrganisationId(supabase, lookup);

  if (organisationId) {
    const { data, error } = await supabase
      .from("organisations")
      .select("id, name, email, client_notifications_paused")
      .eq("id", organisationId)
      .maybeSingle();

    if (error) throw error;

    return {
      paused: Boolean(data?.client_notifications_paused),
      organisation: data ?? null,
    };
  }

  const email = cleanEmail(lookup.email);
  if (!email) return { paused: false, organisation: null };

  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, email, client_notifications_paused")
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;

  return {
    paused: Boolean(data?.client_notifications_paused),
    organisation: data ?? null,
  };
}

export async function sendClientEmailWithSilence(input: ClientEmailInput) {
  const supabase = input.supabase ?? createSupabaseAdminClient();
  const silence = await getClientNotificationSilence(supabase, {
    organisationId: input.organisationId,
    dossierId: input.dossierId,
    email: input.email ?? input.to,
  });

  if (silence.paused) {
    console.info("Email client non envoyé : mode préparation silencieuse.", {
      to: input.to,
      subject: input.subject,
      organisationId: silence.organisation?.id ?? input.organisationId ?? null,
    });

    return {
      sent: false,
      paused: true,
      error: CLIENT_NOTIFICATION_PAUSED_MESSAGE,
    };
  }

  const result = await sendSelenEmail({
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });

  return { ...result, paused: false };
}
