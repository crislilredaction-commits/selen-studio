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
  audit_delivery_mode: string | null;
  google_calendar_event_id: string | null;
  google_meet_link: string | null;
  calendar_link: string | null;
  confirmation_email_sent_at: string | null;
  reminder_email_sent_at: string | null;
  client_reminder_sent_at: string | null;
  lil_reminder_sent_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
};

type AppointmentRow = Record<string, unknown> & { id: string };

export type ExternalAuditMonthlyStats = {
  currentMonthLabel: string;
  previousMonthLabel: string;
  currentMonthCount: number;
  previousMonthCount: number;
  average3Months: number;
  average12Months: number | null;
  yearTotal: number;
  deliveryModeCurrentMonth: {
    presentiel: number;
    distanciel: number;
  };
  orderGiverCurrentMonth: {
    certifopac: number;
    icpf: number;
    other: number;
  };
};

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

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function monthLabel(key: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${key}-01T12:00:00`));
}

function auditMonthKey(auditDate: string) {
  return auditDate.slice(0, 7);
}

function auditYear(auditDate: string) {
  return auditDate.slice(0, 4);
}

function orderGiverBucket(audit: Pick<ExternalAuditRow, "certifier" | "metadata">) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const raw = [
    audit.certifier,
    metadata.order_giver,
    metadata.donneur_ordre,
    metadata.principal,
    metadata.client_name,
  ]
    .map((value) => (typeof value === "string" ? value : ""))
    .find((value) => value.trim());
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (normalized.includes("certifopac")) return "certifopac";
  if (normalized.includes("icpf")) return "icpf";
  return "other";
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

export function auditDeliveryMode(audit: Pick<ExternalAuditRow, "audit_delivery_mode" | "metadata">) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  const raw =
    String(audit.audit_delivery_mode ?? "").trim() ||
    (typeof metadata.audit_delivery_mode === "string"
      ? metadata.audit_delivery_mode.trim()
      : "");
  return raw === "distanciel" ? "distanciel" : "presentiel";
}

export function isRemoteAudit(audit: Pick<ExternalAuditRow, "audit_delivery_mode" | "metadata">) {
  return auditDeliveryMode(audit) === "distanciel";
}

export function getAuditMeetLink(
  audit: Pick<ExternalAuditRow, "google_meet_link" | "metadata">,
) {
  if (audit.google_meet_link?.trim()) return audit.google_meet_link.trim();
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  for (const key of ["meet_link", "google_meet_link", "google_meet_url", "meet_url"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function getExternalAuditMonthlyStats(
  referenceDate = new Date(),
): Promise<ExternalAuditMonthlyStats> {
  const admin = createSupabaseAdminClient();
  const currentMonthStart = monthStart(referenceDate);
  const currentMonth = monthKey(currentMonthStart);
  const previousMonth = monthKey(addMonths(currentMonthStart, -1));
  const threeMonthKeys = [0, -1, -2].map((offset) =>
    monthKey(addMonths(currentMonthStart, offset)),
  );
  const twelveMonthKeys = Array.from({ length: 12 }, (_, index) =>
    monthKey(addMonths(currentMonthStart, -index)),
  );
  const year = String(referenceDate.getFullYear());
  const oldestNeeded = `${twelveMonthKeys[11]}-01`;

  const { data, error } = await admin
    .from("external_audits")
    .select("id,audit_date,status,audit_delivery_mode,certifier,metadata")
    .neq("status", "cancelled")
    .gte("audit_date", oldestNeeded)
    .order("audit_date", { ascending: true });

  if (error) throw new Error(error.message);

  const audits = (data ?? []) as ExternalAuditRow[];
  const countByMonth = new Map<string, number>();
  let yearTotal = 0;
  const deliveryModeCurrentMonth = { presentiel: 0, distanciel: 0 };
  const orderGiverCurrentMonth = { certifopac: 0, icpf: 0, other: 0 };

  for (const audit of audits) {
    const key = auditMonthKey(audit.audit_date);
    countByMonth.set(key, (countByMonth.get(key) ?? 0) + 1);

    if (auditYear(audit.audit_date) === year) yearTotal += 1;

    if (key === currentMonth) {
      const mode = auditDeliveryMode(audit);
      deliveryModeCurrentMonth[mode] += 1;
      orderGiverCurrentMonth[orderGiverBucket(audit)] += 1;
    }
  }

  const average3Months =
    threeMonthKeys.reduce((sum, key) => sum + (countByMonth.get(key) ?? 0), 0) / 3;
  const hasEnough12MonthData =
    audits.length > 0 && audits.some((audit) => audit.audit_date <= `${twelveMonthKeys[11]}-31`);
  const average12Months = hasEnough12MonthData
    ? twelveMonthKeys.reduce((sum, key) => sum + (countByMonth.get(key) ?? 0), 0) /
      12
    : null;

  return {
    currentMonthLabel: monthLabel(currentMonth),
    previousMonthLabel: monthLabel(previousMonth),
    currentMonthCount: countByMonth.get(currentMonth) ?? 0,
    previousMonthCount: countByMonth.get(previousMonth) ?? 0,
    average3Months,
    average12Months,
    yearTotal,
    deliveryModeCurrentMonth,
    orderGiverCurrentMonth,
  };
}

function googleCalendarDateTime(date: string, time: string) {
  const cleanTime = time.length === 5 ? `${time}:00` : time;
  return `${date}T${cleanTime}`;
}

async function readGoogleErrorBody(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function googleCalendarAuditContext(audit: ExternalAuditRow) {
  return {
    auditId: audit.id,
    auditType: audit.audit_type,
    auditDate: audit.audit_date,
    deliveryMode: auditDeliveryMode(audit),
  };
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
  if (!refreshToken || !clientId || !clientSecret) {
    console.error(
      "Google Calendar: access token unavailable. Check OAuth env vars / refresh token.",
      {
        missing: {
          GOOGLE_CLIENT_ID: !clientId,
          GOOGLE_CLIENT_SECRET: !clientSecret,
          GOOGLE_REFRESH_TOKEN: !refreshToken,
        },
      },
    );
    return null;
  }

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

  if (!response.ok) {
    const body = await readGoogleErrorBody(response);
    console.error(
      "Google Calendar: OAuth token request failed.",
      {
        status: response.status,
        body,
      },
    );
    return null;
  }
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
    console.error(
      "Google Calendar: access token unavailable. Check OAuth env vars / refresh token.",
      {
        ...googleCalendarAuditContext(audit),
        configured: status.configured,
        missing: status.missing,
      },
    );
    return {
      created: false,
      error: status.configured
        ? "Configuration Google Calendar invalide ou refresh token refuse."
        : "Configuration Google Calendar absente dans Selen Studio. Ajoutez GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_CALENDAR_ID et GOOGLE_CALENDAR_TIMEZONE dans .env.local et dans Vercel.",
      eventId: null,
    };
  }

  const remote = isRemoteAudit(audit);
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId,
    )}/events?conferenceDataVersion=1`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: `Audit Qualiopi - ${audit.of_name}`,
        location: remote ? undefined : audit.address || undefined,
        description: [
          `Contact : ${audit.contact_name || "-"}`,
          `Email : ${audit.contact_email || "-"}`,
          `Telephone : ${audit.contact_phone || "-"}`,
          `Type : ${audit.audit_type}`,
          `Modalite : ${remote ? "Distanciel" : "Presentiel"}`,
          `Certificateur : ${audit.certifier || "-"}`,
          remote ? "Google Meet demande automatiquement." : "",
        ].join("\n"),
        start: {
          dateTime: googleCalendarDateTime(audit.audit_date, audit.start_time),
          timeZone,
        },
        end: {
          dateTime: googleCalendarDateTime(
            audit.audit_date,
            audit.end_time || auditEnd(audit).toTimeString().slice(0, 8),
          ),
          timeZone,
        },
        conferenceData: remote
          ? {
              createRequest: {
                requestId: `selen-audit-${audit.id}-${Date.now()}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            }
          : undefined,
      }),
    },
  );

  if (!response.ok) {
    const body = await readGoogleErrorBody(response);
    console.error(
      "Google Calendar: event creation failed.",
      {
        ...googleCalendarAuditContext(audit),
        status: response.status,
        body,
      },
    );
    return {
      created: false,
      error: `Google Calendar a refuse la creation (${response.status}).`,
      eventId: null,
    };
  }

  const payload = (await response.json()) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  };
  const meetLink =
    payload.hangoutLink ||
    payload.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video" && entry.uri,
    )?.uri ||
    null;

  return {
    created: true,
    error: null,
    eventId: payload.id ?? null,
    meetLink,
    calendarLink: payload.htmlLink ?? null,
  };
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
