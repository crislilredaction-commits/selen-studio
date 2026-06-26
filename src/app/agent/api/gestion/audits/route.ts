import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import {
  createGoogleCalendarEvent,
  findGoogleCalendarConflicts,
  findSelenAppointmentConflicts,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";

const STATUSES = new Set(["planned", "confirmed", "completed", "cancelled"]);
const DEPARTURE_MODES = new Set(["home", "mother", "custom"]);

function normalizeTravelMinutes(value: unknown) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.round(parsed)) : "";
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const id = String(body.id ?? "").trim();
    const admin = createSupabaseAdminClient();
    let previousMetadata: Record<string, unknown> = {};
    if (id) {
      const { data: existingAudit, error: existingError } = await admin
        .from("external_audits")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();
      if (existingError) {
        return NextResponse.json({ error: existingError.message }, { status: 500 });
      }
      previousMetadata =
        existingAudit?.metadata && typeof existingAudit.metadata === "object"
          ? (existingAudit.metadata as Record<string, unknown>)
          : {};
    }

    const departureMode = String(body.departureMode ?? "home").trim();
    const normalizedDepartureMode = DEPARTURE_MODES.has(departureMode)
      ? departureMode
      : "home";
    const departureAddress =
      normalizedDepartureMode === "custom"
        ? String(body.departureAddress ?? "").trim()
        : normalizedDepartureMode === "mother"
          ? "Abbeville"
          : "Droupt-Saint-Basle";
    const travelDurationMinutes = normalizeTravelMinutes(
      body.travelDurationMinutes,
    );
    const payload = {
      of_name: String(body.ofName ?? "").trim(),
      contact_name: String(body.contactName ?? "").trim() || null,
      contact_email: String(body.contactEmail ?? "").trim().toLowerCase() || null,
      contact_phone: String(body.contactPhone ?? "").trim() || null,
      address: String(body.address ?? "").trim() || null,
      audit_type: String(body.auditType ?? "").trim(),
      certifier: String(body.certifier ?? "").trim() || null,
      audit_date: String(body.auditDate ?? "").trim(),
      start_time: String(body.startTime ?? "").trim(),
      end_time: String(body.endTime ?? "").trim() || null,
      status: String(body.status ?? "planned").trim(),
      metadata: {
        ...previousMetadata,
        notes: String(body.notes ?? "").trim(),
        departure_mode: normalizedDepartureMode,
        departure_address: departureAddress,
        travel_duration_minutes: travelDurationMinutes,
        updated_by: auth.email,
      },
    };

    if (!payload.of_name || !payload.audit_type || !payload.audit_date || !payload.start_time) {
      return NextResponse.json(
        { error: "OF, type, date et heure de debut sont requis." },
        { status: 400 },
      );
    }
    if (!STATUSES.has(payload.status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
    }

    const conflicts = await findSelenAppointmentConflicts({
      audit_date: payload.audit_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
    });

    const query = id
      ? admin
          .from("external_audits")
          .update(payload)
          .eq("id", id)
          .select("*")
          .single()
      : admin.from("external_audits").insert(payload).select("*").single();

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const savedAudit = data as ExternalAuditRow;
    const googleConflicts = await findGoogleCalendarConflicts(savedAudit);
    const calendar = savedAudit.google_calendar_event_id
      ? { created: false, error: null, eventId: savedAudit.google_calendar_event_id }
      : await createGoogleCalendarEvent(savedAudit);

    if (calendar.created && calendar.eventId) {
      await admin
        .from("external_audits")
        .update({
          google_calendar_event_id: calendar.eventId,
          metadata: {
            ...(savedAudit.metadata ?? {}),
            calendar_created_by: auth.email,
            calendar_created_at: new Date().toISOString(),
            selen_conflicts: conflicts,
            google_conflicts: googleConflicts.conflicts,
          },
        })
        .eq("id", savedAudit.id);
    }

    return NextResponse.json({
      ok: true,
      audit: data,
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
    console.error("Sauvegarde audit externe echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
