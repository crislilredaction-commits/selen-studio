import type { SupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  buildReminderTemplate,
  type ClientReminderType,
} from "@/lib/server/clientReminderTemplates";
import { sendSelenEmail } from "@/lib/server/selenEmailLayout";

type JsonRecord = Record<string, unknown>;

type ReminderInsert = {
  client_email: string;
  client_id?: string | null;
  dossier_id?: string | null;
  reminder_type: ClientReminderType;
  status: "ready";
  subject: string;
  body_html: string;
  body_text: string;
  due_at: string;
  metadata: JsonRecord;
  dedupe_key: string;
};

const ACTIVE_REMINDER_STATUSES = ["draft", "ready", "postponed"];
const DAY_MS = 24 * 60 * 60 * 1000;

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function maybeDate(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.message?.includes("does not exist");
}

async function tableExistsQuery<T>(
  query: PromiseLike<{ data: T | null; error: any }>,
) {
  const { data, error } = await query;
  if (isMissingTableError(error)) return { data: null, error: null };
  return { data, error };
}

async function getUserEmail(admin: SupabaseAdminClient, userId?: string | null) {
  if (!userId) return null;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    console.warn("Impossible de retrouver l'email client pour une relance.", {
      userId,
      error: error.message,
    });
    return null;
  }
  return data.user?.email?.trim().toLowerCase() || null;
}

async function findDossierForEmail(
  admin: SupabaseAdminClient,
  email: string,
  type: string,
) {
  const { data: organisation } = await admin
    .from("organisations")
    .select("id, name, email")
    .eq("email", email)
    .maybeSingle();

  if (!organisation?.id) return null;

  const { data: dossier } = await admin
    .from("dossiers")
    .select("id, title, type, status, updated_at")
    .eq("organisation_id", organisation.id)
    .eq("type", type)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return dossier
    ? {
        ...dossier,
        organisation,
      }
    : null;
}

async function hasActiveReminder(
  admin: SupabaseAdminClient,
  dedupeKey: string,
) {
  const { data, error } = await admin
    .from("client_reminders")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .in("status", ACTIVE_REMINDER_STATUSES)
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function lastSentAfter(
  admin: SupabaseAdminClient,
  dedupeKey: string,
  after: Date,
) {
  const { data, error } = await admin
    .from("client_reminders")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .eq("status", "sent")
    .gte("sent_at", after.toISOString())
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function createReminderIfDue(
  admin: SupabaseAdminClient,
  payload: ReminderInsert,
  cooldownDays: number,
) {
  if (await hasActiveReminder(admin, payload.dedupe_key)) {
    return { created: false, skipped: "active_exists" };
  }

  const cooldownDate = new Date(Date.now() - cooldownDays * DAY_MS);
  if (await lastSentAfter(admin, payload.dedupe_key, cooldownDate)) {
    return { created: false, skipped: "cooldown" };
  }

  const { error } = await admin.from("client_reminders").insert(payload);
  if (error) throw error;

  return { created: true, skipped: null };
}

function buildReminderPayload({
  type,
  clientEmail,
  clientId,
  dossierId,
  dossierTitle,
  dossierType,
  reason,
  dueAt,
  metadata,
}: {
  type: ClientReminderType;
  clientEmail: string;
  clientId?: string | null;
  dossierId?: string | null;
  dossierTitle?: string | null;
  dossierType?: string | null;
  reason: string;
  dueAt?: Date;
  metadata: JsonRecord;
}): ReminderInsert {
  const template = buildReminderTemplate(type, {
    clientEmail,
    clientName: asString(metadata.client_name),
    dossierId,
    dossierTitle,
    dossierType,
    currentStep: asString(metadata.current_step),
    expectedAction: asString(metadata.expected_action),
    appointmentAt: asString(metadata.appointment_at),
    meetingUrl: asString(metadata.meeting_url),
  });

  const dedupeScope =
    asString(metadata.dedupe_scope) || dossierId || clientId || clientEmail;

  return {
    client_email: clientEmail,
    client_id: clientId ?? null,
    dossier_id: dossierId ?? null,
    reminder_type: type,
    status: "ready",
    subject: template.subject,
    body_html: template.html,
    body_text: template.text,
    due_at: (dueAt ?? new Date()).toISOString(),
    dedupe_key: `${type}:${dedupeScope}`,
    metadata: {
      ...metadata,
      reason,
      generated_by: "studio_daily_reminder_job",
    },
  };
}

async function generatePreauditReminders(admin: SupabaseAdminClient) {
  const now = new Date();
  const { data: accessRows, error } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("selen_client_tool_access")
      .select("id, user_id, tool_slug, status, access_type, starts_at, ends_at, updated_at, created_at")
      .in("tool_slug", ["preaudit", "preaudit-qualiopi"])
      .eq("status", "active"),
  );

  if (error) throw error;
  if (!accessRows?.length) return { created: 0, checked: 0 };

  let created = 0;

  for (const access of accessRows) {
    const startsAt = maybeDate(access.starts_at);
    const endsAt = maybeDate(access.ends_at);
    if (startsAt && startsAt > now) continue;
    if (endsAt && endsAt < now) continue;

    const userId = asString(access.user_id);
    const email = await getUserEmail(admin, userId);
    if (!email) continue;

    const { data: sessions, error: sessionsError } = await tableExistsQuery<
      JsonRecord[]
    >(
      admin
        .from("preaudit_sessions")
        .select("id, status, updated_at, created_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1),
    );
    if (sessionsError) throw sessionsError;

    const latestSession = sessions?.[0] ?? null;
    const sessionStatus = asString(latestSession?.status).toLowerCase();
    if (["completed", "done", "finished", "finalized", "termine"].includes(sessionStatus)) {
      continue;
    }

    const dossier = await findDossierForEmail(admin, email, "preaudit");
    const payload = buildReminderPayload({
      type: "preaudit_incomplete_15_days",
      clientEmail: email,
      clientId: userId,
      dossierId: asString(dossier?.id) || null,
      dossierTitle: asString(dossier?.title) || "Préaudit Qualiopi",
      dossierType: "preaudit",
      reason: "Préaudit non terminé pendant la période d'accès actif.",
      metadata: {
        access_id: access.id,
        preaudit_session_id: latestSession?.id ?? null,
        access_ends_at: access.ends_at ?? null,
        client_name: dossier?.organisation?.name ?? null,
      },
    });

    const result = await createReminderIfDue(admin, payload, 15);
    if (result.created) created += 1;
  }

  return { created, checked: accessRows.length };
}

function appointmentDateFromRow(row: JsonRecord) {
  return (
    maybeDate(row.appointment_at) ??
    maybeDate(row.starts_at) ??
    maybeDate(row.start_at) ??
    maybeDate(row.scheduled_at) ??
    maybeDate(row.date_time) ??
    maybeDate(row.slot_start) ??
    maybeDate(row.event_start)
  );
}

async function getReviewAppointment(
  admin: SupabaseAdminClient,
  auditCase: JsonRecord,
) {
  const auditCaseId = asString(auditCase.id);
  const email = asString(auditCase.client_email);
  const { data, error } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("appointment_requests")
      .select("*")
      .or(`audit_blanc_case_id.eq.${auditCaseId},email.eq.${email},client_email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(5),
  );

  if (error) throw error;
  const appointment = data?.find((row) => appointmentDateFromRow(row)) ?? null;
  return appointment ?? null;
}

async function generateAuditBlancReminders(admin: SupabaseAdminClient) {
  const now = new Date();
  const in36h = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  const in60h = new Date(now.getTime() + 60 * 60 * 60 * 1000);

  const { data: cases, error } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("audit_blanc_cases")
      .select("id, dossier_id, client_email, status, calendly_mode, calendly_event_1_start, meeting_url, updated_at, created_at")
      .not("status", "in", '("cancelled","completed")')
      .order("updated_at", { ascending: false }),
  );

  if (error) throw error;
  if (!cases?.length) return { created: 0, checked: 0 };

  let created = 0;

  for (const auditCase of cases) {
    const email = asString(auditCase.client_email).toLowerCase();
    if (!email) continue;

    const appointment = await getReviewAppointment(admin, auditCase);
    const appointmentAt =
      appointmentDateFromRow(appointment ?? {}) ??
      maybeDate(auditCase.calendly_event_1_start);
    const dossierId = asString(auditCase.dossier_id) || null;
    const dossier = dossierId
      ? await admin
          .from("dossiers")
          .select("id, title, type")
          .eq("id", dossierId)
          .maybeSingle()
          .then(({ data }) => data)
      : null;

    if (!appointmentAt) {
      const payload = buildReminderPayload({
        type: "audit_blanc_booking_reminder_7_days",
        clientEmail: email,
        dossierId,
        dossierTitle: asString(dossier?.title) || "Selen Review",
        dossierType: "review",
        reason: "Audit blanc payé ou créé sans rendez-vous fixé.",
        metadata: {
          audit_blanc_case_id: auditCase.id,
          current_step: "prise de rendez-vous audit blanc",
          expected_action: "choisir un créneau dans l'espace client",
        },
      });
      const result = await createReminderIfDue(admin, payload, 7);
      if (result.created) created += 1;
      continue;
    }

    if (appointmentAt >= in36h && appointmentAt <= in60h) {
      const payload = buildReminderPayload({
        type: "audit_blanc_48h_reminder",
        clientEmail: email,
        dossierId,
        dossierTitle: asString(dossier?.title) || "Selen Review",
        dossierType: "review",
        reason: "Rappel préparé environ 48h avant l'audit blanc.",
        metadata: {
          audit_blanc_case_id: auditCase.id,
          appointment_request_id: appointment?.id ?? null,
          appointment_at: appointmentAt.toISOString(),
          meeting_url:
            asString(appointment?.meeting_url) ||
            asString(appointment?.google_meet_url) ||
            asString(auditCase.meeting_url),
          dedupe_scope: `${auditCase.id}:${appointmentAt.toISOString().slice(0, 16)}`,
        },
      });
      const result = await createReminderIfDue(admin, payload, 30);
      if (result.created) created += 1;
    }
  }

  return { created, checked: cases.length };
}

function ndaStep(status?: string | null) {
  const clean = status || "";
  const labels: Record<string, { step: string; action: string }> = {
    waiting_client: {
      step: "dépôt initial attendu",
      action: "déposer les premiers documents demandés",
    },
    to_complete: {
      step: "corrections client attendues",
      action: "corriger ou compléter les éléments signalés",
    },
    generated: {
      step: "documents à signer disponibles",
      action: "télécharger, signer puis déposer les documents demandés",
    },
    collecting_documents: {
      step: "collecte des documents finaux",
      action: "déposer les pièces finales dans l'espace client",
    },
    assigned: {
      step: "dossier attribué",
      action: "consulter les prochaines demandes dans l'espace client",
    },
    in_progress: {
      step: "dossier en cours",
      action: "consulter les demandes en attente dans l'espace client",
    },
  };
  return (
    labels[clean] ?? {
      step: clean || "suivi du dossier",
      action: "consulter l'espace client et réaliser l'action demandée",
    }
  );
}

async function latestClientActivityForDossier(
  admin: SupabaseAdminClient,
  dossierId: string,
  fallback?: string | null,
) {
  const candidates: Date[] = [];
  const fallbackDate = maybeDate(fallback);
  if (fallbackDate) candidates.push(fallbackDate);

  const { data: messages } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("messages")
      .select("created_at")
      .eq("dossier_id", dossierId)
      .eq("sender_type", "client")
      .order("created_at", { ascending: false })
      .limit(1),
  );
  const messageDate = maybeDate(messages?.[0]?.created_at);
  if (messageDate) candidates.push(messageDate);

  const { data: documents } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("documents")
      .select("created_at, updated_at")
      .eq("dossier_id", dossierId)
      .or("source.eq.client,source.eq.client_upload,source.eq.user_upload,source.eq.client_uploaded_document")
      .order("updated_at", { ascending: false })
      .limit(1),
  );
  const documentDate =
    maybeDate(documents?.[0]?.updated_at) ?? maybeDate(documents?.[0]?.created_at);
  if (documentDate) candidates.push(documentDate);

  const { data: programVersions } = await tableExistsQuery<JsonRecord[]>(
    admin
      .from("dossier_program_versions")
      .select("client_decision_at, updated_at")
      .eq("dossier_id", dossierId)
      .not("client_decision", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1),
  );
  const programDate =
    maybeDate(programVersions?.[0]?.client_decision_at) ??
    maybeDate(programVersions?.[0]?.updated_at);
  if (programDate) candidates.push(programDate);

  candidates.sort((a, b) => b.getTime() - a.getTime());
  return candidates[0] ?? null;
}

async function generateNdaReminders(admin: SupabaseAdminClient) {
  const now = new Date();
  const { data: dossiers, error } = await admin
    .from("dossiers")
    .select("id, title, type, status, organisation_id, updated_at, organisations(id, name, email)")
    .in("type", ["nda", "qualiopi"])
    .not("status", "in", '("archived","compliant")')
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!dossiers?.length) return { created: 0, checked: 0 };

  let created = 0;

  for (const dossier of dossiers as JsonRecord[]) {
    const id = asString(dossier.id);
    const organisation = Array.isArray(dossier.organisations)
      ? dossier.organisations[0]
      : (dossier.organisations as JsonRecord | null);
    const email = asString(organisation?.email).toLowerCase();
    if (!id || !email) continue;

    const latestActivity = await latestClientActivityForDossier(
      admin,
      id,
      asString(dossier.updated_at),
    );
    if (!latestActivity) continue;

    const inactiveDays = daysBetween(now, latestActivity);
    if (inactiveDays < 9) continue;

    const step = ndaStep(asString(dossier.status));
    const payload = buildReminderPayload({
      type: "nda_inactive_9_days",
      clientEmail: email,
      dossierId: id,
      dossierTitle: asString(dossier.title) || "Dossier NDA",
      dossierType: asString(dossier.type) || "nda",
      reason: "Aucune action client détectée depuis 9 jours.",
      metadata: {
        client_name: organisation?.name ?? null,
        last_activity_at: latestActivity.toISOString(),
        inactive_days: inactiveDays,
        current_step: step.step,
        expected_action: step.action,
        future_qualiopi_ready: asString(dossier.type) === "qualiopi",
      },
    });
    const result = await createReminderIfDue(admin, payload, 9);
    if (result.created) created += 1;
  }

  return { created, checked: dossiers.length };
}

export async function generateClientReminders(admin = createSupabaseAdminClient()) {
  const [preaudit, auditBlanc, nda] = await Promise.all([
    generatePreauditReminders(admin),
    generateAuditBlancReminders(admin),
    generateNdaReminders(admin),
  ]);

  return {
    preaudit,
    auditBlanc,
    nda,
    created: preaudit.created + auditBlanc.created + nda.created,
    checked: preaudit.checked + auditBlanc.checked + nda.checked,
  };
}

export async function sendClientReminder({
  reminderId,
  agentEmail,
  subject,
  bodyHtml,
  bodyText,
}: {
  reminderId: string;
  agentEmail?: string | null;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: reminder, error } = await admin
    .from("client_reminders")
    .select("*")
    .eq("id", reminderId)
    .maybeSingle();

  if (error) throw error;
  if (!reminder) throw new Error("Relance introuvable.");

  const nextSubject = subject?.trim() || reminder.subject;
  const nextHtml = bodyHtml?.trim() || reminder.body_html;
  const nextText = bodyText?.trim() || reminder.body_text;

  const emailResult = await sendSelenEmail({
    to: reminder.client_email,
    subject: nextSubject,
    html: nextHtml,
    text: nextText,
  });

  const updatePayload: JsonRecord = {
    subject: nextSubject,
    body_html: nextHtml,
    body_text: nextText,
    updated_at: new Date().toISOString(),
    metadata: {
      ...(reminder.metadata ?? {}),
      last_send_attempt_at: new Date().toISOString(),
      last_send_attempt_by: agentEmail ?? null,
      last_send_error: emailResult.error,
    },
  };

  if (emailResult.sent) {
    updatePayload.status = "sent";
    updatePayload.sent_at = new Date().toISOString();
  }

  const { error: updateError } = await admin
    .from("client_reminders")
    .update(updatePayload)
    .eq("id", reminderId);

  if (updateError) throw updateError;

  return emailResult;
}

