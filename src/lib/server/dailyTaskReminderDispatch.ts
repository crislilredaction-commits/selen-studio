import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";

type Reminder = {
  id: string;
  client_email: string;
  dossier_id: string | null;
  subject: string;
  body_html: string;
  body_text: string;
  due_at: string;
  metadata: Record<string, unknown> | null;
};

type OrganisationPreference = {
  id: string;
  daily_task_reminder_mode: "immediate" | "daily_digest";
  daily_task_digest_hour: number;
};

const PARIS_TIME_ZONE = "Europe/Paris";

function parisHour(now: Date) {
  return Number(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: PARIS_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

function parisDateKey(now: Date) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function organisationForReminder(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  reminder: Reminder,
): Promise<OrganisationPreference | null> {
  if (reminder.dossier_id) {
    const { data: dossier, error } = await admin
      .from("dossiers")
      .select("organisation_id")
      .eq("id", reminder.dossier_id)
      .maybeSingle();
    if (error) throw error;
    if (dossier?.organisation_id) {
      const { data, error: organisationError } = await admin
        .from("organisations")
        .select("id, daily_task_reminder_mode, daily_task_digest_hour")
        .eq("id", dossier.organisation_id)
        .maybeSingle();
      if (organisationError) throw organisationError;
      return data as OrganisationPreference | null;
    }
  }

  const { data, error } = await admin
    .from("organisations")
    .select("id, daily_task_reminder_mode, daily_task_digest_hour")
    .eq("email", reminder.client_email)
    .maybeSingle();
  if (error) throw error;
  return data as OrganisationPreference | null;
}

async function alreadySentDigest(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organisationId: string,
  dateKey: string,
) {
  const { data, error } = await admin
    .from("client_reminder_events")
    .select("id")
    .eq("event_type", "daily_digest_sent")
    .contains("metadata", { organisation_id: organisationId, digest_date: dateKey })
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function markSent(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  reminders: Reminder[],
  mode: "immediate" | "daily_digest",
  sentAt: string,
) {
  for (const reminder of reminders) {
    const { error } = await admin
      .from("client_reminders")
      .update({
        status: "sent",
        sent_at: sentAt,
        updated_at: sentAt,
        metadata: {
          ...(reminder.metadata ?? {}),
          delivery_mode: mode,
          delivery_sent_at: sentAt,
        },
      })
      .eq("id", reminder.id)
      .eq("status", "ready");
    if (error) throw error;

    await admin.from("client_reminder_events").insert({
      reminder_id: reminder.id,
      event_type: "sent",
      subject: reminder.subject,
      body_html: reminder.body_html,
      body_text: reminder.body_text,
      metadata: { delivery_mode: mode, sent_at: sentAt },
    });
  }
}

function digestBody(reminders: Reminder[]) {
  const items = reminders
    .map((reminder) => `<li><strong>${reminder.subject}</strong><br>${reminder.body_text}</li>`)
    .join("");
  const text = reminders
    .map((reminder, index) => `${index + 1}. ${reminder.subject}\n${reminder.body_text}`)
    .join("\n\n");
  return {
    html: `<p>Voici les rappels Selen à traiter aujourd’hui :</p><ul>${items}</ul>`,
    text: `Voici les rappels Selen à traiter aujourd’hui :\n\n${text}`,
  };
}

export async function dispatchDueClientReminders(
  admin = createSupabaseAdminClient(),
  now = new Date(),
) {
  const { data, error } = await admin
    .from("client_reminders")
    .select("id, client_email, dossier_id, subject, body_html, body_text, due_at, metadata")
    .eq("status", "ready")
    .lte("due_at", now.toISOString())
    .order("due_at", { ascending: true });
  if (error) throw error;

  const reminders = (data ?? []) as Reminder[];
  const immediate: Array<{ reminder: Reminder; organisation: OrganisationPreference }> = [];
  const digests = new Map<string, { organisation: OrganisationPreference; reminders: Reminder[] }>();

  for (const reminder of reminders) {
    const organisation = await organisationForReminder(admin, reminder);
    if (!organisation) continue;
    if (organisation.daily_task_reminder_mode === "immediate") {
      immediate.push({ reminder, organisation });
    } else {
      const group = digests.get(organisation.id) ?? { organisation, reminders: [] };
      group.reminders.push(reminder);
      digests.set(organisation.id, group);
    }
  }

  let sent = 0;
  let skipped = 0;
  for (const { reminder, organisation } of immediate) {
    const result = await sendClientEmailWithSilence({
      supabase: admin,
      organisationId: organisation.id,
      dossierId: reminder.dossier_id,
      email: reminder.client_email,
      to: reminder.client_email,
      subject: reminder.subject,
      html: reminder.body_html,
      text: reminder.body_text,
    });
    if (!result.sent) {
      skipped += 1;
      continue;
    }
    await markSent(admin, [reminder], "immediate", now.toISOString());
    sent += 1;
  }

  const hour = parisHour(now);
  const dateKey = parisDateKey(now);
  for (const { organisation, reminders: group } of digests.values()) {
    if (hour < organisation.daily_task_digest_hour) {
      skipped += group.length;
      continue;
    }
    if (await alreadySentDigest(admin, organisation.id, dateKey)) {
      skipped += group.length;
      continue;
    }
    const body = digestBody(group);
    const recipient = group[0]?.client_email;
    if (!recipient) continue;
    const result = await sendClientEmailWithSilence({
      supabase: admin,
      organisationId: organisation.id,
      email: recipient,
      to: recipient,
      subject: `Selen — vos rappels du jour (${group.length})`,
      html: body.html,
      text: body.text,
    });
    if (!result.sent) {
      skipped += group.length;
      continue;
    }
    const sentAt = now.toISOString();
    await markSent(admin, group, "daily_digest", sentAt);
    await admin.from("client_reminder_events").insert({
      reminder_id: group[0].id,
      event_type: "daily_digest_sent",
      subject: `Selen — vos rappels du jour (${group.length})`,
      body_html: body.html,
      body_text: body.text,
      metadata: {
        organisation_id: organisation.id,
        digest_date: dateKey,
        reminder_ids: group.map((reminder) => reminder.id),
        reminder_count: group.length,
        sent_at: sentAt,
      },
    });
    sent += group.length;
  }

  return { checked: reminders.length, sent, skipped };
}
