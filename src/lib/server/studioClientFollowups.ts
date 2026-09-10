import { isOverdueAfterBusinessHours } from "@/lib/franceBusinessTime";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export type FollowupStaff = { id: string | null; role: "agent" | "admin" };
export type StudioClientFollowup = {
  id: string;
  title: string;
  detail: string;
  href: string;
  dueAt: string | null;
  assignedAgentProfileId: string | null;
  overdueShared: boolean;
  reminderType: string | null;
  isDaily: boolean;
};

type ReminderRow = {
  id: string;
  client_email: string | null;
  dossier_id: string | null;
  reminder_type: string | null;
  subject: string | null;
  due_at: string | null;
  metadata: Record<string, unknown> | null;
};

const AGENT_SHARED_AFTER_BUSINESS_HOURS = 24;
const SIGNATURE_REMINDER = "daily_signature_pending_72h";
const SIGNATURE_J3_STAGE = "automatic_email_j3";
const SIGNATURE_J6_STAGE = "phone_call_j6";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function isOverdue(value: string | null) {
  return isOverdueAfterBusinessHours(value, AGENT_SHARED_AFTER_BUSINESS_HOURS);
}
function isDue(value: string | null) {
  if (!value) return true;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= Date.now();
}
function assignedAgent(metadata: Record<string, unknown> | null) {
  return text(metadata?.assigned_agent_profile_id || metadata?.agent_profile_id) || null;
}
function followupStage(row: ReminderRow) {
  return text(row.metadata?.followup_stage);
}
function queuedAt(row: ReminderRow) {
  if (row.reminder_type === SIGNATURE_REMINDER && followupStage(row) === SIGNATURE_J6_STAGE) return row.due_at;
  return text(row.metadata?.queued_at || row.metadata?.created_at || row.metadata?.first_due_at) || row.due_at;
}
function dailyReminder(row: ReminderRow) {
  const source = text(row.metadata?.source || row.metadata?.domain || row.metadata?.product || row.metadata?.scope).toLowerCase();
  return source.includes("daily") || String(row.reminder_type ?? "").toLowerCase().startsWith("daily_");
}
function visible(row: ReminderRow, staff: FollowupStaff, overdueShared: boolean) {
  if (staff.role === "admin") return true;
  const agentId = assignedAgent(row.metadata);
  if (!agentId) return true;
  return staff.id === agentId || overdueShared;
}

export async function getStudioClientFollowups(staff: FollowupStaff, options?: { dailyOnly?: boolean }) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("client_reminders")
    .select("id,client_email,dossier_id,reminder_type,status,subject,due_at,metadata")
    .in("status", ["draft", "ready", "postponed"])
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ReminderRow[];
  return rows.flatMap((row): StudioClientFollowup[] => {
    if (row.reminder_type === SIGNATURE_REMINDER) {
      const stage = followupStage(row);
      if (stage === SIGNATURE_J3_STAGE) return [];
      if (!isDue(row.due_at)) return [];
    }
    const overdueShared = isOverdue(queuedAt(row));
    const isDaily = dailyReminder(row);
    if ((options?.dailyOnly && !isDaily) || !visible(row, staff, overdueShared)) return [];
    return [{
      id: row.id,
      title: row.client_email || "Partie prenante à relancer",
      detail: text(row.metadata?.reason) || row.subject || "Relance à traiter",
      href: row.dossier_id ? `/agent/dossiers/${row.dossier_id}` : "/agent/relances",
      dueAt: row.due_at,
      assignedAgentProfileId: assignedAgent(row.metadata),
      overdueShared,
      reminderType: row.reminder_type,
      isDaily,
    }];
  });
}
