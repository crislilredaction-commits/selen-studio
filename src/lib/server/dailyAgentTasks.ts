import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { getDailySessionPhase, isAvailablePhaseItem } from "@/lib/daily/sessionPhase";

export type DailyTaskStaff = { id: string | null; role: "agent" | "admin" };
export type DailyAgentTask = {
  id: string;
  organisationId: string;
  organisation: string;
  title: string;
  reason: string;
  detail: string;
  href: string;
  createdAt: string | null;
  assignedAgentProfileId: string | null;
  overdueShared: boolean;
  kind: "assignment" | "program" | "registration" | "adaptation" | "preaudit" | "satisfaction" | "session";
};

type Org = { id: string; name: string | null; legal_name: string | null; created_at: string | null };
type Assignment = { organisation_id: string; agent_profile_id: string; assigned_at: string | null };
type Session = {
  id: string;
  organisation_id: string;
  formation_id: string;
  internal_reference: string | null;
  registration_status: string | null;
  adaptation_needed: boolean | null;
  registration_responses_received_at: string | null;
  start_date: string | null;
  end_date: string | null;
  updated_at: string | null;
};
type Formation = {
  id: string;
  title: string | null;
  status: string | null;
  agent_review_signaled_at: string | null;
  updated_at: string | null;
};
type Response = { id: string; session_id: string; created_at: string | null };
type SessionChecklistItem = {
  id: string;
  session_id: string;
  organisation_id: string;
  item_key: string;
  phase: string;
  responsibility: string;
  label: string;
  description: string | null;
  status: string;
  signaled_at: string | null;
};
type QualityAction = {
  id: string;
  organisation_id: string;
  session_id: string | null;
  title: string | null;
  observation: string | null;
  proposed_solution: string | null;
  status: string | null;
  source_type: string | null;
  created_at: string | null;
};

const SLA_MS = 72 * 60 * 60 * 1000;
function isOverdue(value: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && Date.now() - time >= SLA_MS;
}
function visibleFor(task: DailyAgentTask, staff: DailyTaskStaff) {
  if (task.kind === "assignment") return true;
  if (staff.role === "admin") return true;
  if (!task.assignedAgentProfileId) return true;
  if (staff.id === task.assignedAgentProfileId) return true;
  return task.overdueShared;
}

export async function getDailyAgentTasks(staff: DailyTaskStaff): Promise<DailyAgentTask[]> {
  const admin = createSupabaseAdminClient();
  const organisationIds = await getActiveDailyOrganisationIds();
  if (organisationIds.length === 0) return [];

  const [orgRes, assignmentRes, sessionRes, actionRes] = await Promise.all([
    admin.from("organisations").select("id,name,legal_name,created_at").in("id", organisationIds).neq("status", "archived"),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id,assigned_at").in("organisation_id", organisationIds),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,registration_status,adaptation_needed,registration_responses_received_at,start_date,end_date,updated_at").in("organisation_id", organisationIds).neq("status", "archived"),
    admin.from("daily_quality_actions").select("id,organisation_id,session_id,title,observation,proposed_solution,status,source_type,created_at").in("organisation_id", organisationIds).in("source_type", ["qualiopi_preaudit", "satisfaction_phone_followup"]).in("status", ["open", "planned"]).order("created_at", { ascending: true }),
  ]);
  const error = orgRes.error ?? assignmentRes.error ?? sessionRes.error ?? actionRes.error;
  if (error) throw new Error(error.message);

  const organisations = (orgRes.data ?? []) as Org[];
  const assignments = (assignmentRes.data ?? []) as Assignment[];
  const sessions = (sessionRes.data ?? []) as Session[];
  const actions = (actionRes.data ?? []) as QualityAction[];
  const assignmentByOrg = new Map(assignments.map((row) => [row.organisation_id, row]));
  const orgById = new Map(organisations.map((row) => [row.id, row]));

  const formationIds = [...new Set(sessions.map((row) => row.formation_id).filter(Boolean))];
  const sessionIds = sessions.map((row) => row.id);
  const [formationRes, responseRes, checklistRes] = await Promise.all([
    formationIds.length ? admin.from("daily_formations").select("id,title,status,agent_review_signaled_at,updated_at").in("id", formationIds).neq("status", "archived") : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? admin.from("daily_registration_responses").select("id,session_id,created_at").in("session_id", sessionIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? admin.from("daily_session_checklist_items").select("id,session_id,organisation_id,item_key,phase,responsibility,label,description,status,signaled_at").in("session_id", sessionIds).in("responsibility", ["selen", "shared"]).in("status", ["todo", "in_progress", "to_review", "blocked"]).order("signaled_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (formationRes.error || responseRes.error || checklistRes.error) throw new Error(formationRes.error?.message ?? responseRes.error?.message ?? checklistRes.error?.message ?? "Erreur Daily");

  const formations = (formationRes.data ?? []) as Formation[];
  const responses = (responseRes.data ?? []) as Response[];
  const checklistItems = (checklistRes.data ?? []) as SessionChecklistItem[];
  const formationById = new Map(formations.map((row) => [row.id, row]));
  const responsesBySession = new Map<string, Response[]>();
  for (const response of responses) responsesBySession.set(response.session_id, [...(responsesBySession.get(response.session_id) ?? []), response]);

  const tasks: DailyAgentTask[] = [];
  for (const organisation of organisations) {
    if (assignmentByOrg.has(organisation.id)) continue;
    tasks.push({
      id: `daily-assignment-${organisation.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: organisation.legal_name || organisation.name || "Nouvel organisme Daily",
      reason: "Assigner un agent",
      detail: "Première étape : désigne l'agent responsable. Il suivra ensuite toutes les formations, sessions et inscriptions de cet organisme.",
      href: `/agent/daily/organisations/${organisation.id}`,
      createdAt: organisation.created_at,
      assignedAgentProfileId: null,
      overdueShared: false,
      kind: "assignment",
    });
  }

  for (const action of actions) {
    const organisation = orgById.get(action.organisation_id);
    const assignment = assignmentByOrg.get(action.organisation_id);
    if (!organisation || !assignment) continue;
    const createdAt = action.created_at;
    const overdueShared = isOverdue(createdAt);
    const satisfaction = action.source_type === "satisfaction_phone_followup";
    tasks.push({
      id: satisfaction ? `daily-satisfaction-${action.id}` : `daily-preaudit-${action.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: action.title || (satisfaction ? "Relance téléphonique satisfaction" : "Pré-audit Qualiopi à préparer"),
      reason: satisfaction ? "Relance satisfaction à effectuer" : "Pré-audit Qualiopi",
      detail: overdueShared
        ? "Cette tâche dépasse 72 h. Le dossier reste assigné à son agent, mais toute l'équipe peut maintenant la traiter."
        : action.observation || action.proposed_solution || (satisfaction
          ? "Contacte la partie prenante par téléphone après les relances email J+2 et J+4 restées sans réponse."
          : "Prépare le pré-audit avant l'audit de surveillance Qualiopi."),
      href: satisfaction && action.session_id
        ? `/agent/daily/session-dossiers/${action.session_id}/satisfaction`
        : `/agent/daily/preaudit/${action.id}`,
      createdAt,
      assignedAgentProfileId: assignment.agent_profile_id,
      overdueShared,
      kind: satisfaction ? "satisfaction" : "preaudit",
    });
  }

  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  for (const item of checklistItems) {
    const session = sessionById.get(item.session_id);
    const organisation = orgById.get(item.organisation_id);
    const assignment = assignmentByOrg.get(item.organisation_id);
    if (!session || !organisation || !assignment) continue;
    const currentPhase = getDailySessionPhase(session);
    if (!isAvailablePhaseItem(item.phase, currentPhase)) continue;

    const formation = formationById.get(session.formation_id);
    if (item.item_key === "training_ready" && formation?.status === "review") continue;

    const createdAt = item.signaled_at ?? session.updated_at;
    const overdueShared = isOverdue(createdAt);
    tasks.push({
      id: `daily-session-checklist-${item.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: formation?.title || session.internal_reference || "Dossier de session",
      reason: item.status === "blocked" ? "Tâche de session bloquée" : item.status === "to_review" ? "Tâche de session à vérifier" : "Tâche de session à traiter",
      detail: overdueShared
        ? `Cette tâche dépasse 72 h : ${item.label}. Le dossier reste assigné à son agent, mais toute l'équipe peut maintenant la traiter.`
        : `${item.label}${item.description ? ` · ${item.description}` : ""}`,
      href: `/agent/daily/session-dossiers/${session.id}`,
      createdAt,
      assignedAgentProfileId: assignment.agent_profile_id,
      overdueShared,
      kind: "session",
    });
  }

  const programSeen = new Set<string>();
  for (const session of sessions) {
    const organisation = orgById.get(session.organisation_id);
    const formation = formationById.get(session.formation_id);
    if (!organisation || !formation) continue;
    const assignment = assignmentByOrg.get(session.organisation_id);
    if (!assignment) continue;
    const orgName = organisation.legal_name || organisation.name || "Organisme Daily";

    if (formation.status === "review" && !programSeen.has(formation.id)) {
      programSeen.add(formation.id);
      const createdAt = formation.agent_review_signaled_at ?? formation.updated_at ?? session.updated_at;
      const overdueShared = isOverdue(createdAt);
      tasks.push({
        id: `daily-program-${formation.id}`,
        organisationId: organisation.id,
        organisation: orgName,
        title: formation.title || session.internal_reference || "Programme de formation",
        reason: "Programme à valider",
        detail: overdueShared ? "Cette tâche dépasse 72 h. Le dossier reste assigné à son agent, mais toute l'équipe peut maintenant la traiter." : "Vérifie le programme puis valide-le ou demande une correction.",
        href: `/agent/daily/session-dossiers/${session.id}`,
        createdAt,
        assignedAgentProfileId: assignment.agent_profile_id,
        overdueShared,
        kind: "program",
      });
      continue;
    }

    if (formation.status !== "validated") continue;
    const registrationResponses = responsesBySession.get(session.id) ?? [];
    if (registrationResponses.length === 0) continue;
    const needsRegistration = session.adaptation_needed === true || ["to_review", "responses_received", "summary_to_review"].includes(session.registration_status ?? "");
    if (!needsRegistration) continue;
    const createdAt = session.registration_responses_received_at ?? registrationResponses[0]?.created_at ?? session.updated_at;
    const overdueShared = isOverdue(createdAt);
    const adaptation = session.adaptation_needed === true;
    tasks.push({
      id: `daily-${adaptation ? "adaptation" : "registration"}-${session.id}`,
      organisationId: organisation.id,
      organisation: orgName,
      title: formation.title || session.internal_reference || "Dossier d'inscription",
      reason: adaptation ? "Adaptation à examiner" : "Dossier d'inscription à traiter",
      detail: overdueShared ? "Cette tâche dépasse 72 h. Le dossier reste assigné à son agent, mais toute l'équipe peut maintenant la traiter." : `${registrationResponses.length} dossier${registrationResponses.length > 1 ? "s" : ""} reçu${registrationResponses.length > 1 ? "s" : ""}. Vérifie les besoins, prérequis et positionnements.`,
      href: `/agent/daily/sessions/${session.id}`,
      createdAt,
      assignedAgentProfileId: assignment.agent_profile_id,
      overdueShared,
      kind: adaptation ? "adaptation" : "registration",
    });
  }

  return tasks.filter((task) => visibleFor(task, staff)).sort((a, b) => {
    if (a.kind === "assignment" && b.kind !== "assignment") return -1;
    if (b.kind === "assignment" && a.kind !== "assignment") return 1;
    if (a.overdueShared !== b.overdueShared) return a.overdueShared ? -1 : 1;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });
}
