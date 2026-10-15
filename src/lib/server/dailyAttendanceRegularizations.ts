import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";

export type AttendanceRegularizationStaff = { id: string | null; role: "agent" | "admin" };
export type DailyAttendanceRegularization = { id: string; sessionId: string; title: string; detail: string; href: string; slotEndedAt: string };

type SlotRow = { id: string; organisation_id: string; session_id: string; slot_date: string; starts_at: string; ends_at: string; status: string | null; daily_sessions: unknown };
type EnrolmentRow = { id: string; organisation_id: string; session_id: string; status: string | null; daily_learners: unknown };
type RecordRow = { slot_id: string; enrolment_id: string; status: string | null };
type OrganisationRow = { id: string; name: string | null; legal_name: string | null };
type AssignmentRow = { organisation_id: string; agent_profile_id: string };
type FormationRow = { title?: string | null };
type SessionRow = { internal_reference?: string | null; status?: string | null; daily_formations?: FormationRow | FormationRow[] | null };
type LearnerRow = { first_name?: string | null; last_name?: string | null; email?: string | null };

const INACTIVE_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "canceled", "abandoned"]);
const RESOLVED_ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);
const INACTIVE_SESSION_STATUSES = new Set(["cancelled", "canceled", "deleted", "removed"]);

function relation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}

function parisNow() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, minutes: Number(values.hour) * 60 + Number(values.minute) };
}

function slotHasEnded(slot: SlotRow, now = parisNow()) {
  if (slot.slot_date < now.date) return true;
  if (slot.slot_date > now.date) return false;
  const [hours, minutes] = String(slot.ends_at).slice(0, 5).split(":").map(Number);
  return now.minutes > hours * 60 + minutes;
}

function slotTimestamp(slot: SlotRow) {
  return `${slot.slot_date}T${String(slot.ends_at).slice(0, 5)}:00`;
}

export async function getDailyAttendanceRegularizations(staff: AttendanceRegularizationStaff): Promise<DailyAttendanceRegularization[]> {
  const admin = createSupabaseAdminClient();
  const activeOrganisationIds = await getActiveDailyOrganisationIds();
  if (activeOrganisationIds.length === 0) return [];

  const [organisationRes, assignmentRes, slotRes] = await Promise.all([
    admin.from("organisations").select("id,name,legal_name").in("id", activeOrganisationIds).neq("status", "archived"),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id").in("organisation_id", activeOrganisationIds),
    admin.from("daily_attendance_slots").select("id,organisation_id,session_id,slot_date,starts_at,ends_at,status,daily_sessions!inner(internal_reference,status,daily_formations(title,status))").in("organisation_id", activeOrganisationIds).neq("status", "cancelled").order("slot_date", { ascending: true }).order("starts_at", { ascending: true }),
  ]);
  const firstError = organisationRes.error ?? assignmentRes.error ?? slotRes.error;
  if (firstError) throw new Error(`File de régularisation indisponible : ${firstError.message}`);

  const assignments = (assignmentRes.data ?? []) as AssignmentRow[];
  const assignedOrganisationIds = new Set(assignments.filter((row) => staff.role === "admin" || row.agent_profile_id === staff.id).map((row) => row.organisation_id));
  const visibleOrganisationIds = staff.role === "admin" ? new Set(activeOrganisationIds) : assignedOrganisationIds;
  const slots = ((slotRes.data ?? []) as unknown as SlotRow[]).filter((slot) => visibleOrganisationIds.has(slot.organisation_id) && slotHasEnded(slot));
  if (slots.length === 0) return [];

  const sessionIds = Array.from(new Set(slots.map((slot) => slot.session_id)));
  const slotIds = slots.map((slot) => slot.id);
  const [enrolmentRes, recordRes] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,organisation_id,session_id,status,daily_learners(first_name,last_name,email)").in("organisation_id", [...visibleOrganisationIds]).in("session_id", sessionIds),
    admin.from("daily_attendance_records").select("slot_id,enrolment_id,status").in("slot_id", slotIds),
  ]);
  if (enrolmentRes.error || recordRes.error) throw new Error(`File de régularisation indisponible : ${enrolmentRes.error?.message ?? recordRes.error?.message}`);

  const organisations = new Map(((organisationRes.data ?? []) as OrganisationRow[]).map((row) => [row.id, row]));
  const enrolments = ((enrolmentRes.data ?? []) as unknown as EnrolmentRow[]).filter((row) => !INACTIVE_ENROLMENT_STATUSES.has(String(row.status ?? "").toLowerCase()));
  const records = (recordRes.data ?? []) as RecordRow[];
  const recordBySlotAndEnrolment = new Map(records.map((row) => [`${row.slot_id}:${row.enrolment_id}`, row]));
  const enrolmentsBySession = new Map<string, EnrolmentRow[]>();
  for (const enrolment of enrolments) enrolmentsBySession.set(enrolment.session_id, [...(enrolmentsBySession.get(enrolment.session_id) ?? []), enrolment]);

  return slots.flatMap((slot) => {
    const session = relation<SessionRow>(slot.daily_sessions);
    if (!session || INACTIVE_SESSION_STATUSES.has(String(session.status ?? "").toLowerCase())) return [];
    const formation = relation<FormationRow>(session?.daily_formations);
    const organisation = organisations.get(slot.organisation_id);
    const sessionTitle = formation?.title || session?.internal_reference || "Session Daily";
    return (enrolmentsBySession.get(slot.session_id) ?? []).flatMap((enrolment): DailyAttendanceRegularization[] => {
      const record = recordBySlotAndEnrolment.get(`${slot.id}:${enrolment.id}`);
      if (record && RESOLVED_ATTENDANCE_STATUSES.has(String(record.status ?? "").toLowerCase())) return [];
      const learner = relation<LearnerRow>(enrolment.daily_learners);
      const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
      const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
      return [{ id: `attendance-regularization-${slot.id}-${enrolment.id}`, sessionId: slot.session_id, title: learnerName, detail: `${organisationName} · ${sessionTitle} · ${slot.slot_date} de ${String(slot.starts_at).slice(0, 5)} à ${String(slot.ends_at).slice(0, 5)}`, href: `/agent/daily/session-dossiers/${encodeURIComponent(slot.session_id)}/full`, slotEndedAt: slotTimestamp(slot) }];
    });
  });
}
