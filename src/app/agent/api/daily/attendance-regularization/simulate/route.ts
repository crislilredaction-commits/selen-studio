import { NextRequest, NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { deterministicAttendanceFollowupId, normalizeAttendanceReminderEmail, prepareAttendanceRegularizationReminder } from "@/lib/server/dailyAttendanceRegularizationReminder";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const sessionId = String(body.sessionId ?? "").trim();
  const enrolmentId = String(body.enrolmentId ?? "").trim();
  const slotId = String(body.slotId ?? "").trim();
  const recipientEmail = normalizeAttendanceReminderEmail(body.recipientEmail);
  if (![sessionId, enrolmentId, slotId].every((value) => UUID.test(value))) return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  if (body.confirmedRecipient !== true) return NextResponse.json({ error: "Confirmez explicitement le destinataire avant la simulation." }, { status: 400 });
  if (!recipientEmail) return NextResponse.json({ error: "Adresse du destinataire requise." }, { status: 400 });

  const prepared = await prepareAttendanceRegularizationReminder({ agentEmail: auth.email, sessionId, enrolmentId, slotId, recipientEmail });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  if (!prepared.email) return NextResponse.json({ error: "La simulation nécessite un accès portail actif ; aucun email envoyé." }, { status: 409 });
  const idempotencyKey = `attendance-regularization-reminder-simulation:v2:${sessionId}:${enrolmentId}:${slotId}:${prepared.canonicalEmail}:${prepared.cycle}`;
  const auditLogId = deterministicAttendanceFollowupId(idempotencyKey);
  const { error: auditError } = await prepared.admin.from("daily_audit_logs").insert({
    id: auditLogId,
    organisation_id: prepared.session.organisation_id,
    actor_user_id: auth.userId,
    actor_type: auth.actorType,
    actor_role: auth.role,
    object_type: "attendance_slot",
    object_id: slotId,
    action: "attendance_regularization_reminder_simulated",
    after_data: { recipient_email: prepared.canonicalEmail, subject: prepared.email.subject, transport: "simulation", delivery_attempted: false },
    context: { session_id: sessionId, enrolment_id: enrolmentId, attendance_slot_id: slotId, idempotency_key: idempotencyKey, template_version: 2, review_cycle: prepared.cycle, link_present: true },
    origin: "Studio",
    reason: "Simulation validée par un acteur habilité ; aucun email envoyé.",
  });
  if (auditError && auditError.code !== "23505") return NextResponse.json({ error: "La simulation n’a pas pu être journalisée." }, { status: 503 });
  return NextResponse.json({ ok: true, simulated: true, deduplicated: auditError?.code === "23505", auditLogId, transport: "simulation" });
}
