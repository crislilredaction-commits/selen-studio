import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createGoogleCalendarEvent, findGoogleCalendarConflicts, findSelenAppointmentConflicts, getAuditMeetLink, isRemoteAudit, type ExternalAuditRow } from "@/lib/server/externalAudits";
import { refreshGoogleAccessToken } from "@/lib/server/googleOAuth";
import { eurosToCents } from "@/lib/lilInvoiceShared";

const STATUSES = new Set(["planned", "confirmed", "completed", "to_invoice", "cancelled"]);
const DEPARTURE_MODES = new Set(["home", "mother", "custom"]);
const DELIVERY_MODES = new Set(["presentiel", "distanciel"]);
type AuditDay = { date: string; start_time: string; end_time: string | null };

type CalendarDayRef = { eventId: string; date: string };

function normalizeTravelMinutes(value: unknown) { const parsed = Number(String(value ?? "").trim()); return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : ""; }
function boolValue(value: unknown) { return value === true || value === "true" || value === "on"; }
function moneyCents(value: unknown) { if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0; return eurosToCents(String(value ?? "")) ?? 0; }

function normalizeAuditDays(value: unknown, fallback: { date: unknown; start: unknown; end: unknown }): AuditDay[] {
  let raw: unknown = value;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = []; } }
  const values = Array.isArray(raw) ? raw : [];
  const days = values.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const date = String(row.date ?? "").trim();
    const start_time = String(row.start_time ?? row.startTime ?? "").trim();
    const end_time = String(row.end_time ?? row.endTime ?? "").trim() || null;
    return date && start_time ? [{ date, start_time, end_time }] : [];
  });
  if (!days.length) {
    const date = String(fallback.date ?? "").trim();
    const start_time = String(fallback.start ?? "").trim();
    const end_time = String(fallback.end ?? "").trim() || null;
    if (date && start_time) days.push({ date, start_time, end_time });
  }
  days.sort((a, b) => `${a.date}T${a.start_time}`.localeCompare(`${b.date}T${b.start_time}`));
  return days;
}

function calendarRefs(audit: ExternalAuditRow): CalendarDayRef[] {
  const raw = audit.metadata?.google_calendar_events;
  if (Array.isArray(raw)) {
    const refs = raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const eventId = String(row.eventId ?? row.event_id ?? "").trim();
      const date = String(row.date ?? "").trim();
      return eventId ? [{ eventId, date }] : [];
    });
    if (refs.length) return refs;
  }
  return audit.google_calendar_event_id ? [{ eventId: audit.google_calendar_event_id, date: audit.audit_date }] : [];
}

async function googleAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return refreshGoogleAccessToken({ clientId, clientSecret, refreshToken });
}

function eventBody(audit: ExternalAuditRow, day: AuditDay) {
  const remote = isRemoteAudit(audit);
  const end = day.end_time || (() => {
    const [h, m] = day.start_time.slice(0, 5).split(":").map(Number);
    return `${String(Math.min(23, h + 7)).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
  })();
  const tz = process.env.GOOGLE_CALENDAR_TIMEZONE || "Europe/Paris";
  return {
    summary: `Audit Qualiopi - ${audit.of_name}`,
    location: remote ? undefined : audit.address || undefined,
    description: [`Contact : ${audit.contact_name || "-"}`, `Email : ${audit.contact_email || "-"}`, `Telephone : ${audit.contact_phone || "-"}`, `Type : ${audit.audit_type}`, `Modalite : ${remote ? "Distanciel" : "Presentiel"}`, `Certificateur : ${audit.certifier || "-"}`].join("\n"),
    start: { dateTime: `${day.date}T${day.start_time.length === 5 ? `${day.start_time}:00` : day.start_time}`, timeZone: tz },
    end: { dateTime: `${day.date}T${end.length === 5 ? `${end}:00` : end}`, timeZone: tz },
  };
}

async function patchCalendarEvent(audit: ExternalAuditRow, day: AuditDay, eventId: string, accessToken: string) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?conferenceDataVersion=1`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(eventBody(audit, day)),
  });
  if (!response.ok) throw new Error(`Google Calendar a refusé la mise à jour (${response.status}).`);
  const payload = await response.json() as { htmlLink?: string; hangoutLink?: string };
  return { eventId, date: day.date, calendarLink: payload.htmlLink ?? null, meetLink: payload.hangoutLink ?? null };
}

async function deleteCalendarEvent(eventId: string, accessToken: string) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar a refusé la suppression (${response.status}).`);
}

async function syncCalendar(audit: ExternalAuditRow, days: AuditDay[], previous: ExternalAuditRow | null) {
  const existing = previous ? calendarRefs(previous) : [];
  if (!existing.length) {
    const created: CalendarDayRef[] = [];
    let firstResult: Awaited<ReturnType<typeof createGoogleCalendarEvent>> | null = null;
    for (const day of days) {
      const result = await createGoogleCalendarEvent({ ...audit, audit_date: day.date, start_time: day.start_time, end_time: day.end_time });
      if (!firstResult) firstResult = result;
      if (!result.created || !result.eventId) return { ...(firstResult ?? result), events: created };
      created.push({ eventId: result.eventId, date: day.date });
    }
    return { ...(firstResult ?? { created: false, error: null, eventId: null }), events: created };
  }

  const token = await googleAccessToken();
  if (!token) return { created: false, updated: false, error: "Configuration Google Calendar absente.", eventId: existing[0]?.eventId ?? null, events: existing };
  const synced: CalendarDayRef[] = [];
  let calendarLink: string | null = audit.calendar_link;
  let meetLink: string | null = audit.google_meet_link;
  for (let index = 0; index < days.length; index += 1) {
    const day = days[index];
    const current = existing[index];
    if (current) {
      const patched = await patchCalendarEvent(audit, day, current.eventId, token);
      synced.push({ eventId: patched.eventId, date: day.date });
      if (index === 0) { calendarLink = patched.calendarLink ?? calendarLink; meetLink = patched.meetLink ?? meetLink; }
    } else {
      const created = await createGoogleCalendarEvent({ ...audit, google_calendar_event_id: null, audit_date: day.date, start_time: day.start_time, end_time: day.end_time });
      if (!created.created || !created.eventId) throw new Error(created.error || "Création Google Calendar impossible.");
      synced.push({ eventId: created.eventId, date: day.date });
    }
  }
  for (const stale of existing.slice(days.length)) await deleteCalendarEvent(stale.eventId, token);
  return { created: false, updated: true, error: null, eventId: synced[0]?.eventId ?? null, calendarLink, meetLink, events: synced };
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const admin = createSupabaseAdminClient();
    let previousMetadata: Record<string, unknown> = {};
    let previousAudit: ExternalAuditRow | null = null;
    if (id) {
      const { data: existingAudit, error: existingError } = await admin.from("external_audits").select("*").eq("id", id).maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
      previousAudit = existingAudit as ExternalAuditRow | null;
      previousMetadata = previousAudit?.metadata && typeof previousAudit.metadata === "object" ? previousAudit.metadata : {};
    }

    const auditDays = normalizeAuditDays(body.auditDays, { date: body.auditDate, start: body.startTime, end: body.endTime });
    if (!auditDays.length) return NextResponse.json({ error: "Ajoute au moins une journée avec une date et une heure de début." }, { status: 400 });
    for (const day of auditDays) if (day.end_time && day.end_time <= day.start_time) return NextResponse.json({ error: `L'heure de fin doit être après l'heure de début pour le ${day.date}.` }, { status: 400 });
    const firstDay = auditDays[0]; const lastDay = auditDays[auditDays.length - 1];
    const departureMode = String(body.departureMode ?? "home").trim();
    const requestedDeliveryMode = String(body.auditDeliveryMode ?? body.audit_delivery_mode ?? "presentiel").trim();
    const auditDeliveryMode = DELIVERY_MODES.has(requestedDeliveryMode) ? requestedDeliveryMode : "presentiel";
    const remoteAudit = auditDeliveryMode === "distanciel";
    const normalizedDepartureMode = DEPARTURE_MODES.has(departureMode) ? departureMode : "home";
    const departureAddress = normalizedDepartureMode === "custom" ? String(body.departureAddress ?? "").trim() : normalizedDepartureMode === "mother" ? "Abbeville" : "Droupt-Saint-Basle";
    const travelDurationMinutes = remoteAudit ? "" : normalizeTravelMinutes(body.travelDurationMinutes);
    const planAuditSent = boolValue(body.planAuditSent); const previousPlanSent = previousMetadata.plan_audit_sent === true; const now = new Date().toISOString();
    const travelExpenseCents = moneyCents(body.travelExpenseAmount);
    const payload = {
      of_name: String(body.ofName ?? "").trim(), contact_name: String(body.contactName ?? "").trim() || null, contact_email: String(body.contactEmail ?? "").trim().toLowerCase() || null, contact_phone: String(body.contactPhone ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null, audit_type: String(body.auditType ?? "").trim(), audit_delivery_mode: auditDeliveryMode, certifier: String(body.certifier ?? "").trim() || null,
      audit_date: firstDay.date, start_time: firstDay.start_time, end_time: firstDay.end_time, status: String(body.status ?? "planned").trim(),
      metadata: { ...previousMetadata, audit_days: auditDays, audit_end_date: lastDay.date, audit_delivery_mode: auditDeliveryMode, audit_reference: String(body.auditReference ?? "").trim(), audit_amount_cents: moneyCents(body.auditAmount), travel_expense_cents: travelExpenseCents, travel_expenses_cents: travelExpenseCents, notes: String(body.notes ?? "").trim(), departure_mode: remoteAudit ? null : normalizedDepartureMode, departure_address: remoteAudit ? null : departureAddress, travel_duration_minutes: remoteAudit ? null : travelDurationMinutes, plan_audit_sent: planAuditSent, plan_audit_sent_at: planAuditSent ? previousMetadata.plan_audit_sent_at || now : null, plan_audit_status: planAuditSent ? "Envoyé" : "À envoyer", plan_audit_updated_at: planAuditSent !== previousPlanSent ? now : previousMetadata.plan_audit_updated_at, updated_by: auth.email },
    };
    if (!payload.of_name || !payload.audit_type) return NextResponse.json({ error: "OF et type d'audit sont requis." }, { status: 400 });
    if (!STATUSES.has(payload.status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });

    const conflictGroups = await Promise.all(auditDays.map((day) => findSelenAppointmentConflicts({ audit_date: day.date, start_time: day.start_time, end_time: day.end_time })));
    const conflicts = conflictGroups.flat();
    const query = id ? admin.from("external_audits").update(payload).eq("id", id).select("*").single() : admin.from("external_audits").insert(payload).select("*").single();
    const { data, error } = await query; if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const savedAudit = data as ExternalAuditRow;
    const googleConflicts = await findGoogleCalendarConflicts(savedAudit);
    const calendar = await syncCalendar(savedAudit, auditDays, previousAudit);
    if (calendar.eventId) {
      const metadata = { ...(savedAudit.metadata ?? {}), google_calendar_events: calendar.events, calendar_synced_by: auth.email, calendar_synced_at: new Date().toISOString(), meet_link: calendar.meetLink ?? undefined, google_meet_link: calendar.meetLink ?? undefined, calendar_link: calendar.calendarLink ?? undefined, selen_conflicts: conflicts, google_conflicts: googleConflicts.conflicts };
      await admin.from("external_audits").update({ google_calendar_event_id: calendar.eventId, google_meet_link: calendar.meetLink ?? savedAudit.google_meet_link ?? null, calendar_link: calendar.calendarLink ?? savedAudit.calendar_link ?? null, metadata }).eq("id", savedAudit.id);
    }
    return NextResponse.json({ ok: true, audit: data, calendar, conflicts, googleConflicts, conflictWarning: conflicts.length > 0 ? "Conflit avec un RDV Selen à reporter." : googleConflicts.conflicts.length > 0 ? "Conflit avec un événement Google Calendar existant." : null });
  } catch (error) {
    console.error("Sauvegarde audit externe échouée.", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireLilOwner(); if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { auditId } = await req.json(); const id = String(auditId ?? "").trim(); if (!id) return NextResponse.json({ error: "auditId requis." }, { status: 400 });
    const admin = createSupabaseAdminClient(); const { data: audit, error } = await admin.from("external_audits").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 }); if (!audit) return NextResponse.json({ error: "Audit introuvable." }, { status: 404 }); if (audit.status !== "cancelled") return NextResponse.json({ error: "Seul un audit annulé peut être supprimé définitivement." }, { status: 400 });
    const typedAudit = audit as ExternalAuditRow; const refs = calendarRefs(typedAudit); if (refs.length) { const token = await googleAccessToken(); if (token) for (const ref of refs) await deleteCalendarEvent(ref.eventId, token); }
    const { error: deleteError } = await admin.from("external_audits").delete().eq("id", id); if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) { console.error("Suppression audit externe échouée.", error); return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue." }, { status: 500 }); }
}
