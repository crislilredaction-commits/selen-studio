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

const SLA_MS = 72 * 60 * 60 * 1000;
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function isOverdue(value: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time >= SLA_MS;
}
function assignedAgent(metadata: Record<string, unknown> | null) {
  return text(metadata?.assigned_agent_profile_id || metadata?.agent_profile_id) || null;
}
function queuedAt(row: ReminderRow) {
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

  return ((data ?? []) as ReminderRow[])
    .map((row): StudioClientFollowup => {
      const queued = queuedAt(row);
      const overdueShared = isOverdue(queued);
      const reason = text(row.metadata?.reason) || row.subject || "Relance à traiter";
      return {
        id: row.id,
        title: row.client_email || "Partie prenante à relancer",
        detail: reason,
        href: row.dossier_id ? `/agent/dossiers/${row.dossier_id}` : "/agent/relances",
        dueAt: row.due_at,
        assignedAgentProfileId: assignedAgent(row.metadata),
        overdueShared,
        reminderType: row.reminder_type,
        isDaily: dailyReminder(row),
      };
    })
    .filter((row) => (!options?.dailyOnly || row.isDaily) && visible((data ?? []).find((candidate) => candidate.id === row.id) as ReminderRow, staff, row.overdueShared));
}
