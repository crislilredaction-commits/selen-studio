import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type ExternalAuditRow = {
  id: string;
  of_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  audit_type: string;
  certifier: string | null;
  audit_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
  google_calendar_event_id: string | null;
  confirmation_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
};

type AppointmentRow = Record<string, unknown> & { id: string };

const APPOINTMENT_DATE_KEYS = [
  "appointment_at",
  "starts_at",
  "start_at",
  "scheduled_at",
  "date_time",
  "date",
  "slot_start",
  "event_start",
];

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function auditStart(audit: Pick<ExternalAuditRow, "audit_date" | "start_time">) {
  return new Date(`${audit.audit_date}T${audit.start_time}`);
}

export function auditEnd(
  audit: Pick<ExternalAuditRow, "audit_date" | "start_time" | "end_time">,
) {
  if (audit.end_time) return new Date(`${audit.audit_date}T${audit.end_time}`);
  const start = auditStart(audit);
  return new Date(start.getTime() + 7 * 60 * 60 * 1000);
}

export function googleMapsUrl(address?: string | null) {
  if (!address) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    address,
  )}`;
}

export async function findSelenAppointmentConflicts(
  audit: Pick<ExternalAuditRow, "audit_date" | "start_time" | "end_time">,
) {
  const admin = createSupabaseAdminClient();
  const auditStartAt = auditStart(audit).getTime();
  const auditEndAt = auditEnd(audit).getTime();

  const { data } = await admin
    .from("appointment_requests")
    .select("*")
    .in("status", ["booked", "confirmed", "pending"]);

  return ((data ?? []) as AppointmentRow[])
    .map((row) => {
      const rawDate = APPOINTMENT_DATE_KEYS.map((key) => asString(row[key])).find(Boolean);
      const start = rawDate ? new Date(rawDate) : null;
      if (!start || Number.isNaN(start.getTime())) return null;
      const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
      const overlaps = start.getTime() < auditEndAt && end.getTime() > auditStartAt;
      return overlaps
        ? {
            id: row.id,
            label:
              asString(row.email) ||
              asString(row.client_email) ||
              asString(row.first_name) ||
              "RDV Selen",
            startsAt: start.toISOString(),
          }
        : null;
    })
    .filter(Boolean);
}

async function getGoogleAccessToken() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) return null;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { access_token?: string };
  return payload.access_token ?? null;
}

export function getGoogleCalendarConfigStatus() {
  const required = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "GOOGLE_CALENDAR_ID",
    "GOOGLE_CALENDAR_TIMEZONE",
  ];
  const missing = required.filter((key) => !process.env[key]?.trim());
  return {
    configured: missing.length === 0,
    missing,
    calendarId: process.env.GOOGLE_CALENDAR_ID || null,
    timezone: process.env.GOOGLE_CALENDAR_TIMEZONE || null,
  };
}

export async function createGoogleCalendarEvent(audit: ExternalAuditRow) {
  const accessToken = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Paris";

  if (!accessToken) {
    const status = getGoogleCalendarConfigStatus();
    return {
      created: false,
      error: status.configured
        ? "Configuration Google Calendar invalide ou refresh token refuse."
        : "Configuration Google Calendar absente dans Selen Studio. Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID et GOOGLE_CALENDAR_TIMEZONE dans .env.local et dans Vercel.",
      eventId: null,
    };
  }

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `Audit Qualiopi - ${audit.of_name}`,
        location: audit.address || undefined,
        description: [
          `Contact : ${audit.contact_name || "-"}`,
          `Email : ${audit.contact_email || "-"}`,
          `Telephone : ${audit.contact_phone || "-"}`,
          `Type : ${audit.audit_type}`,
          `Certificateur : ${audit.certifier || "-"}`,
        ].join("\n"),
        start: {
          dateTime: auditStart(audit).toISOString(),
          timeZone,
        },
        end: {
          dateTime: auditEnd(audit).toISOString(),
          timeZone,
        },
      }),
    },
  );

  if (!response.ok) {
    return {
      created: false,
      error: `Google Calendar a refuse la creation (${response.status}).`,
      eventId: null,
    };
  }

  const payload = (await response.json()) as { id?: string };
  return { created: true, error: null, eventId: payload.id ?? null };
}

export async function findGoogleCalendarConflicts(audit: ExternalAuditRow) {
  const accessToken = await getGoogleAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const timeZone = process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Paris";

  if (!accessToken) {
    return {
      checked: false,
      conflicts: [] as { start?: string; end?: string }[],
      error: "Configuration Google Calendar absente.",
    };
  }

  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: auditStart(audit).toISOString(),
      timeMax: auditEnd(audit).toISOString(),
      timeZone,
      items: [{ id: calendarId }],
    }),
  });

  if (!response.ok) {
    return {
      checked: false,
      conflicts: [] as { start?: string; end?: string }[],
      error: `Google Calendar freeBusy a echoue (${response.status}).`,
    };
  }

  const payload = (await response.json()) as {
    calendars?: Record<string, { busy?: { start?: string; end?: string }[] }>;
  };
  const conflicts = payload.calendars?.[calendarId]?.busy ?? [];
  return { checked: true, conflicts, error: null };
}
