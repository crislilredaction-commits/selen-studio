import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  ACTIVE_SIGNATURE_REMINDER_STATUSES,
  DAILY_SIGNATURE_REMINDER_TYPE,
  isSignatureTerminal,
  signatureReminderDedupeKey,
  signatureReminderDueAt,
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

async function resolveReminder(
  admin: SupabaseAdminClient,
  signatureId: string,
  reason: string,
) {
  const now = new Date().toISOString();
  const dedupeKey = signatureReminderDedupeKey(signatureId);
  const { data: active, error } = await admin
    .from("client_reminders")
    .select("id,metadata")
    .eq("dedupe_key", dedupeKey)
    .in("status", [...ACTIVE_SIGNATURE_REMINDER_STATUSES]);
  if (error) throw error;

  for (const reminder of active ?? []) {
    const { error: updateError } = await admin
      .from("client_reminders")
      .update({
        status: "resolved",
        updated_at: now,
        metadata: {
          ...(reminder.metadata ?? {}),
          resolved_at: now,
          resolved_reason: reason,
        },
      })
      .eq("id", reminder.id);
    if (updateError) throw updateError;

    await admin.from("client_reminder_events").insert({
      reminder_id: reminder.id,
      event_type: "resolved",
      metadata: { signature_id: signatureId, reason },
    });
  }
  return active?.length ?? 0;
}

async function createReminder(
  admin: SupabaseAdminClient,
  signature: SignatureRow,
  communication: CommunicationRow,
  dueAt: Date,
) {
  const dedupeKey = signatureReminderDedupeKey(signature.id);
  const { data: existing, error: existingError } = await admin
    .from("client_reminders")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .in("status", [...ACTIVE_SIGNATURE_REMINDER_STATUSES])
    .limit(1);
  if (existingError) throw existingError;
  if (existing?.length) return false;

  const recipient = text(signature.signatory_email) || text(communication.recipient_email);
  if (!recipient) return false;
  const signatory = text(signature.signatory_name) || recipient;
  const subject = "Signature attendue · relance à traiter";
  const bodyText = `La signature de ${signatory} est toujours attendue. Vérifiez le dossier de session avant toute relance.`;
  const now = new Date().toISOString();
  const payload = {
    client_email: recipient.toLowerCase(),
    dossier_id: null,
    reminder_type: DAILY_SIGNATURE_REMINDER_TYPE,
    status: "ready",
    subject,
    body_html: `<p>${bodyText}</p>`,
    body_text: bodyText,
    due_at: dueAt.toISOString(),
    dedupe_key: dedupeKey,
    suggested_subject: "Rappel : votre signature est attendue",
    suggested_body_html: "<p>Bonjour,</p><p>Votre signature est toujours attendue pour finaliser votre dossier de formation. Merci de consulter la demande de signature déjà transmise.</p>",
    suggested_body_text: "Bonjour,\n\nVotre signature est toujours attendue pour finaliser votre dossier de formation. Merci de consulter la demande de signature déjà transmise.",
    prestation_type: "daily_convention_signature",
    prestation_id: signature.id,
    stage_label: "signature attendue",
    expected_action: "vérifier puis relancer le signataire si nécessaire",
    metadata: {
      generated_by: "daily_signature_reminder_job",
      signature_id: signature.id,
      convention_id: signature.convention_id,
      session_id: signature.session_id,
      organisation_id: communication.organisation_id,
      communication_id: communication.id,
      signatory_type: signature.signatory_type,
      signatory_name: signature.signatory_name,
      signatory_email: recipient.toLowerCase(),
      initial_sent_at: communication.sent_at,
      canonical_rule: "24h_ouvrees_fr",
    },
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("client_reminders")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    // Une seconde exécution concurrente peut perdre la course. La relecture du dedupe_key
    // permet de rester idempotent même sans dépendre d'un timing parfait du cron.
    const { data: raced } = await admin
      .from("client_reminders")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .in("status", [...ACTIVE_SIGNATURE_REMINDER_STATUSES])
      .limit(1);
    if (raced?.length) return false;
    throw error;
  }

  await admin.from("client_reminder_events").insert({
    reminder_id: data.id,
    event_type: "created",
    subject,
    body_html: payload.body_html,
    body_text: bodyText,
    metadata: {
      reminder_type: DAILY_SIGNATURE_REMINDER_TYPE,
      dedupe_key: dedupeKey,
      signature_id: signature.id,
    },
  });
  return true;
}

export async function generateDailySignatureReminders(
  admin = createSupabaseAdminClient(),
  now = new Date(),
) {
  const { data: signatures, error: signaturesError } = await admin
    .from("daily_convention_signatures")
    .select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,signed_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (signaturesError) throw signaturesError;

  const { data: communications, error: communicationsError } = await admin
    .from("daily_communications")
    .select("id,organisation_id,session_id,recipient_email,sent_at,created_at,metadata")
    .eq("communication_type", "convention_signature")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(2000);
  if (communicationsError) throw communicationsError;

  const communicationBySignature = new Map<string, CommunicationRow>();
  for (const row of (communications ?? []) as CommunicationRow[]) {
    const signatureId = signatureIdFromCommunication(row);
    if (signatureId && !communicationBySignature.has(signatureId)) {
      communicationBySignature.set(signatureId, row);
    }
  }

  let created = 0;
  let resolved = 0;
  let checked = 0;

  for (const signature of (signatures ?? []) as SignatureRow[]) {
    checked += 1;
    if (isSignatureTerminal(signature.status, signature.signed_at)) {
      resolved += await resolveReminder(admin, signature.id, signature.signed_at ? "signed" : text(signature.status) || "terminal");
      continue;
    }

    const communication = communicationBySignature.get(signature.id);
    if (!communication?.sent_at) continue;
    const sentAt = new Date(communication.sent_at);
    if (Number.isNaN(sentAt.getTime())) continue;
    const dueAt = signatureReminderDueAt(sentAt);
    if (dueAt.getTime() > now.getTime()) continue;
    if (await createReminder(admin, signature, communication, dueAt)) created += 1;
  }

  return { checked, created, resolved };
}
