import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent, requireSupportAdmin } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";
import { createAgentAssistanceToken } from "@/lib/server/agentAssistanceTokens";
import { getDailyAgentTasks } from "@/lib/server/dailyAgentTasks";
import DailyOrganisationWorkspace from "@/components/daily/DailyOrganisationWorkspace";
import { dailyOrganisationProgramStats } from "@/lib/dailyOrganisationStatistics";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { resendExistingDailyPortalAccess } from "@/lib/server/dailyDirectSessionPortalAccess";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; access_status?: string; access_error?: string }>;
};

type TabKey = "overview" | "programs" | "applications" | "documents" | "info" | "users" | "learners" | "trainers" | "history";
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Vue d’ensemble" },
  { key: "programs", label: "Programmes de formation" },
  { key: "applications", label: "Dossiers d’inscription" },
  { key: "documents", label: "Documents client" },
  { key: "info", label: "Informations" },
  { key: "users", label: "Utilisateurs" },
  { key: "learners", label: "Espaces apprenants" },
  { key: "trainers", label: "Formateurs" },
  { key: "history", label: "Historique" },
];

const membershipRoles = [
  ["manager", "Responsable"],
  ["trainer", "Formateur"],
  ["admin_assistant", "Assistant administratif"],
] as const;
const permissionBlocks = [
  ["users", "Utilisateurs"],
  ["trainers", "Formateurs"],
  ["legal_profile", "Profil légal"],
  ["permanent_documents", "Documents permanents"],
] as const;

function safeTab(value?: string): TabKey {
  return tabs.some((tab) => tab.key === value) ? (value as TabKey) : "overview";
}

async function currentUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function assertOrganisationScope(email: string, organisationId: string) {
  if (!organisationId || !await isDailyOrganisationInAgentScope(email, organisationId)) {
    throw new Error("Organisme hors de ton périmètre Daily.");
  }
}

type QueryError = { message: string };
type RangeQuery<Row> = { range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: QueryError | null }> };
async function readAllRows<Row>(query: () => RangeQuery<Row>) {
  const data: Row[] = [];
  for (let offset = 0;; offset += 500) {
    const result = await query().range(offset, offset + 499);
    if (result.error) return { data: null, error: result.error };
    const page = result.data ?? [];
    data.push(...page);
    if (page.length < 500) return { data, error: null as QueryError | null };
  }
}

async function openAssistanceMode(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "").trim();
  if (!organisationId) throw new Error("Organisme manquant pour le mode assistance.");
  await assertOrganisationScope(auth.email, organisationId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const result = await createAgentAssistanceToken({
    agentUserId: user?.id ?? null,
    agentEmail: user?.email ?? auth.email ?? null,
    organisationId,
    dossierId: null,
    headersList: await headers(),
  });
  redirect(result.url);
}

async function openPortalAssistanceMode(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "").trim();
  const portalAccessId = String(formData.get("portal_access_id") ?? "").trim();
  if (!organisationId || !portalAccessId) {
    throw new Error("Portail délégué incomplet.");
  }
  await assertOrganisationScope(auth.email, organisationId);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const result = await createAgentAssistanceToken({
    agentUserId: user?.id ?? null,
    agentEmail: user?.email ?? auth.email ?? null,
    organisationId,
    portalAccessId,
    headersList: await headers(),
  });
  redirect(result.url);
}

async function resendPortalAccess(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "").trim();
  const portalAccessId = String(formData.get("portal_access_id") ?? "").trim();
  if (!organisationId || !portalAccessId) throw new Error("Accès incomplet.");
  await assertOrganisationScope(auth.email, organisationId);
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  let label: string;
  try {
    const result = await resendExistingDailyPortalAccess({ supabase: admin, accessId: portalAccessId, organisationId, createdBy: actor });
    label = result.status === "sent" ? "Lien envoyé et historisé." : result.status === "paused" ? "Envoi suspendu par le mode silencieux." : "Envoi récent déjà pris en compte.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Renvoi impossible.";
    redirect(`/agent/daily/organisations/${organisationId}?tab=learners&access_error=${encodeURIComponent(message)}`);
  }
  redirect(`/agent/daily/organisations/${organisationId}?tab=learners&access_status=${encodeURIComponent(label)}`);
}

async function assignAgent(formData: FormData) {
  "use server";
  const auth = await requireSupportAdmin();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const agentProfileId = String(formData.get("agent_profile_id") ?? "");
  if (!organisationId || !agentProfileId) throw new Error("Attribution incomplète.");
  await assertOrganisationScope(auth.email, organisationId);
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const { error } = await admin.from("daily_organisation_assignments").upsert({
    organisation_id: organisationId,
    agent_profile_id: agentProfileId,
    assigned_by: actor,
    assigned_at: new Date().toISOString(),
  }, { onConflict: "organisation_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}`);
  revalidatePath("/agent/daily/organisations");
}

async function updateMembershipStatus(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!organisationId || !membershipId || !["active", "disabled", "revoked"].includes(status)) {
    throw new Error("Statut utilisateur invalide.");
  }
  await assertOrganisationScope(auth.email, organisationId);
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const { error } = await admin.from("organisation_memberships").update({
    status,
    disabled_at: status === "active" ? null : new Date().toISOString(),
    disabled_by: status === "active" ? null : actor,
    disable_reason: status === "active" ? null : "Mise à jour depuis Selen Studio",
    updated_by: actor,
  }).eq("id", membershipId).eq("organisation_id", organisationId);
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}?tab=users`);
}

async function updateMembershipAccess(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const membershipId = String(formData.get("membership_id") ?? "");
  const roles = formData.getAll("roles").map(String);
  const blocks = formData.getAll("permission_blocks").map(String);
  if (!organisationId || !membershipId || roles.length === 0) throw new Error("Au moins un rôle est requis.");
  await assertOrganisationScope(auth.email, organisationId);
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const { error } = await admin.rpc("daily_studio_set_membership_access", {
    p_organisation_id: organisationId,
    p_membership_id: membershipId,
    p_roles: roles,
    p_permission_blocks: blocks,
    p_actor_user_id: actor,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}?tab=users`);
}

async function reviewTrainer(formData: FormData) {
  "use server";
  const auth = await requireSupportAdmin();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const trainerProfileId = String(formData.get("trainer_profile_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!organisationId || !trainerProfileId || !["validated", "rejected"].includes(decision)) throw new Error("Décision formateur invalide.");
  await assertOrganisationScope(auth.email, organisationId);
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const patch = decision === "validated"
    ? { status: "validated", selen_validated_at: new Date().toISOString(), selen_validated_by: actor }
    : { status: "rejected", selen_validated_at: null, selen_validated_by: null };
  const { error } = await admin.from("daily_trainer_profiles").update(patch).eq("id", trainerProfileId).eq("organisation_id", organisationId);
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}?tab=trainers`);
  revalidatePath("/agent/daily/organisations");
}

const editableOrganisationFields = [
  "name", "legal_name", "legal_form", "siret", "vat_number", "administrative_email",
  "administrative_phone", "administrative_address", "contact_name",
  "legal_representative_name", "legal_representative_email", "nda_number",
  "nda_status", "nda_declared_at", "qualiopi_status", "qualiopi_valid_from", "qualiopi_valid_until",
] as const;

async function updateOrganisationInformation(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "").trim();
  await assertOrganisationScope(auth.email, organisationId);
  const patch = Object.fromEntries(editableOrganisationFields.map((key) => {
    const value = String(formData.get(key) ?? "").trim();
    return [key, value || null];
  }));
  if (patch.siret && !/^\d{14}$/.test(String(patch.siret))) throw new Error("Le SIRET doit contenir 14 chiffres.");
  for (const key of ["administrative_email", "legal_representative_email"] as const) {
    if (patch[key] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(patch[key]))) throw new Error("Adresse email invalide.");
  }
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const [{ data: adminActor }, { data: operatorActor }] = await Promise.all([
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("agent_profiles").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  const auditActor = adminActor?.role === "admin"
    ? { type: "selen_admin", role: adminActor.role }
    : operatorActor?.role
      ? { type: "selen_operator", role: operatorActor.role }
      : null;
  if (!actor || !auditActor) throw new Error("Profil agent actif requis pour historiser la modification.");
  const { data: before, error: beforeError } = await admin.from("organisations").select(editableOrganisationFields.join(",")).eq("id", organisationId).maybeSingle();
  if (beforeError || !before) throw new Error(beforeError?.message || "Organisme introuvable.");
  const { data: after, error: updateError } = await admin.from("organisations").update(patch).eq("id", organisationId).select(editableOrganisationFields.join(",")).single();
  if (updateError) throw new Error(updateError.message);
  const { error: auditError } = await admin.from("daily_audit_logs").insert({
    organisation_id: organisationId,
    actor_user_id: actor,
    actor_type: auditActor.type,
    actor_role: auditActor.role,
    object_type: "organisation",
    object_id: organisationId,
    action: "organisation_information_updated",
    before_data: before,
    after_data: after,
    origin: "Studio",
    reason: "Informations modifiées depuis le dossier organisme Studio",
  });
  if (auditError) throw new Error(auditError.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}?tab=info`);
  revalidatePath("/agent/daily/organisations");
}

function daysUntil(value: string) {
  const d = new Date(`${value}T00:00:00`).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((d - today.getTime()) / 86_400_000);
}
function certificationLabel(mode: string, validUntil: string | null) {
  if (mode === "lifetime") return "À vie";
  if (mode === "unknown") return "Validité inconnue";
  if (!validUntil) return "Date à renseigner";
  const days = daysUntil(validUntil);
  if (days < 0) return `Expirée depuis ${Math.abs(days)} j`;
  if (days === 0) return "Expire aujourd’hui";
  return `Expire dans ${days} j`;
}
function certVariant(mode: string, validUntil: string | null) {
  if (mode !== "limited" || !validUntil) return "neutral" as const;
  const days = daysUntil(validUntil);
  if (days < 0) return "danger" as const;
  if (days <= 30) return "warn" as const;
  if (days <= 90) return "info" as const;
  return "success" as const;
}

function candidatureStatus(decisionStatus: string | null, status: string | null) {
  if (decisionStatus === "accepted") return { label: "Accepté", variant: "success" as const };
  if (decisionStatus === "refused") return { label: "Refusé", variant: "danger" as const };
  if (decisionStatus === "ready_for_of") return { label: "Décision OF attendue", variant: "info" as const };
  if (decisionStatus === "pending") return { label: status === "attached" ? "Dossier reçu · analyse à faire" : "Analyse à faire", variant: "warn" as const };
  return { label: status || decisionStatus || "État inconnu", variant: "neutral" as const };
}

export default async function DailyOrganisationPage({ params, searchParams }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;
  const { id } = await params;
  if (!await isDailyOrganisationInAgentScope(auth.email, id)) {
    return <main style={s.page}><p style={s.error}>Organisme hors de ton périmètre Daily.</p></main>;
  }
  const resolvedSearchParams = await searchParams;
  const tab = safeTab(resolvedSearchParams.tab);
  const admin = createSupabaseAdminClient();
  const scopedDailyTasksPromise = getDailyAgentTasks({ id: null, role: "admin" }, { organisationId: id });

  const [organisationRes, assignmentRes, agentsRes, adminAccessRes, membershipsRes, rolesRes, blocksRes, invitationsRes, trainersRes, certificationsRes, historyRes, sessionsRes, formationsStatsRes, communicationsRes, documentsRes, learnersRes, enrolmentsRes, profileRequestsRes] = await Promise.all([
    admin.from("organisations").select("*").eq("id", id).maybeSingle(),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id,agent_profiles(id,email,first_name,last_name,role)").eq("organisation_id", id).maybeSingle(),
    admin.from("agent_profiles").select("id,email,first_name,last_name,role").eq("is_active", true).in("role", ["agent", "admin"]).order("first_name"),
    admin.from("selen_admin_users").select("role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("organisation_memberships").select("*").eq("organisation_id", id).order("created_at"),
    admin.from("organisation_membership_roles").select("membership_id,role"),
    admin.from("organisation_membership_permission_blocks").select("membership_id,permission_block,enabled,revoked_at"),
    admin.from("daily_organisation_invitations").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_trainer_profiles").select("*").eq("organisation_id", id).order("display_name"),
    admin.from("daily_trainer_certifications").select("*").order("valid_until", { ascending: true, nullsFirst: false }),
    readAllRows(() => admin.from("daily_audit_logs").select("id,actor_type,actor_role,object_type,action,occurred_at,reason").eq("organisation_id", id).order("occurred_at", { ascending: false })),
    readAllRows(() => admin.from("daily_sessions").select("id,internal_reference,start_date,end_date,status,daily_formations(title)").eq("organisation_id", id).neq("status", "archived").order("start_date", { ascending: false })),
    admin.from("daily_formations").select("id,title,status").eq("organisation_id", id).neq("status", "archived"),
    readAllRows(() => admin.from("daily_communications").select("id,communication_type,recipient_email,recipient_name,subject,status,sent_at,delivered_at,failed_at,failure_reason,created_at,metadata").eq("organisation_id", id).order("created_at", { ascending: false })),
    readAllRows(() => admin.from("daily_documents").select("id,document_type,logical_name,version,status,is_current,created_at,updated_at,published_at,signed_at").eq("organisation_id", id).order("created_at", { ascending: false })),
    readAllRows(() => admin.from("daily_learners").select("id,first_name,last_name,email,created_at").eq("organisation_id", id).order("last_name")),
    readAllRows(() => admin.from("daily_session_enrolments").select("id,learner_id,session_id,status,created_at,updated_at").eq("organisation_id", id).order("created_at", { ascending: false })),
    readAllRows(() => admin.from("daily_organisation_profile_change_requests").select("id,request_type,status,requested_at,reviewed_at,review_message").eq("organisation_id", id).order("requested_at", { ascending: false })),
  ]);

  if (organisationRes.error || !organisationRes.data) return <main style={s.page}><p style={s.error}>Organisme introuvable.</p></main>;
  const loadingError = [assignmentRes, agentsRes, adminAccessRes, membershipsRes, rolesRes, blocksRes, invitationsRes, trainersRes, certificationsRes, historyRes, sessionsRes, formationsStatsRes, communicationsRes, documentsRes, learnersRes, enrolmentsRes, profileRequestsRes]
    .map((result) => result.error)
    .find(Boolean);
  if (loadingError) return <main style={s.page}><p style={s.error}>Chargement du dossier impossible : {loadingError.message}</p></main>;
  const formationIds = (formationsStatsRes.data ?? []).map((formation) => formation.id);
  const candidaturesRes = formationIds.length
    ? await readAllRows(() => admin.from("daily_formation_registration_requests")
      .select("id,formation_id,attached_session_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,status,decision_status,submitted_at,signature_signed_at,agent_analysis_completed_at")
      .in("formation_id", formationIds)
      .order("submitted_at", { ascending: false }))
    : { data: [], error: null };
  if (candidaturesRes.error) return <main style={s.page}><p style={s.error}>Chargement des dossiers d’inscription impossible : {candidaturesRes.error.message}</p></main>;
  const organisation = organisationRes.data;
  let scopedDailyTasks;
  try {
    scopedDailyTasks = await scopedDailyTasksPromise;
  } catch (error) {
    return <main style={s.page}><p style={s.error}>Chargement des tâches impossible : {error instanceof Error ? error.message : "pilotage Daily indisponible"}</p></main>;
  }
  const memberships = membershipsRes.data ?? [];
  const roles = rolesRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const invitations = invitationsRes.data ?? [];
  const trainers = trainersRes.data ?? [];
  const trainerIds = new Set(trainers.map((trainer) => trainer.id));
  const certifications = (certificationsRes.data ?? []).filter((certification) => trainerIds.has(certification.trainer_profile_id));
  const activeTrainerIds = new Set(trainers.filter((trainer) => trainer.active).map((trainer) => trainer.id));
  const expiring = certifications.filter((certification) => activeTrainerIds.has(certification.trainer_profile_id) && certification.validity_mode === "limited" && certification.valid_until && daysUntil(certification.valid_until) <= 90);
  const programStats = dailyOrganisationProgramStats(formationsStatsRes.data ?? []);
  const formationById = new Map((formationsStatsRes.data ?? []).map((formation) => [formation.id, formation]));
  const candidatures = candidaturesRes.data ?? [];
  const activeCandidatures = candidatures.filter((candidature) => ["pending", "ready_for_of"].includes(String(candidature.decision_status)));
  const assignment = assignmentRes.data as { agent_profile_id?: string; agent_profiles?: { first_name?: string | null; last_name?: string | null; email?: string } | null } | null;
  const assignedAgent = assignment?.agent_profiles;
  const isAdmin = adminAccessRes.data?.role === "admin" || (agentsRes.data ?? []).some((agent) => agent.email === auth.email && agent.role === "admin");
  // Profiles are keyed by user, not organisation. Scope them through memberships first.
  const memberUserIds = [...new Set(memberships.map((membership) => membership.user_id).filter(Boolean))];
  const memberProfilesRes = memberUserIds.length
    ? await admin.from("selen_client_profiles").select("user_id,email,full_name").in("user_id", memberUserIds)
    : { data: [], error: null };
  if (memberProfilesRes.error) {
    return <main style={s.page}><p style={s.error}>Chargement des utilisateurs impossible : {memberProfilesRes.error.message}</p></main>;
  }
  const profileByUser = new Map((memberProfilesRes.data ?? []).map((profile) => [profile.user_id, profile]));
  const sessions = sessionsRes.data ?? [];
  const sessionIds = sessions.map((session) => session.id);
  const [portalAccessRes, conventionSignaturesRes, sessionDossiersRes] = await Promise.all([
    sessionIds.length
      ? readAllRows(() => admin
        .from("daily_portal_access_tokens")
        .select("id,session_id,portal_type,entity_key,entity_name,entity_email,status,expires_at,viewed_at,created_at,updated_at,metadata")
        .in("session_id", sessionIds)
        .in("portal_type", ["learner", "trainer"])
        .not("status", "in", "(revoked,expired)")
        .order("created_at", { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? readAllRows(() => admin.from("daily_convention_signatures").select("id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,created_at,last_error").in("session_id", sessionIds).order("created_at", { ascending: false }))
      : Promise.resolve({ data: [], error: null }),
    sessionIds.length
      ? readAllRows(() => admin.from("daily_session_dossiers").select("session_id,status,completed_at").in("session_id", sessionIds))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (portalAccessRes.error || conventionSignaturesRes.error || sessionDossiersRes.error) {
    return <main style={s.page}><p style={s.error}>Chargement du dossier impossible : {portalAccessRes.error?.message || conventionSignaturesRes.error?.message || sessionDossiersRes.error?.message}</p></main>;
  }
  const activePortalAccess = (portalAccessRes.data ?? []).filter((access) =>
    !access.expires_at || new Date(access.expires_at).getTime() >= Date.now(),
  );
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const dossierBySessionId = new Map((sessionDossiersRes.data ?? []).map((dossier) => [dossier.session_id, dossier]));
  const today = new Date().toISOString().slice(0, 10);
  const openSessions = sessions.filter((session) => !["completed", "archived"].includes(String(dossierBySessionId.get(session.id)?.status)));
  const plannedSessions = openSessions.filter((session) => !session.start_date || session.start_date > today);
  const currentSessions = openSessions.filter((session) => session.start_date && session.start_date <= today && (!session.end_date || session.end_date >= today));
  const sessionsToClose = openSessions.filter((session) => session.end_date && session.end_date < today);
  const enrolments = enrolmentsRes.data ?? [];
  const learners = learnersRes.data ?? [];
  const portalAccessForEnrolment = (enrolment: (typeof enrolments)[number]) => { const learner = learners.find((row) => row.id === enrolment.learner_id); const email = String(learner?.email ?? "").trim().toLowerCase(); return activePortalAccess.find((access) => access.session_id === enrolment.session_id && access.portal_type === "learner" && access.entity_key === `learner:${enrolment.learner_id}`) ?? activePortalAccess.find((access) => access.session_id === enrolment.session_id && access.portal_type === "learner" && email && String(access.entity_email ?? "").trim().toLowerCase() === email); };
  const trainerPortalAccess = activePortalAccess.filter((access) => access.portal_type === "trainer");
  const trainerPortalPeople = [...trainerPortalAccess.reduce((people, access) => { const key = access.entity_key || String(access.entity_email ?? "").trim().toLowerCase() || access.id; const current = people.get(key) ?? { key, name: access.entity_name, email: access.entity_email, accesses: [] as typeof trainerPortalAccess }; current.accesses.push(access); people.set(key, current); return people; }, new Map<string, { key: string; name: string | null; email: string | null; accesses: typeof trainerPortalAccess }>()).values()];
  const latestAccessCommunication = (accessId: string) => (communicationsRes.data ?? []).find((communication) => { const metadata = communication.metadata as Record<string, unknown> | null | undefined; return metadata?.portal_access_id === accessId; });
  const timeline = [
    ...(historyRes.data ?? []).map((event) => ({ id: `audit:${event.id}`, at: event.occurred_at, kind: "Action", title: event.action, detail: [event.object_type, event.actor_role || event.actor_type, event.reason].filter(Boolean).join(" · ") })),
    ...(communicationsRes.data ?? []).map((event) => ({ id: `communication:${event.id}`, at: event.sent_at || event.created_at, kind: "Email", title: event.subject || event.communication_type, detail: [event.recipient_name || event.recipient_email, event.status, event.failure_reason].filter(Boolean).join(" · ") })),
    ...(documentsRes.data ?? []).map((event) => ({ id: `document:${event.id}`, at: event.updated_at || event.created_at, kind: "Document", title: event.logical_name || event.document_type, detail: [`version ${event.version}`, event.status, event.is_current ? "version courante" : "historique"].join(" · ") })),
    ...(conventionSignaturesRes.data ?? []).map((event) => ({ id: `signature:${event.id}`, at: event.signed_at || event.viewed_at || event.created_at, kind: "Signature", title: event.signatory_name || event.signatory_email || event.signatory_type, detail: [event.status, event.last_error].filter(Boolean).join(" · ") })),
    ...(profileRequestsRes.data ?? []).map((event) => ({ id: `profile:${event.id}`, at: event.reviewed_at || event.requested_at, kind: "Retour OF", title: event.request_type, detail: [event.status, event.review_message].filter(Boolean).join(" · ") })),
  ].filter((event) => event.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <Link href="/agent/daily/organisations" style={s.back}>← Organismes Daily</Link>
          <p style={s.eyebrow}>Dossier organisme</p>
          <h1 style={s.title}>{organisation.legal_name || organisation.name}</h1>
          <p style={s.subtitle}>{organisation.siret || "SIRET à renseigner"} · NDA {organisation.nda_number || "à vérifier"}</p>
        </div>
        <div style={s.headerActions}>
          <form action={openAssistanceMode}>
            <input type="hidden" name="organisation_id" value={id} />
            <SelenButton type="submit" variant="primary">Agir pour cet OF</SelenButton>
          </form>
          {isAdmin ? (
          <form action={assignAgent} style={s.assignmentForm}>
            <input type="hidden" name="organisation_id" value={id} />
            <label style={s.smallLabel}>Agent assigné</label>
            <select name="agent_profile_id" defaultValue={assignment?.agent_profile_id || ""} style={s.select} required>
              <option value="" disabled>Choisir un agent</option>
              {(agentsRes.data ?? []).map((agent) => <option value={agent.id} key={agent.id}>{[agent.first_name, agent.last_name].filter(Boolean).join(" ") || agent.email}</option>)}
            </select>
            <SelenButton type="submit" size="sm">Attribuer</SelenButton>
          </form>
          ) : null}
        </div>
      </header>

      <section style={s.stats}>
        <MiniStat label="Programmes validés" value={`${programStats.validated}/${programStats.total}`} detail={programStats.total === 0 ? "Aucun programme" : `${programStats.toFinalize} à finaliser · ${programStats.progress}% validés`} />
        <MiniStat label="Dossiers reçus" value={String(candidatures.length)} detail={`${activeCandidatures.length} à traiter · historique conservé`} tone={activeCandidatures.length ? "warn" : "neutral"} />
        <MiniStat label="Tâches actives" value={String(scopedDailyTasks.length)} detail="Source Pilotage Daily" tone="warn" />
        <MiniStat label="Sessions à clôturer" value={String(sessionsToClose.length)} detail={`${currentSessions.length} en cours · ${plannedSessions.length} à venir`} tone="info" />
        <MiniStat label="Certifications à surveiller" value={String(expiring.length)} detail="Expirées ou à ≤ 90 j" tone="danger" />
        <MiniStat label="Agent" value={assignedAgent ? ([assignedAgent.first_name, assignedAgent.last_name].filter(Boolean).join(" ") || assignedAgent.email || "Assigné") : "Non assigné"} />
      </section>

      <nav style={s.tabs} aria-label="Rubriques du dossier Daily">{tabs.map((item) => <Link key={item.key} href={`/agent/daily/organisations/${id}?tab=${item.key}`} aria-current={tab === item.key ? "page" : undefined} style={{ ...s.tab, ...(tab === item.key ? s.activeTab : {}) }}>{item.label}</Link>)}</nav>

      {tab === "programs" || tab === "documents" ? <DailyOrganisationWorkspace organisationId={id} email={auth.email} kind={tab} /> : null}

      {tab === "overview" ? (
        <div style={s.twoCols}>
          <SelenCard><SelenCardTitle>Programmes de formation</SelenCardTitle><p style={s.muted}>Modifie et valide les programmes, puis consulte leurs questionnaires.</p><Link href={`/agent/daily/organisations/${id}?tab=programs`} style={{ color: "var(--selen-gold)", fontWeight: 700 }}>Voir les programmes →</Link></SelenCard>
          <SelenCard><SelenCardTitle>Dossiers d’inscription</SelenCardTitle><p style={s.muted}>{candidatures.length} dossier(s) rempli(s), dont {activeCandidatures.length} à traiter. Les dossiers décidés restent consultables dans l’historique.</p><Link href={`/agent/daily/organisations/${id}?tab=applications`} style={{ color: "var(--selen-gold)", fontWeight: 700 }}>Voir les dossiers et réponses →</Link></SelenCard>
          <SelenCard><SelenCardTitle>Documents client</SelenCardTitle><p style={s.muted}>Ouvre les fichiers et justificatifs déposés dans l’espace Daily de cet organisme.</p><Link href={`/agent/daily/organisations/${id}?tab=documents`} style={{ color: "var(--selen-gold)", fontWeight: 700 }}>Consulter les documents →</Link></SelenCard>
          <SelenCard><SelenCardTitle>Tâches de cet OF</SelenCardTitle>{scopedDailyTasks.length === 0 ? <p style={s.muted}>Aucune tâche active pour cet organisme.</p> : scopedDailyTasks.map((item) => <div key={item.id} style={s.attentionRow}><div><strong>{item.title}</strong><p style={s.mutedInline}>{item.reason} · {item.detail}</p></div><Link href={item.href} style={s.back}>Traiter →</Link></div>)}</SelenCard>
          <SelenCard><SelenCardTitle>Signaux dossier</SelenCardTitle><Signal label="NDA" value={organisation.nda_status || "unknown"} /><Signal label="Qualiopi" value={organisation.qualiopi_status || "unknown"} /><Signal label="Utilisateurs actifs" value={String(memberships.filter((m) => m.status === "active").length)} /><Signal label="Formateurs actifs" value={String(trainers.filter((t) => t.active).length)} /><Signal label="Invitations en attente" value={String(invitations.filter((i) => i.status === "pending").length)} /></SelenCard>
          <SelenCard style={{ gridColumn: "1 / -1" }}><SelenCardTitle>Sessions de cet organisme</SelenCardTitle><div style={s.sessionGroups}><SessionGroup title="À venir" sessions={plannedSessions} /><SessionGroup title="En cours" sessions={currentSessions} /><SessionGroup title="À clôturer" sessions={sessionsToClose} /></div></SelenCard>
          <SelenCard style={{ gridColumn: "1 / -1" }}><SelenCardTitle>Échéances formateurs</SelenCardTitle>{expiring.length === 0 ? <p style={s.muted}>Aucune certification à durée limitée n’arrive à échéance dans les 90 jours.</p> : expiring.map((cert) => { const trainer = trainers.find((t) => t.id === cert.trainer_profile_id); return <div key={cert.id} style={s.attentionRow}><span>{trainer?.display_name || "Formateur"} · {cert.title}</span><SelenBadge variant={certVariant(cert.validity_mode, cert.valid_until)}>{certificationLabel(cert.validity_mode, cert.valid_until)}</SelenBadge></div>; })}</SelenCard>
        </div>
      ) : null}

      {tab === "applications" ? <SelenCard><SelenCardTitle>Dossiers d’inscription</SelenCardTitle><p style={s.muted}>Liste complète et historisée des dossiers signés depuis Daily. Chaque ligne reste rattachée à son programme et, lorsqu’elle est choisie, à sa session.</p>{candidatures.length === 0 ? <p style={s.muted}>Aucun dossier rempli pour cet organisme.</p> : candidatures.map((candidature) => { const formation = formationById.get(candidature.formation_id); const session = candidature.attached_session_id ? sessionById.get(candidature.attached_session_id) : null; const identity = candidature.company_name || [candidature.respondent_first_name, candidature.respondent_last_name].filter(Boolean).join(" ") || candidature.respondent_email || "Candidat"; const state = candidatureStatus(candidature.decision_status, candidature.status); return <article key={candidature.id} style={s.memberCard}><div style={s.userRow}><div style={{ flex: 1, minWidth: 220 }}><strong>{identity}</strong><p style={s.mutedInline}>{formation?.title || "Formation"} · {session ? [session.start_date, session.end_date].filter(Boolean).join(" → ") || session.internal_reference || "Session rattachée" : "Session à planifier"} · {candidature.signature_signed_at ? "dossier signé" : "signature absente"}</p><p style={s.tiny}>{candidature.submitted_at ? `Reçu le ${new Date(candidature.submitted_at).toLocaleString("fr-FR")}` : "Date de réception inconnue"}{candidature.agent_analysis_completed_at ? " · analyse Selen enregistrée" : ""}</p></div><SelenBadge variant={state.variant}>{state.label}</SelenBadge></div><div style={{ ...s.badgeLine, marginTop: 10 }}><Link href={`/agent/daily/candidatures/${candidature.id}`} style={s.back}>Ouvrir les réponses et justificatifs →</Link>{session ? <Link href={`/agent/daily/session-dossiers/${session.id}/full`} style={s.back}>Ouvrir la session →</Link> : null}</div></article>; })}</SelenCard> : null}

      {tab === "info" ? <SelenCard><SelenCardTitle>Informations de l’organisme</SelenCardTitle><p style={s.muted}>Les modifications sont historisées. Elles ne changent ni les accès, ni les sessions, ni les inscriptions.</p><form action={updateOrganisationInformation} style={s.editForm}><input type="hidden" name="organisation_id" value={id} /><div style={s.editGrid}>{[
        ["name", "Nom affiché", organisation.name, "text"], ["legal_name", "Raison sociale", organisation.legal_name, "text"], ["legal_form", "Forme juridique", organisation.legal_form, "text"], ["siret", "SIRET", organisation.siret, "text"], ["vat_number", "N° TVA", organisation.vat_number, "text"],
        ["administrative_email", "Email administratif", organisation.administrative_email || organisation.email, "email"], ["administrative_phone", "Téléphone administratif", organisation.administrative_phone || organisation.phone, "tel"], ["administrative_address", "Adresse administrative", organisation.administrative_address || organisation.address, "text"], ["contact_name", "Contact principal", organisation.contact_name, "text"],
        ["legal_representative_name", "Représentant légal", organisation.legal_representative_name, "text"], ["legal_representative_email", "Email du représentant", organisation.legal_representative_email, "email"], ["nda_number", "Numéro NDA", organisation.nda_number, "text"], ["nda_status", "Statut NDA", organisation.nda_status, "text"], ["nda_declared_at", "NDA déclaré le", organisation.nda_declared_at, "date"],
        ["qualiopi_status", "Statut Qualiopi", organisation.qualiopi_status, "text"], ["qualiopi_valid_from", "Qualiopi valide du", organisation.qualiopi_valid_from, "date"], ["qualiopi_valid_until", "Qualiopi valide jusqu’au", organisation.qualiopi_valid_until, "date"],
      ].map(([name, label, value, type]) => <label key={String(name)} style={s.field}><span style={s.smallLabel}>{String(label)}</span><input name={String(name)} type={String(type)} defaultValue={value == null ? "" : String(value)} style={s.inputWide} /></label>)}</div><div style={s.formFooter}><SelenButton type="submit">Enregistrer les informations</SelenButton></div></form></SelenCard> : null}

      {tab === "users" ? (
        <div style={s.stack}>
          <SelenCard><SelenCardTitle>Utilisateurs de l’organisme</SelenCardTitle>{memberships.length === 0 ? <p style={s.muted}>Aucun utilisateur rattaché.</p> : memberships.map((membership) => {
            const memberRoles = roles.filter((row) => row.membership_id === membership.id).map((row) => row.role);
            const memberBlocks = blocks.filter((row) => row.membership_id === membership.id && row.enabled && !row.revoked_at).map((row) => row.permission_block);
            const profile = profileByUser.get(membership.user_id);
            return <article key={membership.id} style={s.memberCard}>
              <div style={s.userRow}><div style={{ flex: 1 }}><strong>{profile?.full_name || profile?.email || "Utilisateur"}</strong><p style={s.mutedInline}>{profile?.email || membership.user_id}</p></div><SelenBadge variant={membership.status === "active" ? "success" : "neutral"}>{membership.status}</SelenBadge><form action={updateMembershipStatus} style={s.inlineForm}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="membership_id" value={membership.id} /><select name="status" defaultValue={membership.status} style={s.select}><option value="active">Actif</option><option value="disabled">Désactivé</option><option value="revoked">Révoqué</option></select><SelenButton type="submit" size="sm">Statut</SelenButton></form></div>
              <form action={updateMembershipAccess} style={s.accessForm}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="membership_id" value={membership.id} /><fieldset style={s.fieldset}><legend style={s.legend}>Rôles cumulables</legend>{membershipRoles.map(([value, label]) => <label key={value} style={s.checkboxLabel}><input type="checkbox" name="roles" value={value} defaultChecked={memberRoles.includes(value) || (!memberRoles.length && membership.primary_role === value)} /> {label}</label>)}</fieldset><fieldset style={s.fieldset}><legend style={s.legend}>Blocs de permissions</legend>{permissionBlocks.map(([value, label]) => <label key={value} style={s.checkboxLabel}><input type="checkbox" name="permission_blocks" value={value} defaultChecked={memberBlocks.includes(value)} /> {label}</label>)}</fieldset><SelenButton type="submit" size="sm">Enregistrer les accès</SelenButton></form>
            </article>;
          })}</SelenCard>
          <SelenCard><SelenCardTitle>Invitations</SelenCardTitle>{invitations.length === 0 ? <p style={s.muted}>Aucune invitation enregistrée.</p> : invitations.map((invite) => <div key={invite.id} style={s.attentionRow}><div><strong>{invite.invited_email}</strong><p style={s.mutedInline}>{(invite.intended_roles || []).join(", ")} · {(invite.intended_permission_blocks || []).join(", ") || "sans bloc"}</p></div><SelenBadge variant={invite.status === "pending" ? "warn" : invite.status === "accepted" ? "success" : "neutral"}>{invite.status}</SelenBadge></div>)}<p style={s.tiny}>Le Studio suit ici les invitations sécurisées. L’envoi du lien et le parcours d’acceptation seront raccordés au côté client Daily.</p></SelenCard>
        </div>
      ) : null}

      {tab === "learners" ? <SelenCard><SelenCardTitle>Espaces apprenants</SelenCardTitle><p style={s.muted}>Répertoire canonique des personnes et de leurs accès. Les apprenants restent dédupliqués par identité stable même sur plusieurs sessions ; les accès formateur sont distingués sans créer une seconde liste.</p>{resolvedSearchParams.access_status ? <p style={s.success}>{resolvedSearchParams.access_status}</p> : null}{resolvedSearchParams.access_error ? <p style={s.error}>{resolvedSearchParams.access_error}</p> : null}{learners.length === 0 && trainerPortalPeople.length === 0 ? <p style={s.muted}>Aucun espace rattaché.</p> : <>{learners.map((learner) => { const learnerEnrolments = enrolments.filter((enrolment) => enrolment.learner_id === learner.id); return <article key={learner.id} style={s.memberCard}><div style={s.userRow}><div style={{ flex: 1 }}><strong>{[learner.first_name, learner.last_name].filter(Boolean).join(" ") || learner.email || "Apprenant"}</strong><p style={s.mutedInline}>{learner.email || "Email non renseigné"} · {learnerEnrolments.length} inscription(s)</p></div><SelenBadge variant="neutral">Apprenant</SelenBadge></div>{learnerEnrolments.map((enrolment) => { const session = sessionById.get(enrolment.session_id); const formation = Array.isArray(session?.daily_formations) ? session?.daily_formations[0] : session?.daily_formations; const access = portalAccessForEnrolment(enrolment); const invitation = access ? latestAccessCommunication(access.id) : null; const closed = ["declined","cancelled","abandoned"].includes(String(enrolment.status)); return <div key={enrolment.id} style={s.attentionRow}><div><strong>{formation?.title || session?.internal_reference || "Session"}</strong><p style={s.mutedInline}>{session?.start_date || "Date à préciser"} · statut {enrolment.status} · accès {closed ? "clos" : access?.viewed_at ? "consulté" : access ? "invité" : "non créé"}{invitation ? ` · dernier envoi ${new Date(invitation.delivered_at || invitation.sent_at || invitation.created_at).toLocaleString("fr-FR")} (${invitation.status})` : ""}</p></div><div style={s.badgeLine}><Link href={`/agent/daily/session-dossiers/${enrolment.session_id}/full`} style={s.back}>Ouvrir le dossier →</Link>{access ? <form action={openPortalAssistanceMode}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="portal_access_id" value={access.id} /><SelenButton type="submit" size="sm" variant="ghost">Consulter en délégation</SelenButton></form> : null}{access && !closed && learner.email ? <form action={resendPortalAccess}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="portal_access_id" value={access.id} /><SelenButton type="submit" size="sm" variant="ghost">Renvoyer l’accès</SelenButton></form> : null}</div></div>; })}</article>; })}{trainerPortalPeople.map((person) => <article key={`trainer:${person.key}`} style={s.memberCard}><div style={s.userRow}><div style={{ flex: 1 }}><strong>{person.name || person.email || "Formateur"}</strong><p style={s.mutedInline}>{person.email || "Email non renseigné"} · {person.accesses.length} session(s)</p></div><SelenBadge variant="info">Formateur</SelenBadge></div>{person.accesses.map((access) => { const session = sessionById.get(access.session_id); const formation = Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations; const invitation = latestAccessCommunication(access.id); return <div key={access.id} style={s.attentionRow}><div><strong>{formation?.title || session?.internal_reference || "Session"}</strong><p style={s.mutedInline}>{access.viewed_at ? "Accès consulté" : "Accès invité"}{invitation ? ` · dernier envoi ${new Date(invitation.delivered_at || invitation.sent_at || invitation.created_at).toLocaleString("fr-FR")} (${invitation.status})` : ""}</p></div><div style={s.badgeLine}><form action={openPortalAssistanceMode}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="portal_access_id" value={access.id} /><SelenButton type="submit" size="sm" variant="ghost">Consulter en délégation</SelenButton></form>{person.email ? <form action={resendPortalAccess}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="portal_access_id" value={access.id} /><SelenButton type="submit" size="sm" variant="ghost">Renvoyer l’accès</SelenButton></form> : null}</div></div>; })}</article>)}</>}</SelenCard> : null}

      {tab === "trainers" ? <div style={s.stack}>{trainers.length === 0 ? <SelenCard><p style={s.muted}>Aucun formateur enregistré.</p></SelenCard> : trainers.map((trainer) => {
        const trainerCerts = certifications.filter((cert) => cert.trainer_profile_id === trainer.id);
        return <SelenCard key={trainer.id}><div style={s.trainerHead}><div><SelenCardTitle>{trainer.display_name || trainer.professional_email || "Formateur"}</SelenCardTitle><p style={s.mutedInline}>{trainer.engagement_type} · {trainer.professional_email || "email non renseigné"}</p></div><div style={s.badgeLine}><SelenBadge variant={trainer.status === "validated" ? "success" : trainer.status === "pending_selen_review" ? "warn" : trainer.status === "rejected" ? "danger" : "neutral"}>{trainer.status}</SelenBadge>{isAdmin && trainer.status !== "validated" ? <form action={reviewTrainer} style={s.inlineForm}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="trainer_profile_id" value={trainer.id} /><SelenButton type="submit" name="decision" value="validated" size="sm">Valider Selen</SelenButton><SelenButton type="submit" name="decision" value="rejected" size="sm" variant="danger">Refuser</SelenButton></form> : null}</div></div><div style={s.certList}>{trainerCerts.length === 0 ? <p style={s.mutedInline}>Aucune certification renseignée par le formateur.</p> : trainerCerts.map((cert) => <div key={cert.id} style={s.certRow}><div><strong>{cert.title}</strong><p style={s.mutedInline}>{[cert.issuer, cert.reference, cert.obtained_on ? `obtenue le ${cert.obtained_on}` : null].filter(Boolean).join(" · ")}</p></div><SelenBadge variant={certVariant(cert.validity_mode, cert.valid_until)}>{certificationLabel(cert.validity_mode, cert.valid_until)}</SelenBadge></div>)}</div><p style={s.readOnlyNotice}>Certifications en consultation uniquement dans Studio. Le formateur les ajoute, les met à jour et dépose ses justificatifs depuis son espace Daily.</p></SelenCard>;
      })}</div> : null}

      {tab === "history" ? <SelenCard><SelenCardTitle>Historique unifié</SelenCardTitle><p style={s.muted}>Actions, emails automatiques ou manuels, retours OF, documents et signatures, sans mélange avec un autre organisme.</p>{timeline.length === 0 ? <p style={s.muted}>Aucun événement enregistré.</p> : timeline.map((event) => <div key={event.id} style={s.historyRow}><div><div style={s.badgeLine}><SelenBadge variant={event.kind === "Email" ? "info" : event.kind === "Signature" ? "success" : "neutral"}>{event.kind}</SelenBadge><strong>{event.title}</strong></div>{event.detail ? <p style={s.mutedInline}>{event.detail}</p> : null}</div><span style={s.tiny}>{new Date(event.at).toLocaleString("fr-FR")}</span></div>)}</SelenCard> : null}
    </main>
  );
}

function MiniStat({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail?: string; tone?: "neutral" | "warn" | "info" | "danger" }) {
  const color = tone === "danger" ? "#f48b8b" : tone === "warn" ? "var(--selen-gold)" : tone === "info" ? "var(--selen-info)" : "var(--selen-text)";
  return <SelenCard style={s.statCard}><span style={s.tiny}>{label}</span><strong style={{ color, fontSize: value.length > 16 ? 14 : 24 }}>{value}</strong>{detail ? <span style={s.statDetail}>{detail}</span> : null}</SelenCard>;
}
function Signal({ label, value }: { label: string; value: string }) { return <div style={s.signal}><span style={s.mutedInline}>{label}</span><strong>{value}</strong></div>; }
type SessionSummary = { id: string; internal_reference?: string | null; start_date?: string | null; end_date?: string | null; daily_formations?: { title?: string | null } | Array<{ title?: string | null }> | null };
function SessionGroup({ title, sessions }: { title: string; sessions: SessionSummary[] }) { return <section style={s.sessionGroup}><strong>{title} · {sessions.length}</strong>{sessions.length === 0 ? <p style={s.mutedInline}>Aucune session.</p> : sessions.map((session) => { const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations; return <Link key={session.id} href={`/agent/daily/session-dossiers/${session.id}/full`} style={s.sessionLink}>{formation?.title || session.internal_reference || "Session"}<span style={s.tiny}>{[session.start_date, session.end_date].filter(Boolean).join(" → ") || "Dates à préciser"}</span></Link>; })}</section>; }

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 28px 50px", maxWidth: 1180, margin: "0 auto", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" },
  back: { color: "var(--selen-text3)", fontSize: 12, textDecoration: "none" },
  success: { color: "#86b96b", border: "1px solid #4d6b3e", borderRadius: 10, padding: "10px 12px" },
  eyebrow: { marginTop: 10, fontSize: 9, letterSpacing: ".28em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 30, margin: "5px 0" }, subtitle: { fontSize: 13, color: "var(--selen-text2)" },
  headerActions: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "flex-end" },
  assignmentForm: { display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }, smallLabel: { fontSize: 10, color: "var(--selen-text3)" },
  select: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: "9px 10px", minHeight: 38 },
  input: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: "9px 10px", minWidth: 150 }, inputWide: { width: "100%", boxSizing: "border-box", background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: "10px 11px", minHeight: 40 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, margin: "18px 0" }, statCard: { minHeight: 96, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 5 }, statDetail: { color: "var(--selen-text3)", fontSize: 10, lineHeight: 1.35 },
  tabs: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }, tab: { color: "var(--selen-text2)", textDecoration: "none", fontSize: 12, border: "1px solid var(--selen-border)", borderRadius: 999, padding: "8px 12px" }, activeTab: { color: "var(--selen-ink)", background: "linear-gradient(135deg,var(--selen-gold),var(--selen-copper))", borderColor: "transparent", fontWeight: 700 },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }, stack: { display: "grid", gap: 12 }, list: { display: "grid", gap: 10 }, attentionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--selen-border)", flexWrap: "wrap" }, muted: { color: "var(--selen-text3)", fontSize: 13 }, mutedInline: { margin: "4px 0 0", color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.45 }, tiny: { color: "var(--selen-text3)", fontSize: 10 }, signal: { display: "flex", justifyContent: "space-between", gap: 14, borderBottom: "1px solid var(--selen-border)", padding: "9px 0" },
  sessionGroups: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }, sessionGroup: { display: "grid", alignContent: "start", gap: 8, minWidth: 0, padding: 12, borderRadius: 12, background: "var(--selen-bg3)", border: "1px solid var(--selen-border)" }, sessionLink: { display: "grid", gap: 3, color: "var(--selen-text)", textDecoration: "none", padding: "8px 0", borderTop: "1px solid var(--selen-border)" },
  editForm: { display: "grid", gap: 16, marginTop: 16 }, editGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }, field: { display: "grid", gap: 5, minWidth: 0 }, formFooter: { display: "flex", justifyContent: "flex-end", paddingTop: 4 },
  checkRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", padding: 12, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg3)" },
  memberCard: { borderTop: "1px solid var(--selen-border)", padding: "14px 0" }, userRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }, inlineForm: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, accessForm: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, alignItems: "end", marginTop: 12, padding: 12, borderRadius: 12, background: "var(--selen-bg3)" }, fieldset: { border: "1px solid var(--selen-border)", borderRadius: 10, padding: 10, margin: 0 }, legend: { fontSize: 10, color: "var(--selen-text3)", padding: "0 4px" }, checkboxLabel: { display: "block", fontSize: 11, color: "var(--selen-text2)", margin: "5px 0" },
  trainerHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }, certList: { display: "grid", marginTop: 8 }, certRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--selen-border)", padding: "10px 0" }, readOnlyNotice: { margin: "12px 0 0", paddingTop: 12, borderTop: "1px solid var(--selen-border)", color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.5 },
  validationRow: { display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", borderBottom: "1px solid var(--selen-border)", padding: "13px 0" }, badgeLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, color: "var(--selen-text2)", background: "var(--selen-bg3)", borderRadius: 10, padding: 10 }, reviewForm: { display: "grid", gap: 8, minWidth: 240 }, textarea: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: 10, minHeight: 70 }, approveButton: { background: "#40735c", color: "white", border: 0, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }, rejectButton: { background: "#7d4747", color: "white", border: 0, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }, historyRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--selen-border)" }, error: { color: "#ffb0b0" },
};
