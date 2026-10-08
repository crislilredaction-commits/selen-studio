import { isOverdueAfterBusinessHours } from "@/lib/franceBusinessTime";
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
  status: string;
  priority: "urgent" | "high" | "normal";
  dueAt: string | null;
  context: string;
  expectedAction: string;
  assignedAgentProfileId: string | null;
  overdueShared: boolean;
  kind: "assignment" | "program" | "registration" | "adaptation" | "preaudit" | "satisfaction" | "session" | "organisation";
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
  status: string | null;
  updated_at: string | null;
};
type Formation = {
  id: string;
  organisation_id: string;
  creation_mode: string | null;
  detailed_program_document_url: string | null;
  title: string | null;
  status: string | null;
  agent_review_signaled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};
type Response = { id: string; session_id: string; created_at: string | null };
type RegistrationReview = { session_id: string; validated_at: string | null };
type RegistrationDecision = { attached_session_id: string | null };
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
  source_id: string | null;
  created_at: string | null;
};
type SatisfactionEnrolment = { id: string; organisation_id: string; session_id: string; status: string | null };
type SatisfactionResponse = { enrolment_id: string; session_id: string; organisation_id: string };

const AGENT_SHARED_AFTER_BUSINESS_HOURS = 24;
const TERMINAL_PARENT_STATUSES = new Set([
  "archived", "cancelled", "canceled", "deleted", "removed", "obsolete",
  "abandoned", "completed", "done", "closed",
]);

export function isDailyTaskParentActive(status: string | null | undefined) {
  return !status || !TERMINAL_PARENT_STATUSES.has(status.toLowerCase());
}

function priorityFor(status: string, overdueShared: boolean): DailyAgentTask["priority"] {
  if (status === "blocked" || overdueShared) return "urgent";
  if (["to_review", "review", "summary_to_review", "responses_received"].includes(status)) return "high";
  return "normal";
}

function canonicalTask<T extends Omit<DailyAgentTask, "priority">>(task: T): DailyAgentTask {
  return { ...task, priority: priorityFor(task.status, task.overdueShared) };
}
function isOverdue(value: string | null) {
  return isOverdueAfterBusinessHours(value, AGENT_SHARED_AFTER_BUSINESS_HOURS);
}
function visibleFor(task: DailyAgentTask, staff: DailyTaskStaff) {
  if (task.kind === "assignment") return true;
  if (staff.role === "admin") return true;
  if (!task.assignedAgentProfileId) return false;
  if (staff.id === task.assignedAgentProfileId) return true;
  return task.overdueShared;
}
function timestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function registrationReviewIsCurrent(review: RegistrationReview | undefined, latestResponse: Response | undefined) {
  const reviewedAt = timestamp(review?.validated_at);
  const responseAt = timestamp(latestResponse?.created_at);
  return reviewedAt !== null && responseAt !== null && reviewedAt >= responseAt;
}

export function getDailySessionTaskHref(itemKey: string, sessionId: string) {
  const encodedSessionId = encodeURIComponent(sessionId);
  switch (itemKey) {
    case "pretraining_documents":
      return "/agent/daily/pretraining-documents";
    case "trainer_assignment":
      return `/agent/daily/sessions/${encodedSessionId}`;
    case "training_ready":
      return `/agent/daily/session-dossiers/${encodedSessionId}`;
    case "attendance_followup":
      return `/agent/daily/sessions/${encodedSessionId}`;
    case "posttraining_documents":
      return "/agent/daily/posttraining-documents";
    case "quality_analysis_review":
      return `/agent/daily/session-dossiers/${encodedSessionId}/followup`;
    case "selen_closure_review":
      return `/agent/daily/session-dossiers/${encodedSessionId}/closure`;
    default:
      return `/agent/daily/session-dossiers/${encodedSessionId}/full`;
  }
}

export async function getDailyAgentTasks(staff: DailyTaskStaff, options?: { organisationId?: string | null }): Promise<DailyAgentTask[]> {
  const admin = createSupabaseAdminClient();
  const activeOrganisationIds = await getActiveDailyOrganisationIds();
  const requestedOrganisationId = options?.organisationId?.trim() || null;
  const organisationIds = requestedOrganisationId ? activeOrganisationIds.filter((id) => id === requestedOrganisationId) : activeOrganisationIds;
  if (organisationIds.length === 0) return [];

  const [orgRes, assignmentRes, sessionRes, actionRes] = await Promise.all([
    admin.from("organisations").select("id,name,legal_name,created_at").in("id", organisationIds).neq("status", "archived"),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id,assigned_at").in("organisation_id", organisationIds),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,registration_status,adaptation_needed,registration_responses_received_at,start_date,end_date,status,updated_at").in("organisation_id", organisationIds).neq("status", "archived"),
    admin.from("daily_quality_actions").select("id,organisation_id,session_id,title,observation,proposed_solution,status,source_type,source_id,created_at").in("organisation_id", organisationIds).in("source_type", ["qualiopi_preaudit", "satisfaction_phone_followup"]).in("status", ["open", "planned"]).order("created_at", { ascending: true }),
  ]);
  const error = orgRes.error ?? assignmentRes.error ?? sessionRes.error ?? actionRes.error;
  if (error) throw new Error(error.message);

  const organisations = (orgRes.data ?? []) as Org[];
  const assignments = (assignmentRes.data ?? []) as Assignment[];
  const sessions = ((sessionRes.data ?? []) as Session[]).filter((row) => isDailyTaskParentActive(row.status));
  const actions = (actionRes.data ?? []) as QualityAction[];
  const satisfactionEnrolmentIds = actions
    .filter((row) => row.source_type === "satisfaction_phone_followup" && row.source_id)
    .map((row) => row.source_id as string);
  const assignmentByOrg = new Map(assignments.map((row) => [row.organisation_id, row]));
  const orgById = new Map(organisations.map((row) => [row.id, row]));

  const sessionIds = sessions.map((row) => row.id);
  const [formationRes, responseRes, reviewRes, decisionRes, checklistRes, organisationChecklistRes, satisfactionEnrolmentRes, satisfactionResponseRes] = await Promise.all([
    admin.from("daily_formations").select("id,organisation_id,creation_mode,detailed_program_document_url,title,status,agent_review_signaled_at,created_at,updated_at").in("organisation_id", organisationIds).neq("status", "archived"),
    sessionIds.length ? admin.from("daily_registration_responses").select("id,session_id,created_at").in("session_id", sessionIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? admin.from("daily_registration_reviews").select("session_id,validated_at").in("session_id", sessionIds) : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? admin.from("daily_formation_registration_requests").select("attached_session_id").in("attached_session_id", sessionIds).eq("decision_status", "accepted") : Promise.resolve({ data: [], error: null }),
    sessionIds.length ? admin.from("daily_session_checklist_items").select("id,session_id,organisation_id,item_key,phase,responsibility,label,description,status,signaled_at").in("session_id", sessionIds).in("responsibility", ["selen", "shared"]).in("status", ["todo", "in_progress", "to_review", "blocked"]).order("signaled_at", { ascending: true }) : Promise.resolve({ data: [], error: null }),
    admin.from("daily_organisation_checklist_items").select("id,organisation_id,label,status,signaled_at").in("organisation_id", organisationIds).in("status", ["to_review", "blocked"]),
    satisfactionEnrolmentIds.length ? admin.from("daily_session_enrolments").select("id,organisation_id,session_id,status").in("organisation_id", organisationIds).in("id", satisfactionEnrolmentIds) : Promise.resolve({ data: [], error: null }),
    satisfactionEnrolmentIds.length ? admin.from("daily_learner_feedback_responses").select("enrolment_id,session_id,organisation_id").in("organisation_id", organisationIds).in("enrolment_id", satisfactionEnrolmentIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (formationRes.error || responseRes.error || reviewRes.error || decisionRes.error || checklistRes.error || organisationChecklistRes.error || satisfactionEnrolmentRes.error || satisfactionResponseRes.error) throw new Error(formationRes.error?.message ?? responseRes.error?.message ?? reviewRes.error?.message ?? decisionRes.error?.message ?? checklistRes.error?.message ?? organisationChecklistRes.error?.message ?? satisfactionEnrolmentRes.error?.message ?? satisfactionResponseRes.error?.message ?? "Erreur Daily");

  const formations = ((formationRes.data ?? []) as Formation[]).filter((row) => isDailyTaskParentActive(row.status));
  const responses = (responseRes.data ?? []) as Response[];
  const reviews = (reviewRes.data ?? []) as RegistrationReview[];
  const acceptedSessionIds = new Set(((decisionRes.data ?? []) as RegistrationDecision[]).map((row) => row.attached_session_id).filter((value): value is string => Boolean(value)));
  const checklistItems = (checklistRes.data ?? []) as SessionChecklistItem[];
  const formationById = new Map(formations.map((row) => [row.id, row]));
  const sessionById = new Map(sessions.map((row) => [row.id, row]));
  const satisfactionEnrolmentById = new Map(((satisfactionEnrolmentRes.data ?? []) as SatisfactionEnrolment[]).map((row) => [row.id, row]));
  const satisfiedEnrolmentIds = new Set(((satisfactionResponseRes.data ?? []) as SatisfactionResponse[]).map((row) => row.enrolment_id));
  const reviewBySession = new Map(reviews.map((row) => [row.session_id, row]));
  const responsesBySession = new Map<string, Response[]>();
  for (const response of responses) responsesBySession.set(response.session_id, [...(responsesBySession.get(response.session_id) ?? []), response]);

  const tasks: DailyAgentTask[] = [];
  for (const organisation of organisations) {
    if (assignmentByOrg.has(organisation.id)) continue;
    tasks.push(canonicalTask({
      id: `daily-assignment-${organisation.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: organisation.legal_name || organisation.name || "Nouvel organisme Daily",
      reason: "Assigner un agent",
      detail: "Première étape : désigne l'agent responsable. Il suivra ensuite toutes les formations, sessions et inscriptions de cet organisme.",
      href: `/agent/daily/organisations/${organisation.id}`,
      createdAt: organisation.created_at,
      status: "unassigned",
      dueAt: null,
      context: organisation.legal_name || organisation.name || "Organisme Daily",
      expectedAction: "Assigner un agent responsable à cet organisme.",
      assignedAgentProfileId: null,
      overdueShared: false,
      kind: "assignment",
    }));
  }

  for (const action of actions) {
    const organisation = orgById.get(action.organisation_id);
    const assignment = assignmentByOrg.get(action.organisation_id);
    if (!organisation || !assignment) continue;
    if (action.source_type === "satisfaction_phone_followup") {
      const enrolment = action.source_id ? satisfactionEnrolmentById.get(action.source_id) : null;
      if (!enrolment
        || enrolment.organisation_id !== action.organisation_id
        || enrolment.session_id !== action.session_id
        || ["declined", "cancelled", "abandoned"].includes(enrolment.status ?? "")
        || satisfiedEnrolmentIds.has(enrolment.id)) continue;
    }
    if (action.session_id) {
      const linkedSession = sessionById.get(action.session_id);
      const linkedFormation = linkedSession ? formationById.get(linkedSession.formation_id) : null;
      if (!linkedSession || !linkedFormation || linkedFormation.organisation_id !== action.organisation_id) continue;
    }
    const createdAt = action.created_at;
    const overdueShared = isOverdue(createdAt);
    const satisfaction = action.source_type === "satisfaction_phone_followup";
    tasks.push(canonicalTask({
      id: satisfaction ? `daily-satisfaction-${action.id}` : `daily-preaudit-${action.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: action.title || (satisfaction ? "Relance téléphonique satisfaction" : "Pré-audit Qualiopi à préparer"),
      reason: satisfaction ? "Relance satisfaction à effectuer" : "Pré-audit Qualiopi",
      detail: action.observation || action.proposed_solution || (satisfaction
        ? "Contacte la partie prenante par téléphone après les relances email J+2 et J+4 restées sans réponse."
        : "Prépare le pré-audit avant l'audit de surveillance Qualiopi."),
      href: satisfaction && action.session_id
        ? `/agent/daily/session-dossiers/${action.session_id}/satisfaction`
        : `/agent/daily/preaudit/${action.id}`,
      createdAt,
      status: action.status || "open",
      dueAt: null,
      context: `${organisation.legal_name || organisation.name || "Organisme Daily"}${action.session_id ? " · session liée" : ""}`,
      expectedAction: satisfaction ? "Effectuer la relance téléphonique de satisfaction." : "Préparer et contrôler le pré-audit Qualiopi.",
      assignedAgentProfileId: assignment.agent_profile_id,
      overdueShared,
      kind: satisfaction ? "satisfaction" : "preaudit",
    }));
  }

  for (const item of checklistItems) {
    const session = sessionById.get(item.session_id);
    const organisation = orgById.get(item.organisation_id);
    const assignment = assignmentByOrg.get(item.organisation_id);
    if (!session || !organisation || session.organisation_id !== organisation.id) continue;
    const currentPhase = getDailySessionPhase(session);
    if (!isAvailablePhaseItem(item.phase, currentPhase)) continue;

    const formation = formationById.get(session.formation_id);
    if (!formation || formation.organisation_id !== organisation.id) continue;
    if (item.item_key === "pretraining_documents") {
      if (!acceptedSessionIds.has(session.id)) continue;
      const registrationResponses = responsesBySession.get(session.id) ?? [];
      const latestRegistrationResponse = registrationResponses[registrationResponses.length - 1];
      const review = reviewBySession.get(session.id);
      if (!registrationReviewIsCurrent(review, latestRegistrationResponse)) continue;
    }
    if (item.item_key === "training_ready" && formation?.status === "review") continue;

    const createdAt = item.signaled_at ?? session.updated_at;
    const overdueShared = isOverdue(createdAt);
    const sessionLabel = formation?.title || session.internal_reference || "Dossier de session";
    tasks.push(canonicalTask({
      id: `daily-session-checklist-${item.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: item.label,
      reason: item.status === "blocked" ? "Tâche de session bloquée" : item.status === "to_review" ? "Tâche de session à vérifier" : "Tâche de session à traiter",
      detail: `${sessionLabel}${item.description ? ` · ${item.description}` : ""}`,
      href: getDailySessionTaskHref(item.item_key, session.id),
      createdAt,
      status: item.status,
      dueAt: null,
      context: `${organisation.legal_name || organisation.name || "Organisme Daily"} · ${sessionLabel}`,
      expectedAction: item.status === "blocked" ? "Lever le blocage puis terminer cette tâche de session." : "Traiter cette tâche de session.",
      assignedAgentProfileId: assignment?.agent_profile_id ?? null,
      overdueShared,
      kind: "session",
    }));
  }

  const programSeen = new Set<string>();
  for (const session of sessions) {
    const organisation = orgById.get(session.organisation_id);
    const formation = formationById.get(session.formation_id);
    if (!organisation || !formation || formation.organisation_id !== session.organisation_id) continue;
    const assignment = assignmentByOrg.get(session.organisation_id);
    const orgName = organisation.legal_name || organisation.name || "Organisme Daily";

    const importedDraft = formation.status === "draft" && formation.creation_mode === "program_import" && Boolean(formation.detailed_program_document_url);
    if ((formation.status === "review" || importedDraft) && !programSeen.has(formation.id)) {
      programSeen.add(formation.id);
      const createdAt = formation.agent_review_signaled_at ?? (importedDraft ? formation.created_at : null) ?? formation.updated_at ?? session.updated_at;
      const overdueShared = isOverdue(createdAt);
      tasks.push(canonicalTask({
        id: `daily-program-${formation.id}`,
        organisationId: organisation.id,
        organisation: orgName,
        title: formation.title || session.internal_reference || "Programme de formation",
        reason: importedDraft ? "Programme importé à compléter" : "Programme à valider",
        detail: importedDraft ? "Relis l’original transmis par l’OF, saisis son programme dans Selen puis vérifie-le avant validation." : "Vérifie le programme puis valide-le ou demande une correction.",
        href: `/agent/daily/session-dossiers/${session.id}`,
        createdAt,
        status: formation.status || "review",
        dueAt: null,
        context: `${orgName} · ${formation.title || session.internal_reference || "Programme de formation"}`,
        expectedAction: importedDraft ? "Transcrire et vérifier le programme client dans Selen." : "Relire puis valider le programme, ou demander une correction.",
        assignedAgentProfileId: assignment?.agent_profile_id ?? null,
        overdueShared,
        kind: "program",
      }));
      continue;
    }

    if (formation.status !== "validated") continue;
    const registrationResponses = responsesBySession.get(session.id) ?? [];
    if (registrationResponses.length === 0) continue;
    const latestRegistrationResponse = registrationResponses[registrationResponses.length - 1];
    const review = reviewBySession.get(session.id);
    const reviewIsCurrent = registrationReviewIsCurrent(review, latestRegistrationResponse);
    const statusNeedsRegistration = ["to_review", "responses_received", "summary_to_review"].includes(session.registration_status ?? "");
    const needsRegistration = session.adaptation_needed === true || statusNeedsRegistration || !reviewIsCurrent;
    if (!needsRegistration) continue;
    const createdAt = latestRegistrationResponse?.created_at ?? session.registration_responses_received_at ?? session.updated_at;
    const overdueShared = isOverdue(createdAt);
    const adaptation = session.adaptation_needed === true;
    tasks.push(canonicalTask({
      id: `daily-${adaptation ? "adaptation" : "registration"}-${session.id}`,
      organisationId: organisation.id,
      organisation: orgName,
      title: formation.title || session.internal_reference || "Dossier d'inscription",
      reason: adaptation ? "Adaptation à examiner" : !reviewIsCurrent && session.registration_status === "summary_validated" ? "Dossier d'inscription mis à jour" : "Dossier d'inscription à traiter",
      detail: !reviewIsCurrent && session.registration_status === "summary_validated"
        ? `${registrationResponses.length} dossier${registrationResponses.length > 1 ? "s" : ""} reçu${registrationResponses.length > 1 ? "s" : ""}. Une réponse est postérieure à la dernière validation : relis le dossier avant de poursuivre.`
        : `${registrationResponses.length} dossier${registrationResponses.length > 1 ? "s" : ""} reçu${registrationResponses.length > 1 ? "s" : ""}. Vérifie les besoins, prérequis et positionnements.`,
      href: `/agent/daily/sessions/${session.id}`,
      createdAt,
      status: session.registration_status || "to_review",
      dueAt: session.start_date,
      context: `${orgName} · ${formation.title || session.internal_reference || "Dossier d'inscription"}`,
      expectedAction: adaptation ? "Examiner le besoin d'adaptation avant la suite du dossier." : "Relire et valider le dossier d'inscription.",
      assignedAgentProfileId: assignment?.agent_profile_id ?? null,
      overdueShared,
      kind: adaptation ? "adaptation" : "registration",
    }));
  }

  // Imported drafts are actionable before any session exists. Keep the same
  // canonical task identity when a session is subsequently attached.
  for (const formation of formations) {
    if (programSeen.has(formation.id)) continue;
    const importedDraft = formation.status === "draft" && formation.creation_mode === "program_import" && Boolean(formation.detailed_program_document_url);
    if (formation.status !== "review" && !importedDraft) continue;
    const organisation = orgById.get(formation.organisation_id);
    const assignment = assignmentByOrg.get(formation.organisation_id);
    if (!organisation) continue;
    programSeen.add(formation.id);
    const createdAt = formation.agent_review_signaled_at ?? (importedDraft ? formation.created_at : null) ?? formation.updated_at;
    tasks.push(canonicalTask({
      id: `daily-program-${formation.id}`,
      organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily",
      title: formation.title || "Programme de formation",
      reason: importedDraft ? "Programme importé à compléter" : "Programme à valider",
      detail: importedDraft ? "Relis l’original transmis par l’OF, saisis son programme dans Selen puis vérifie-le avant validation." : "Vérifie le programme puis valide-le ou demande une correction.",
      href: `/agent/daily/formations/${formation.id}`,
      createdAt,
      status: formation.status || "review",
      dueAt: null,
      context: `${organisation.legal_name || organisation.name || "Organisme Daily"} · ${formation.title || "Programme de formation"}`,
      expectedAction: importedDraft ? "Transcrire et vérifier le programme client dans Selen." : "Relire puis valider le programme, ou demander une correction.",
      assignedAgentProfileId: assignment?.agent_profile_id ?? null,
      overdueShared: isOverdue(createdAt),
      kind: "program",
    }));
  }

  for (const item of organisationChecklistRes.data ?? []) {
    const organisation = orgById.get(item.organisation_id);
    if (!organisation) continue;
    tasks.push(canonicalTask({ id: `daily-checklist-${item.id}`, organisationId: organisation.id,
      organisation: organisation.legal_name || organisation.name || "Organisme Daily", title: item.label,
      reason: item.status === "blocked" ? "Point Daily bloqué" : "Vérification Daily à effectuer",
      detail: "Contrôle le point signalé dans la checklist de l’organisme.",
      href: `/agent/daily/organisations/${organisation.id}?tab=checklist`, createdAt: item.signaled_at,
      status: item.status,
      dueAt: null,
      context: organisation.legal_name || organisation.name || "Organisme Daily",
      expectedAction: item.status === "blocked" ? "Lever le blocage de ce point Daily." : "Contrôler puis valider ce point Daily.",
      assignedAgentProfileId: assignmentByOrg.get(organisation.id)?.agent_profile_id ?? null,
      overdueShared: isOverdue(item.signaled_at), kind: "organisation" }));
  }

  return tasks.filter((task) => visibleFor(task, staff)).sort((a, b) => {
    if (a.kind === "assignment" && b.kind !== "assignment") return -1;
    if (b.kind === "assignment" && a.kind !== "assignment") return 1;
    if (a.overdueShared !== b.overdueShared) return a.overdueShared ? -1 : 1;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });
}
