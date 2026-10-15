import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { buildAttendanceRegularizationEmail, buildAttendanceRegularizationUrl, resolveLearnerAttendanceAccess } from "@/lib/daily/attendanceRegularizationLink";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLOSED_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "abandoned"]);
const QUALIFIED_ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);

type LearnerRow = { first_name?: string | null; last_name?: string | null; email?: string | null };

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function learnerOf(value: unknown): LearnerRow | null {
  if (Array.isArray(value)) return (value[0] as LearnerRow | undefined) ?? null;
  return value && typeof value === "object" ? value as LearnerRow : null;
}

function parisNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function slotHasEnded(slotDate: string, endsAt: string) {
  const now = parisNow();
  if (slotDate < now.date) return true;
  if (slotDate > now.date) return false;
  const [hours, minutes] = String(endsAt).slice(0, 5).split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) && now.minutes > hours * 60 + minutes;
}

function deterministicAuditId(idempotencyKey: string) {
  const hex = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16], 16) % 4];
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const sessionId = String(body.sessionId ?? "").trim();
  const enrolmentId = String(body.enrolmentId ?? "").trim();
  const slotId = String(body.slotId ?? "").trim();
  const recipientEmail = normalizeEmail(body.recipientEmail);
  if (![sessionId, enrolmentId, slotId].every((value) => UUID.test(value))) return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  if (body.confirmedRecipient !== true) return NextResponse.json({ error: "Confirmez explicitement le destinataire avant la simulation." }, { status: 400 });
  if (!recipientEmail) return NextResponse.json({ error: "Adresse du destinataire requise." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,status").eq("id", sessionId).maybeSingle();
  if (sessionError) return NextResponse.json({ error: "Session indisponible." }, { status: 503 });
  if (!session || session.status === "cancelled") return NextResponse.json({ error: "Session introuvable ou annulée." }, { status: 404 });
  if (!await isDailyOrganisationInAgentScope(auth.email, session.organisation_id)) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const [{ data: enrolment, error: enrolmentError }, { data: slot, error: slotError }, { data: record, error: recordError }] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,daily_learners(first_name,last_name,email)").eq("id", enrolmentId).eq("session_id", sessionId).maybeSingle(),
    admin.from("daily_attendance_slots").select("id,session_id,slot_date,starts_at,ends_at,label,status").eq("id", slotId).eq("session_id", sessionId).maybeSingle(),
    admin.from("daily_attendance_records").select("id,status,signed_at").eq("enrolment_id", enrolmentId).eq("slot_id", slotId).maybeSingle(),
  ]);
  if (enrolmentError || slotError || recordError) return NextResponse.json({ error: "État d’émargement indisponible." }, { status: 503 });
  if (!enrolment || CLOSED_ENROLMENT_STATUSES.has(String(enrolment.status))) return NextResponse.json({ error: "L’inscription n’est plus active." }, { status: 409 });
  if (!slot || slot.status === "cancelled" || !slotHasEnded(slot.slot_date, slot.ends_at)) return NextResponse.json({ error: "Le créneau n’est pas terminé ou a été annulé." }, { status: 409 });
  if (record && QUALIFIED_ATTENDANCE_STATUSES.has(String(record.status))) return NextResponse.json({ error: "Cet émargement est déjà qualifié." }, { status: 409 });

  const learner = learnerOf(enrolment.daily_learners);
  const canonicalEmail = normalizeEmail(learner?.email);
  if (!canonicalEmail || recipientEmail !== canonicalEmail) return NextResponse.json({ error: "Le destinataire ne correspond plus à l’apprenant inscrit." }, { status: 409 });

  const { data: accesses, error: accessError } = await admin.from("daily_portal_access_tokens").select("session_id,portal_type,entity_key,entity_email,token,status,expires_at").eq("session_id", sessionId).eq("portal_type", "learner").in("status", ["pending", "viewed"]);
  if (accessError) return NextResponse.json({ error: "Accès apprenant indisponible." }, { status: 503 });
  const access = resolveLearnerAttendanceAccess({ accesses: accesses ?? [], sessionId, learnerId: enrolment.learner_id, learnerEmail: canonicalEmail });
  const url = buildAttendanceRegularizationUrl(getVitrineBaseUrl(), access, slotId);
  const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || canonicalEmail;
  const slotLabel = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(slot.slot_date))} · ${String(slot.starts_at).slice(0, 5)} à ${String(slot.ends_at).slice(0, 5)}`;
  const email = buildAttendanceRegularizationEmail({ learnerName, slotLabel, url, expiresAt: access?.expires_at });
  if (!access || !email) return NextResponse.json({ error: "Le lien personnel est absent, expiré ou révoqué." }, { status: 409 });

  const idempotencyKey = `attendance-regularization-reminder-simulation:v1:${sessionId}:${enrolmentId}:${slotId}:${canonicalEmail}`;
  const auditLogId = deterministicAuditId(idempotencyKey);
  const auditEntry = {
    id: auditLogId,
    organisation_id: session.organisation_id,
    actor_user_id: auth.userId,
    actor_type: auth.actorType,
    actor_role: auth.role,
    object_type: "attendance_slot",
    object_id: slotId,
    action: "attendance_regularization_reminder_simulated",
    after_data: { recipient_email: canonicalEmail, subject: email.subject, transport: "simulation", delivery_attempted: false },
    context: { session_id: sessionId, enrolment_id: enrolmentId, attendance_slot_id: slotId, idempotency_key: idempotencyKey, template_version: 1, link_present: true },
    origin: "Studio",
    reason: "Simulation validée par un acteur habilité ; aucun email envoyé.",
  };
  const { error: auditError } = await admin.from("daily_audit_logs").insert(auditEntry);
  if (auditError && auditError.code !== "23505") return NextResponse.json({ error: "La simulation n’a pas pu être journalisée." }, { status: 503 });

  return NextResponse.json({ ok: true, simulated: true, deduplicated: auditError?.code === "23505", auditLogId, transport: "simulation" });
}
