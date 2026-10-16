import { createHash } from "node:crypto";
import { buildAttendanceRegularizationEmail, buildAttendanceRegularizationUrl, resolveLearnerAttendanceAccess } from "@/lib/daily/attendanceRegularizationLink";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

const CLOSED_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "canceled", "abandoned", "completed"]);
const QUALIFIED_ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);
type LearnerRow = { first_name?: string | null; last_name?: string | null; email?: string | null };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function normalizeAttendanceReminderEmail(value: unknown) { return text(value).toLowerCase(); }
function relation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
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
  return Number.isFinite(hours) && Number.isFinite(minutes) && now.minutes >= hours * 60 + minutes;
}
export function attendanceRegularizationCycle(record: { evidence_metadata?: Record<string, unknown> | null } | null) {
  const review = record?.evidence_metadata?.late_review;
  if (!review || typeof review !== "object") return "initial";
  const row = review as Record<string, unknown>;
  const version = Number(row.version);
  return text(row.state) === "rejected" ? `rejected:v${Number.isFinite(version) && version > 0 ? version : 1}` : "initial";
}
export function deterministicAttendanceFollowupId(key: string) {
  const chars = createHash("sha256").update(key).digest("hex").slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export async function prepareAttendanceRegularizationReminder(input: { agentEmail: string; sessionId: string; enrolmentId: string; slotId: string; recipientEmail: string }) {
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin.from("daily_sessions").select("id,organisation_id,status").eq("id", input.sessionId).maybeSingle();
  if (sessionError) return { ok: false as const, status: 503, error: "Session indisponible." };
  if (!session || ["cancelled", "canceled", "archived", "deleted", "removed"].includes(String(session.status).toLowerCase())) return { ok: false as const, status: 404, error: "Session introuvable ou inactive." };
  if (!await isDailyOrganisationInAgentScope(input.agentEmail, session.organisation_id)) return { ok: false as const, status: 403, error: "Accès refusé." };

  const [{ data: enrolment, error: enrolmentError }, { data: slot, error: slotError }, { data: record, error: recordError }] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,session_id,learner_id,status,daily_learners(first_name,last_name,email)").eq("id", input.enrolmentId).eq("session_id", input.sessionId).maybeSingle(),
    admin.from("daily_attendance_slots").select("id,session_id,slot_date,starts_at,ends_at,label,status").eq("id", input.slotId).eq("session_id", input.sessionId).maybeSingle(),
    admin.from("daily_attendance_records").select("id,status,signed_at,evidence_metadata").eq("enrolment_id", input.enrolmentId).eq("slot_id", input.slotId).maybeSingle(),
  ]);
  if (enrolmentError || slotError || recordError) return { ok: false as const, status: 503, error: "État d’émargement indisponible." };
  if (!enrolment || CLOSED_ENROLMENT_STATUSES.has(String(enrolment.status).toLowerCase())) return { ok: false as const, status: 409, error: "L’inscription n’est plus active." };
  if (!slot || ["cancelled", "canceled"].includes(String(slot.status).toLowerCase()) || !slotHasEnded(slot.slot_date, slot.ends_at)) return { ok: false as const, status: 409, error: "Le créneau n’est pas terminé ou a été annulé." };
  if (record && QUALIFIED_ATTENDANCE_STATUSES.has(String(record.status).toLowerCase())) return { ok: false as const, status: 409, error: "Cet émargement est déjà qualifié." };
  const review = record?.evidence_metadata?.late_review;
  if (review && typeof review === "object" && text((review as Record<string, unknown>).state) === "awaiting_validation") return { ok: false as const, status: 409, error: "Une preuve est en attente de validation ; la relance est suspendue." };

  const learner = relation<LearnerRow>(enrolment.daily_learners);
  const canonicalEmail = normalizeAttendanceReminderEmail(learner?.email);
  if (!canonicalEmail || input.recipientEmail !== canonicalEmail) return { ok: false as const, status: 409, error: "Le destinataire ne correspond plus à l’apprenant inscrit." };
  const { data: accesses, error: accessError } = await admin.from("daily_portal_access_tokens").select("session_id,portal_type,entity_key,entity_email,token,status,expires_at").eq("session_id", input.sessionId).eq("portal_type", "learner").in("status", ["pending", "viewed"]);
  if (accessError) return { ok: false as const, status: 503, error: "Accès apprenant indisponible." };
  const access = resolveLearnerAttendanceAccess({ accesses: accesses ?? [], sessionId: input.sessionId, learnerId: enrolment.learner_id, learnerEmail: canonicalEmail });
  const url = buildAttendanceRegularizationUrl(getVitrineBaseUrl(), access, input.slotId);
  const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || canonicalEmail;
  const slotLabel = `${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" }).format(new Date(slot.slot_date))} · ${String(slot.starts_at).slice(0, 5)} à ${String(slot.ends_at).slice(0, 5)}`;
  const email = buildAttendanceRegularizationEmail({ learnerName, slotLabel, url, expiresAt: access?.expires_at });
  if (!access || !email) return { ok: false as const, status: 409, error: "Le lien personnel est absent, expiré ou révoqué." };
  return { ok: true as const, admin, session, record, canonicalEmail, learnerName, email, cycle: attendanceRegularizationCycle(record) };
}
