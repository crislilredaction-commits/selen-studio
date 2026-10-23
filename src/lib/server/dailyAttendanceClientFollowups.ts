import { isOverdueAfterBusinessHours } from "@/lib/franceBusinessTime";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type AttendanceFollowupStaff = { id: string | null; role: "agent" | "admin" };
export type DailyAttendanceClientFollowup = {
  id: string;
  title: string;
  detail: string;
  href: string;
  dueAt: string;
  assignedAgentProfileId: string | null;
  overdueShared: boolean;
  reminderType: "daily_attendance_regularization_followup";
  isDaily: true;
};

type CommunicationRow = {
  id: string;
  organisation_id: string;
  session_id: string;
  enrolment_id: string;
  recipient_email: string | null;
  recipient_name: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  communication_type: string;
  metadata: Record<string, unknown> | null;
};
type EnrolmentRow = { id: string; session_id: string; status: string | null; daily_learners: unknown };
type SlotRow = { id: string; session_id: string; status: string | null; slot_date: string; starts_at: string; ends_at: string };
type RecordRow = { slot_id: string; enrolment_id: string; status: string | null; evidence_metadata: Record<string, unknown> | null };
type SessionRow = { id: string; status: string | null; internal_reference: string | null; daily_formations: unknown };
type AssignmentRow = { organisation_id: string; agent_profile_id: string };
type LearnerRow = { first_name?: string | null; last_name?: string | null; email?: string | null };
type FormationRow = { title?: string | null };

const FOLLOWUP_AFTER_BUSINESS_HOURS = 24;
const INACTIVE_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "canceled", "abandoned"]);
const INACTIVE_SESSION_STATUSES = new Set(["archived", "cancelled", "canceled", "deleted", "removed"]);
const INACTIVE_SLOT_STATUSES = new Set(["cancelled", "canceled"]);
const RESOLVED_ATTENDANCE_STATUSES = new Set(["present", "absent", "excused"]);

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function relation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return value && typeof value === "object" ? value as T : null;
}
function slotIdOf(row: CommunicationRow) { return text(row.metadata?.attendance_slot_id); }
function communicationAt(row: CommunicationRow) { return row.sent_at || row.created_at; }
function reviewState(record: RecordRow | undefined) {
  const metadata = record?.evidence_metadata && typeof record.evidence_metadata === "object" ? record.evidence_metadata : {};
  const review = metadata.late_review && typeof metadata.late_review === "object" ? metadata.late_review as Record<string, unknown> : {};
  return text(review.state);
}
function reviewCycle(record: RecordRow | undefined) {
  const metadata = record?.evidence_metadata && typeof record.evidence_metadata === "object" ? record.evidence_metadata : {};
  const review = metadata.late_review && typeof metadata.late_review === "object" ? metadata.late_review as Record<string, unknown> : {};
  const version = Number(review.version);
  return reviewState(record) === "rejected" ? `rejected:v${Number.isFinite(version) && version > 0 ? version : 1}` : "initial";
}
function requestCycle(communication: CommunicationRow) {
  if (communication.communication_type === "attendance_reminder") return "initial";
  if (communication.communication_type !== "attendance_correction_request") return null;
  const version = Number(communication.metadata?.review_version);
  return Number.isInteger(version) && version > 0 ? `rejected:v${version}` : null;
}
function parisLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(value));
}
function slotHasEnded(slot: SlotRow, now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const parisDate = `${values.year}-${values.month}-${values.day}`;
  if (slot.slot_date < parisDate) return true;
  if (slot.slot_date > parisDate) return false;
  const [hours, minutes] = String(slot.ends_at).slice(0, 5).split(":").map(Number);
  return Number(values.hour) * 60 + Number(values.minute) >= hours * 60 + minutes;
}

export function buildDailyAttendanceClientFollowups({
  communications,
  enrolments,
  slots,
  records,
  sessions,
  assignments,
  staff,
  now = new Date(),
}: {
  communications: CommunicationRow[];
  enrolments: EnrolmentRow[];
  slots: SlotRow[];
  records: RecordRow[];
  sessions: SessionRow[];
  assignments: AssignmentRow[];
  staff: AttendanceFollowupStaff;
  now?: Date;
}): DailyAttendanceClientFollowup[] {
  const assignmentByOrganisation = new Map(assignments.map((row) => [row.organisation_id, row.agent_profile_id]));
  const enrolmentById = new Map(enrolments.map((row) => [row.id, row]));
  const slotById = new Map(slots.map((row) => [row.id, row]));
  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const recordByTarget = new Map(records.map((row) => [`${row.slot_id}:${row.enrolment_id}`, row]));
  const latestByTargetAndCycle = new Map<string, CommunicationRow>();
  const sentCyclesByTarget = new Map<string, Set<string>>();

  for (const communication of communications) {
    const slotId = slotIdOf(communication);
    if (!slotId || !["sent", "delivered"].includes(communication.status)) continue;
    const key = `${slotId}:${communication.enrolment_id}`;
    if (communication.communication_type === "attendance_regularization_followup") {
      const cycle = text(communication.metadata?.review_cycle) || "initial";
      const sentCycles = sentCyclesByTarget.get(key) ?? new Set<string>();
      sentCycles.add(cycle);
      sentCyclesByTarget.set(key, sentCycles);
      continue;
    }
    const cycle = requestCycle(communication);
    if (!cycle) continue;
    const cycleKey = `${key}:${cycle}`;
    const previous = latestByTargetAndCycle.get(cycleKey);
    if (!previous || Date.parse(communicationAt(previous)) < Date.parse(communicationAt(communication))) latestByTargetAndCycle.set(cycleKey, communication);
  }

  return [...latestByTargetAndCycle.values()].flatMap((communication): DailyAttendanceClientFollowup[] => {
    const assignedAgentProfileId = assignmentByOrganisation.get(communication.organisation_id) ?? null;
    if (staff.role !== "admin" && (!assignedAgentProfileId || assignedAgentProfileId !== staff.id)) return [];
    const lastSentAt = communicationAt(communication);
    if (!isOverdueAfterBusinessHours(lastSentAt, FOLLOWUP_AFTER_BUSINESS_HOURS, now)) return [];

    const slotId = slotIdOf(communication);
    const enrolment = enrolmentById.get(communication.enrolment_id);
    const slot = slotById.get(slotId);
    const session = sessionById.get(communication.session_id);
    const record = recordByTarget.get(`${slotId}:${communication.enrolment_id}`);
    if (!enrolment || enrolment.session_id !== communication.session_id || (!text(enrolment.status) || INACTIVE_ENROLMENT_STATUSES.has(text(enrolment.status).toLowerCase()))) return [];
    if (!slot || slot.session_id !== communication.session_id || (!text(slot.status) || INACTIVE_SLOT_STATUSES.has(text(slot.status).toLowerCase())) || !slotHasEnded(slot, now)) return [];
    if (!session || (!text(session.status) || INACTIVE_SESSION_STATUSES.has(text(session.status).toLowerCase()))) return [];
    if (record && RESOLVED_ATTENDANCE_STATUSES.has(text(record.status).toLowerCase())) return [];
    if (reviewState(record) === "awaiting_validation") return [];
    if (requestCycle(communication) !== reviewCycle(record)) return [];
    if (sentCyclesByTarget.get(`${slotId}:${communication.enrolment_id}`)?.has(reviewCycle(record))) return [];

    const learner = relation<LearnerRow>(enrolment.daily_learners);
    const formation = relation<FormationRow>(session.daily_formations);
    const learnerName = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || communication.recipient_name || communication.recipient_email || learner?.email || "Apprenant";
    const sessionLabel = formation?.title || session.internal_reference || "Session Daily";
    const rejected = reviewState(record) === "rejected";
    return [{
      id: `attendance-followup-${communication.id}`,
      title: learnerName,
      detail: `${sessionLabel} · relance d’émargement ${rejected ? "à reprendre après rejet" : "restée sans régularisation"} depuis le ${parisLabel(lastSentAt)}`,
      href: `/agent/daily/session-dossiers/${encodeURIComponent(communication.session_id)}/full#attendance-${encodeURIComponent(slotId)}-${encodeURIComponent(communication.enrolment_id)}`,
      dueAt: lastSentAt,
      assignedAgentProfileId,
      overdueShared: false,
      reminderType: "daily_attendance_regularization_followup",
      isDaily: true,
    }];
  });
}

export async function getDailyAttendanceClientFollowups(staff: AttendanceFollowupStaff) {
  const admin = createSupabaseAdminClient();
  const activeOrganisationIds = await getActiveDailyOrganisationIds();
  if (!activeOrganisationIds.length) return [];

  const { data: assignmentData, error: assignmentError } = await admin
    .from("daily_organisation_assignments")
    .select("organisation_id,agent_profile_id")
    .in("organisation_id", activeOrganisationIds);
  if (assignmentError) throw new Error(`Relances d’émargement indisponibles : ${assignmentError.message}`);
  const assignments = (assignmentData ?? []) as AssignmentRow[];
  const visibleOrganisationIds = staff.role === "admin"
    ? activeOrganisationIds
    : assignments.filter((row) => row.agent_profile_id === staff.id).map((row) => row.organisation_id);
  if (!visibleOrganisationIds.length) return [];

  const communications: CommunicationRow[] = [];
  const pageSize = 500;
  for (let offset = 0;; offset += pageSize) {
    const { data, error } = await admin
      .from("daily_communications")
      .select("id,organisation_id,session_id,enrolment_id,recipient_email,recipient_name,status,sent_at,created_at,communication_type,metadata")
      .in("organisation_id", visibleOrganisationIds)
      .in("communication_type", ["attendance_reminder", "attendance_correction_request", "attendance_regularization_followup"])
      .in("status", ["sent", "delivered"])
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Relances d’émargement indisponibles : ${error.message}`);
    const page = (data ?? []) as CommunicationRow[];
    communications.push(...page);
    if (page.length < pageSize) break;
  }
  if (!communications.length) return [];

  const sessionIds = [...new Set(communications.map((row) => row.session_id))];
  const enrolmentIds = [...new Set(communications.map((row) => row.enrolment_id))];
  const slotIds = [...new Set(communications.map(slotIdOf).filter(Boolean))];
  const [enrolmentRes, slotRes, recordRes, sessionRes] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,session_id,status,daily_learners(first_name,last_name,email)").in("id", enrolmentIds).in("organisation_id", visibleOrganisationIds),
    admin.from("daily_attendance_slots").select("id,session_id,status,slot_date,starts_at,ends_at").in("id", slotIds).in("organisation_id", visibleOrganisationIds),
    admin.from("daily_attendance_records").select("slot_id,enrolment_id,status,evidence_metadata").in("slot_id", slotIds).in("enrolment_id", enrolmentIds).in("organisation_id", visibleOrganisationIds),
    admin.from("daily_sessions").select("id,status,internal_reference,daily_formations(title)").in("id", sessionIds).in("organisation_id", visibleOrganisationIds),
  ]);
  const readError = enrolmentRes.error ?? slotRes.error ?? recordRes.error ?? sessionRes.error;
  if (readError) throw new Error(`Relances d’émargement indisponibles : ${readError.message}`);

  return buildDailyAttendanceClientFollowups({
    communications,
    enrolments: (enrolmentRes.data ?? []) as unknown as EnrolmentRow[],
    slots: (slotRes.data ?? []) as SlotRow[],
    records: (recordRes.data ?? []) as RecordRow[],
    sessions: (sessionRes.data ?? []) as unknown as SessionRow[],
    assignments,
    staff,
  });
}
