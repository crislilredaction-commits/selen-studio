import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import {
  createGoogleCalendarEvent,
  findGoogleCalendarConflicts,
  findSelenAppointmentConflicts,
  getAuditMeetLink,
  isRemoteAudit,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { auditId } = await req.json();
    const id = String(auditId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "auditId requis." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: audit, error } = await admin
      .from("external_audits")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!audit) {
      return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
    }

    const typedAudit = audit as ExternalAuditRow;
    if (typedAudit.google_calendar_event_id && !(isRemoteAudit(typedAudit) && !getAuditMeetLink(typedAudit))) {
      return NextResponse.json({
        ok: true,
        calendar: {
          created: false,
          alreadyExists: true,
          error: "Evenement deja cree.",
          eventId: typedAudit.google_calendar_event_id,
        },
        conflicts: [],
        googleConflicts: { checked: false, conflicts: [], error: null },
        conflictWarning: null,
      });
    }

    const conflicts = await findSelenAppointmentConflicts(typedAudit);
    const googleConflicts = await findGoogleCalendarConflicts(typedAudit);
    const calendar = await createGoogleCalendarEvent(typedAudit);

    if (calendar.created && calendar.eventId) {
      await admin
        .from("external_audits")
        .update({
          google_calendar_event_id: calendar.eventId,
          google_meet_link: calendar.meetLink ?? typedAudit.google_meet_link ?? null,
          calendar_link: calendar.calendarLink ?? typedAudit.calendar_link ?? null,
          metadata: {
            ...(typedAudit.metadata ?? {}),
            calendar_created_by: auth.email,
            calendar_created_at: new Date().toISOString(),
            meet_link: calendar.meetLink ?? undefined,
            google_meet_link: calendar.meetLink ?? undefined,
            calendar_link: calendar.calendarLink ?? undefined,
            selen_conflicts: conflicts,
            google_conflicts: googleConflicts.conflicts,
          },
        })
        .eq("id", id);
    }

    return NextResponse.json({
      ok: true,
      calendar,
      conflicts,
      googleConflicts,
      conflictWarning:
        conflicts.length > 0
          ? "Conflit avec un RDV Selen a reporter."
          : googleConflicts.conflicts.length > 0
            ? "Conflit avec un evenement Google Calendar existant."
            : null,
    });
  } catch (error) {
    console.error("Creation evenement audit externe echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
