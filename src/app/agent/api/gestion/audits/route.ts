import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createGoogleCalendarEvent, findGoogleCalendarConflicts, findSelenAppointmentConflicts, getAuditMeetLink, isRemoteAudit, type ExternalAuditRow } from "@/lib/server/externalAudits";
import { eurosToCents } from "@/lib/lilInvoiceShared";

const STATUSES = new Set(["planned", "confirmed", "completed", "to_invoice", "cancelled"]);
const DEPARTURE_MODES = new Set(["home", "mother", "custom"]);
const DELIVERY_MODES = new Set(["presentiel", "distanciel"]);
type AuditDay = { date: string; start_time: string; end_time: string | null };

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

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const admin = createSupabaseAdminClient();
    let previousMetadata: Record<string, unknown> = {};
    if (id) {
      const { data: existingAudit, error: existingError } = await admin.from("external_audits").select("metadata").eq("id", id).maybeSingle();
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
      previousMetadata = existingAudit?.metadata && typeof existingAudit.metadata === "object" ? existingAudit.metadata as Record<string, unknown> : {};
    }

    const auditDays = normalizeAuditDays(body.auditDays, { date: body.auditDate, start: body.startTime, end: body.endTime });
    if (!auditDays.length) return NextResponse.json({ error: "Ajoute au moins une journée avec une date et une heure de début." }, { status: 400 });
    for (const day of auditDays) {
      if (day.end_time && day.end_time <= day.start_time) return NextResponse.json({ error: `L'heure de fin doit être après l'heure de début pour le ${day.date}.` }, { status: 400 });
    }
    const firstDay = auditDays[0];
    const lastDay = auditDays[auditDays.length - 1];
    const departureMode = String(body.departureMode ?? "home").trim();
    const requestedDeliveryMode = String(body.auditDeliveryMode ?? body.audit_delivery_mode ?? "presentiel").trim();
    const auditDeliveryMode = DELIVERY_MODES.has(requestedDeliveryMode) ? requestedDeliveryMode : "presentiel";
    const remoteAudit = auditDeliveryMode === "distanciel";
    const normalizedDepartureMode = DEPARTURE_MODES.has(departureMode) ? departureMode : "home";
    const departureAddress = normalizedDepartureMode === "custom" ? String(body.departureAddress ?? "").trim() : normalizedDepartureMode === "mother" ? "Abbeville" : "Droupt-Saint-Basle";
    const travelDurationMinutes = remoteAudit ? "" : normalizeTravelMinutes(body.travelDurationMinutes);
    const planAuditSent = boolValue(body.planAuditSent);
    const previousPlanSent = previousMetadata.plan_audit_sent === true;
    const now = new Date().toISOString();
    const travelExpenseCents = moneyCents(body.travelExpenseAmount);
    const payload = {
      of_name: String(body.ofName ?? "").trim(), contact_name: String(body.contactName ?? "").trim() || null,
      contact_email: String(body.contactEmail ?? "").trim().toLowerCase() || null, contact_phone: String(body.contactPhone ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null, audit_type: String(body.auditType ?? "").trim(), audit_delivery_mode: auditDeliveryMode,
      certifier: String(body.certifier ?? "").trim() || null, audit_date: firstDay.date, start_time: firstDay.start_time, end_time: firstDay.end_time,
      status: String(body.status ?? "planned").trim(),
      metadata: { ...previousMetadata, audit_days: auditDays, audit_end_date: lastDay.date, audit_delivery_mode: auditDeliveryMode,
        audit_reference: String(body.auditReference ?? "").trim(), audit_amount_cents: moneyCents(body.auditAmount), travel_expense_cents: travelExpenseCents, travel_expenses_cents: travelExpenseCents,
        notes: String(body.notes ?? "").trim(), departure_mode: remoteAudit ? null : normalizedDepartureMode, departure_address: remoteAudit ? null : departureAddress,
        travel_duration_minutes: remoteAudit ? null : travelDurationMinutes, plan_audit_sent: planAuditSent,
        plan_audit_sent_at: planAuditSent ? previousMetadata.plan_audit_sent_at || now : null, plan_audit_status: planAuditSent ? "Envoyé" : "À envoyer",
        plan_audit_updated_at: planAuditSent !== previousPlanSent ? now : previousMetadata.plan_audit_updated_at, updated_by: auth.email },
    };
    if (!payload.of_name || !payload.audit_type) return NextResponse.json({ error: "OF et type d'audit sont requis." }, { status: 400 });
    if (!STATUSES.has(payload.status)) return NextResponse.json({ error: "Statut invalide." }, { status: 400 });

    const conflictGroups = await Promise.all(auditDays.map((day) => findSelenAppointmentConflicts({ audit_date: day.date, start_time: day.start_time, end_time: day.end_time })));
    const conflicts = conflictGroups.flat();
    const query = id ? admin.from("external_audits").update(payload).eq("id", id).select("*").single() : admin.from("external_audits").insert(payload).select("*").single();
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const savedAudit = data as ExternalAuditRow;
    const googleConflicts = await findGoogleCalendarConflicts(savedAudit);
    const shouldCreateCalendar = !savedAudit.google_calendar_event_id || (isRemoteAudit(savedAudit) && !getAuditMeetLink(savedAudit));
    const calendar = !shouldCreateCalendar ? { created: false, error: null, eventId: savedAudit.google_calendar_event_id, meetLink: savedAudit.google_meet_link ?? null, calendarLink: savedAudit.calendar_link ?? null } : await createGoogleCalendarEvent(savedAudit);
    if (calendar.created && calendar.eventId) {
      await admin.from("external_audits").update({ google_calendar_event_id: calendar.eventId, google_meet_link: calendar.meetLink ?? savedAudit.google_meet_link ?? null, calendar_link: calendar.calendarLink ?? savedAudit.calendar_link ?? null,
        metadata: { ...(savedAudit.metadata ?? {}), calendar_created_by: auth.email, calendar_created_at: new Date().toISOString(), meet_link: calendar.meetLink ?? undefined, google_meet_link: calendar.meetLink ?? undefined, calendar_link: calendar.calendarLink ?? undefined, selen_conflicts: conflicts, google_conflicts: googleConflicts.conflicts } }).eq("id", savedAudit.id);
    }
    return NextResponse.json({ ok: true, audit: data, calendar, conflicts, googleConflicts, conflictWarning: conflicts.length > 0 ? "Conflit avec un RDV Selen à reporter." : googleConflicts.conflicts.length > 0 ? "Conflit avec un événement Google Calendar existant." : null });
  } catch (error) {
    console.error("Sauvegarde audit externe échouée.", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { auditId } = await req.json(); const id = String(auditId ?? "").trim();
    if (!id) return NextResponse.json({ error: "auditId requis." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    const { data: audit, error } = await admin.from("external_audits").select("id,status").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!audit) return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
    if (audit.status !== "cancelled") return NextResponse.json({ error: "Seul un audit annulé peut être supprimé définitivement." }, { status: 400 });
    const { error: deleteError } = await admin.from("external_audits").delete().eq("id", id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Suppression audit externe échouée.", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erreur inconnue." }, { status: 500 });
  }
}
