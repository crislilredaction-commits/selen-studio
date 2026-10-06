import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import {
  ACTIVE_SIGNATURE_REMINDER_STATUSES,
  isSignatureTerminal,
} from "@/lib/daily/signatureReminder24h";

type JsonRecord = Record<string, unknown>;
type SignatureRow = {
  id: string;
  convention_id: string;
  session_id: string;
  signatory_type: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  status: string | null;
  signed_at: string | null;
};
type CommunicationRow = {
  id: string;
  organisation_id: string;
  session_id: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  created_at: string;
  metadata: JsonRecord | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function signatureIdFromCommunication(row: CommunicationRow) {
  return text(row.metadata?.signature_id);
}

export async function generateDailySignatureReminders(
  admin = createSupabaseAdminClient(),
) {
  const now = new Date().toISOString();
  const { data: legacy, error } = await admin
    .from("client_reminders")
    .select("id,metadata")
    .eq("reminder_type", "daily_signature_pending_24h")
    .in("status", [...ACTIVE_SIGNATURE_REMINDER_STATUSES]);
  if (error) throw error;

  let resolved = 0;
  for (const reminder of legacy ?? []) {
    const { data: updated, error: updateError } = await admin
      .from("client_reminders")
      .update({
        status: "resolved",
        updated_at: now,
        metadata: {
          ...(reminder.metadata ?? {}),
          resolved_at: now,
          resolved_reason: "superseded_by_canonical_j3_j6_j9",
        },
      })
      .eq("id", reminder.id)
      .in("status", [...ACTIVE_SIGNATURE_REMINDER_STATUSES])
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) continue;
    resolved += 1;
    const { error: eventError } = await admin.from("client_reminder_events").insert({
      reminder_id: reminder.id,
      event_type: "resolved",
      metadata: { reason: "superseded_by_canonical_j3_j6_j9" },
    });
    if (eventError) throw eventError;
  }

  return { legacyChecked: legacy?.length ?? 0, legacyResolved: resolved };
}

function manualReminderDedupeKey(signatureId: string, initialCommunicationId: string) {
  return `daily_signature_manual_followup:${signatureId}:${initialCommunicationId}`;
}

export async function sendManualDailySignatureReminder({
  signatureId,
  agentEmail,
  agentUserId,
  admin = createSupabaseAdminClient(),
}: {
  signatureId: string;
  agentEmail: string;
  agentUserId: string;
  admin?: SupabaseAdminClient;
}) {
  const { data: signature, error: signatureError } = await admin
    .from("daily_convention_signatures")
    .select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,signed_at")
    .eq("id", signatureId)
    .maybeSingle();
  if (signatureError) throw signatureError;
  if (!signature) throw new Error("Demande de signature introuvable.");
  if (isSignatureTerminal(signature.status, signature.signed_at)) {
    return { sent: false, duplicate: false, terminal: true, error: null as string | null };
  }

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id")
    .eq("id", signature.session_id)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session?.organisation_id) throw new Error("Session Daily introuvable.");
  if (!(await isDailyOrganisationInAgentScope(agentEmail, session.organisation_id))) {
    throw new Error("Cette session n’est pas dans votre périmètre Daily.");
  }

  const { data: communicationRows, error: communicationsError } = await admin
    .from("daily_communications")
    .select("id,organisation_id,session_id,recipient_email,sent_at,created_at,metadata")
    .eq("session_id", signature.session_id)
    .eq("communication_type", "convention_signature")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(100);
  if (communicationsError) throw communicationsError;
  const initial = (communicationRows as CommunicationRow[] | null)?.find(
    (row) => signatureIdFromCommunication(row) === signature.id,
  );
  if (!initial?.sent_at) throw new Error("La demande de signature initiale n’a pas encore été envoyée.");

  const recipient = text(signature.signatory_email) || text(initial.recipient_email);
  if (!recipient) throw new Error("Aucune adresse email n’est associée au signataire.");

  const dedupeKey = manualReminderDedupeKey(signature.id, initial.id);
  const { data: previous, error: previousError } = await admin
    .from("client_reminders")
    .select("id,status,metadata")
    .eq("dedupe_key", dedupeKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;
  if (previous?.status === "sent") {
    return { sent: false, duplicate: true, terminal: false, error: null as string | null };
  }

  const signatoryName = text(signature.signatory_name);
  const bodyText = [
    signatoryName ? `Bonjour ${signatoryName},` : "Bonjour,",
    "Nous vous rappelons qu’une demande de signature concernant votre dossier de formation vous a déjà été transmise.",
    "Votre signature est toujours attendue. Merci de reprendre le lien présent dans l’email de demande de signature initial.",
    "Si vous avez déjà signé entre-temps, aucune action supplémentaire n’est nécessaire.",
  ].join("\n\n");
  const subject = "Rappel : votre signature est attendue";
  const rendered = renderSelenEmailFromText({ title: subject, bodyText });
  const now = new Date().toISOString();
  const reminderMetadata = {
    generated_by: "studio_manual_signature_followup",
    signature_id: signature.id,
    convention_id: signature.convention_id,
    session_id: signature.session_id,
    organisation_id: session.organisation_id,
    communication_id: initial.id,
    initial_sent_at: initial.sent_at,
    signatory_type: signature.signatory_type,
  };

  let reminderId = previous?.id ?? null;
  if (!reminderId) {
    const payload = {
      client_email: recipient.toLowerCase(),
      reminder_type: "daily_signature_manual_followup",
      status: "draft",
      subject,
      body_html: rendered.html,
      body_text: rendered.text,
      due_at: now,
      dedupe_key: dedupeKey,
      suggested_subject: subject,
      suggested_body_html: rendered.html,
      suggested_body_text: rendered.text,
      prestation_type: "daily_convention_signature",
      prestation_id: signature.id,
      stage_label: "relance manuelle de signature",
      expected_action: "signer la convention déjà transmise",
      metadata: reminderMetadata,
    };
    const { data: inserted, error: insertError } = await admin
      .from("client_reminders")
      .insert(payload)
      .select("id")
      .single();
    if (insertError) {
      const { data: raced } = await admin
        .from("client_reminders")
        .select("id,status")
        .eq("dedupe_key", dedupeKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!raced) throw insertError;
      if (raced.status === "sent") {
        return { sent: false, duplicate: true, terminal: false, error: null as string | null };
      }
      reminderId = raced.id;
    } else {
      reminderId = inserted.id;
      await admin.from("client_reminder_events").insert({
        reminder_id: reminderId,
        event_type: "created",
        subject,
        body_html: rendered.html,
        body_text: rendered.text,
        metadata: { signature_id: signature.id, dedupe_key: dedupeKey, manual: true },
      });
    }
  }

  const { data: claimed, error: claimError } = await admin
    .from("client_reminders")
    .update({ status: "ready", updated_at: now })
    .eq("id", reminderId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    return { sent: false, duplicate: true, terminal: false, error: null as string | null };
  }

  const emailResult = await sendClientEmailWithSilence({
    supabase: admin,
    organisationId: session.organisation_id,
    email: recipient,
    to: recipient,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!emailResult.sent) {
    await admin
      .from("client_reminders")
      .update({
        status: "draft",
        updated_at: new Date().toISOString(),
        metadata: {
          ...reminderMetadata,
          last_send_error: emailResult.error ?? null,
        },
      })
      .eq("id", reminderId);
    return { sent: false, duplicate: false, terminal: false, error: emailResult.error ?? null };
  }

  const sentAt = new Date().toISOString();
  await admin
    .from("client_reminders")
    .update({ status: "sent", sent_at: sentAt, updated_at: sentAt })
    .eq("id", reminderId);
  await admin.from("client_reminder_events").insert({
    reminder_id: reminderId,
    event_type: "sent",
    subject,
    body_html: rendered.html,
    body_text: rendered.text,
    metadata: { signature_id: signature.id, manual: true, sent_by: agentEmail },
  });
  const providerMessageId = "resendId" in emailResult ? emailResult.resendId ?? null : null;
  const { error: communicationError } = await admin.from("daily_communications").insert({
    organisation_id: session.organisation_id,
    session_id: signature.session_id,
    communication_type: "convention_signature_followup",
    channel: "email",
    recipient_email: recipient.toLowerCase(),
    recipient_name: signatoryName || null,
    subject,
    text_body: rendered.text,
    html_body: rendered.html,
    provider: "resend",
    provider_message_id: providerMessageId,
    status: "sent",
    sent_at: sentAt,
    created_by: agentUserId,
    metadata: {
      signature_id: signature.id,
      convention_id: signature.convention_id,
      initial_communication_id: initial.id,
      reminder_id: reminderId,
      dedupe_key: dedupeKey,
      manual: true,
    },
  });
  if (communicationError) throw communicationError;

  return { sent: true, duplicate: false, terminal: false, error: null as string | null };
}
