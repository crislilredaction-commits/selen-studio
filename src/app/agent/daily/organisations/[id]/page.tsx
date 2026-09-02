import Link from "next/link";
import { revalidatePath } from "next/cache";
import type { CSSProperties } from "react";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent, requireSupportAdmin } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

type TabKey = "overview" | "checklist" | "info" | "users" | "trainers" | "validations" | "history";
const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Vue d’ensemble" },
  { key: "checklist", label: "Checklist" },
  { key: "info", label: "Informations" },
  { key: "users", label: "Utilisateurs" },
  { key: "trainers", label: "Formateurs" },
  { key: "validations", label: "Validations Selen" },
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

async function assignAgent(formData: FormData) {
  "use server";
  const auth = await requireSupportAdmin();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const agentProfileId = String(formData.get("agent_profile_id") ?? "");
  if (!organisationId || !agentProfileId) throw new Error("Attribution incomplète.");
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

async function updateChecklist(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const allowed = new Set(["todo", "in_progress", "to_review", "validated", "blocked", "not_applicable"]);
  if (!organisationId || !itemId || !allowed.has(status)) throw new Error("Mise à jour checklist invalide.");
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const { error } = await admin.from("daily_organisation_checklist_items").update({
    status,
    note: note || null,
    validated_by: status === "validated" ? actor : null,
  }).eq("id", itemId).eq("organisation_id", organisationId);
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

const legalChangeKeys = new Set([
  "legal_name", "legal_form", "vat_number", "legal_representative_name", "legal_representative_email",
  "nda_status", "nda_declared_at", "nda_number", "qualiopi_status", "qualiopi_valid_from", "qualiopi_valid_until", "qualiopi_categories",
]);

async function reviewValidation(formData: FormData) {
  "use server";
  const auth = await requireSupportAdmin();
  if (!auth.ok) throw new Error(auth.error);
  const organisationId = String(formData.get("organisation_id") ?? "");
  const requestId = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  if (!organisationId || !requestId || !["approved", "rejected"].includes(decision)) throw new Error("Décision invalide.");
  const admin = createSupabaseAdminClient();
  const actor = await currentUserId();
  const { data: request, error: requestError } = await admin.from("daily_organisation_profile_change_requests").select("id,organisation_id,status,proposed_changes").eq("id", requestId).eq("organisation_id", organisationId).eq("status", "pending").maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Demande déjà traitée ou introuvable.");
  if (decision === "approved") {
    const source = (request.proposed_changes ?? {}) as Record<string, unknown>;
    const patch = Object.fromEntries(Object.entries(source).filter(([key]) => legalChangeKeys.has(key)));
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from("organisations").update({ ...patch, selen_validated_at: new Date().toISOString(), selen_validated_by: actor }).eq("id", organisationId);
      if (error) throw new Error(error.message);
    }
  }
  const { error } = await admin.from("daily_organisation_profile_change_requests").update({ status: decision, reviewed_by: actor, reviewed_at: new Date().toISOString(), review_message: message || null }).eq("id", requestId);
  if (error) throw new Error(error.message);
  revalidatePath(`/agent/daily/organisations/${organisationId}`);
  revalidatePath("/agent/daily/organisations");
}

function daysSince(value: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
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

export default async function DailyOrganisationPage({ params, searchParams }: PageProps) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;
  const { id } = await params;
  const tab = safeTab((await searchParams).tab);
  const admin = createSupabaseAdminClient();

  const [organisationRes, assignmentRes, agentsRes, adminAccessRes, checklistRes, membershipsRes, rolesRes, blocksRes, invitationsRes, trainersRes, certificationsRes, validationsRes, historyRes, profilesRes] = await Promise.all([
    admin.from("organisations").select("*").eq("id", id).maybeSingle(),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profile_id,agent_profiles(id,email,first_name,last_name,role)").eq("organisation_id", id).maybeSingle(),
    admin.from("agent_profiles").select("id,email,first_name,last_name,role").eq("is_active", true).in("role", ["agent", "admin"]).order("first_name"),
    admin.from("selen_admin_users").select("role,is_active").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("daily_organisation_checklist_items").select("*").eq("organisation_id", id).order("position"),
    admin.from("organisation_memberships").select("*").eq("organisation_id", id).order("created_at"),
    admin.from("organisation_membership_roles").select("membership_id,role"),
    admin.from("organisation_membership_permission_blocks").select("membership_id,permission_block,enabled,revoked_at"),
    admin.from("daily_organisation_invitations").select("*").eq("organisation_id", id).order("created_at", { ascending: false }),
    admin.from("daily_trainer_profiles").select("*").eq("organisation_id", id).order("display_name"),
    admin.from("daily_trainer_certifications").select("*").order("valid_until", { ascending: true, nullsFirst: false }),
    admin.from("daily_organisation_profile_change_requests").select("*").eq("organisation_id", id).order("requested_at", { ascending: false }),
    admin.from("daily_audit_logs").select("id,actor_type,actor_role,object_type,action,occurred_at,reason").eq("organisation_id", id).order("occurred_at", { ascending: false }).limit(80),
    admin.from("selen_client_profiles").select("user_id,email,full_name,organisation_id").eq("organisation_id", id),
  ]);

  if (organisationRes.error || !organisationRes.data) return <main style={s.page}><p style={s.error}>Organisme introuvable.</p></main>;
  const organisation = organisationRes.data;
  const checklist = checklistRes.data ?? [];
  const memberships = membershipsRes.data ?? [];
  const roles = rolesRes.data ?? [];
  const blocks = blocksRes.data ?? [];
  const invitations = invitationsRes.data ?? [];
  const trainers = trainersRes.data ?? [];
  const trainerIds = new Set(trainers.map((trainer) => trainer.id));
  const certifications = (certificationsRes.data ?? []).filter((certification) => trainerIds.has(certification.trainer_profile_id));
  const validations = validationsRes.data ?? [];
  const pendingValidations = validations.filter((request) => request.status === "pending");
  const attention = checklist.filter((item) => ["todo", "to_review", "blocked"].includes(item.status));
  const completed = checklist.filter((item) => ["validated", "not_applicable"].includes(item.status));
  const expiring = certifications.filter((certification) => certification.validity_mode === "limited" && certification.valid_until && daysUntil(certification.valid_until) <= 90);
  const progress = checklist.length ? Math.round((completed.length / checklist.length) * 100) : 0;
  const assignment = assignmentRes.data as { agent_profile_id?: string; agent_profiles?: { first_name?: string | null; last_name?: string | null; email?: string } | null } | null;
  const assignedAgent = assignment?.agent_profiles;
  const isAdmin = adminAccessRes.data?.role === "admin" || (agentsRes.data ?? []).some((agent) => agent.email === auth.email && agent.role === "admin");
  const profileByUser = new Map((profilesRes.data ?? []).map((profile) => [profile.user_id, profile]));

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <Link href="/agent/daily/organisations" style={s.back}>← Organismes Daily</Link>
          <p style={s.eyebrow}>Dossier organisme</p>
          <h1 style={s.title}>{organisation.legal_name || organisation.name}</h1>
          <p style={s.subtitle}>{organisation.siret || "SIRET à renseigner"} · NDA {organisation.nda_number || "à vérifier"}</p>
        </div>
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
      </header>

      <section style={s.stats}>
        <MiniStat label="Avancement" value={`${progress}%`} />
        <MiniStat label="À traiter" value={String(attention.length)} tone="warn" />
        <MiniStat label="Validations" value={String(pendingValidations.length)} tone="info" />
        <MiniStat label="Échéances ≤ 90 j" value={String(expiring.length)} tone="danger" />
        <MiniStat label="Agent" value={assignedAgent ? ([assignedAgent.first_name, assignedAgent.last_name].filter(Boolean).join(" ") || assignedAgent.email || "Assigné") : "Non assigné"} />
      </section>

      <nav style={s.tabs}>{tabs.map((item) => <Link key={item.key} href={`/agent/daily/organisations/${id}?tab=${item.key}`} style={{ ...s.tab, ...(tab === item.key ? s.activeTab : {}) }}>{item.label}</Link>)}</nav>

      {tab === "overview" ? (
        <div style={s.twoCols}>
          <SelenCard><SelenCardTitle>À traiter maintenant</SelenCardTitle>{attention.length === 0 ? <p style={s.muted}>Rien de bloquant pour le moment.</p> : attention.map((item) => <div key={item.id} style={s.attentionRow}><div><strong>{item.label}</strong><p style={s.mutedInline}>{item.description}</p></div><SelenBadge variant={item.status === "blocked" ? "danger" : "warn"}>{item.status === "blocked" ? "Bloqué" : item.status === "to_review" ? "À vérifier" : `À faire · ${daysSince(item.signaled_at)} j`}</SelenBadge></div>)}</SelenCard>
          <SelenCard><SelenCardTitle>Signaux dossier</SelenCardTitle><Signal label="NDA" value={organisation.nda_status || "unknown"} /><Signal label="Qualiopi" value={organisation.qualiopi_status || "unknown"} /><Signal label="Utilisateurs actifs" value={String(memberships.filter((m) => m.status === "active").length)} /><Signal label="Formateurs actifs" value={String(trainers.filter((t) => t.active).length)} /><Signal label="Invitations en attente" value={String(invitations.filter((i) => i.status === "pending").length)} /></SelenCard>
          <SelenCard style={{ gridColumn: "1 / -1" }}><SelenCardTitle>Échéances formateurs</SelenCardTitle>{expiring.length === 0 ? <p style={s.muted}>Aucune certification à durée limitée n’arrive à échéance dans les 90 jours.</p> : expiring.map((cert) => { const trainer = trainers.find((t) => t.id === cert.trainer_profile_id); return <div key={cert.id} style={s.attentionRow}><span>{trainer?.display_name || "Formateur"} · {cert.title}</span><SelenBadge variant={certVariant(cert.validity_mode, cert.valid_until)}>{certificationLabel(cert.validity_mode, cert.valid_until)}</SelenBadge></div>; })}</SelenCard>
        </div>
      ) : null}

      {tab === "checklist" ? <SelenCard><SelenCardTitle>Checklist du dossier</SelenCardTitle><div style={s.list}>{checklist.map((item) => <form action={updateChecklist} key={item.id} style={s.checkRow}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="item_id" value={item.id} /><div style={{ flex: 1, minWidth: 220 }}><strong>{item.label}</strong><p style={s.mutedInline}>{item.description}</p><p style={s.tiny}>Signalé il y a {daysSince(item.signaled_at)} jour(s)</p></div><select name="status" defaultValue={item.status} style={s.select}><option value="todo">À faire</option><option value="in_progress">En cours</option><option value="to_review">À vérifier</option><option value="validated">Validé</option><option value="blocked">Bloqué</option><option value="not_applicable">Non applicable</option></select><input name="note" defaultValue={item.note || ""} placeholder="Note interne" style={s.input} /><SelenButton type="submit" size="sm">Enregistrer</SelenButton></form>)}</div></SelenCard> : null}

      {tab === "info" ? <div style={s.twoCols}><InfoCard title="Identité" rows={[["Nom affiché", organisation.name],["Raison sociale", organisation.legal_name],["Forme juridique", organisation.legal_form],["SIRET", organisation.siret],["TVA", organisation.vat_number]]} /><InfoCard title="Coordonnées administratives" rows={[["Email", organisation.administrative_email || organisation.email],["Téléphone", organisation.administrative_phone || organisation.phone],["Adresse", organisation.administrative_address || organisation.address],["Contact", organisation.contact_name]]} /><InfoCard title="Représentant légal" rows={[["Nom", organisation.legal_representative_name],["Email", organisation.legal_representative_email]]} /><InfoCard title="Conformité" rows={[["NDA", organisation.nda_number],["Statut NDA", organisation.nda_status],["Déclaré le", organisation.nda_declared_at],["Qualiopi", organisation.qualiopi_status],["Valide du", organisation.qualiopi_valid_from],["Valide jusqu’au", organisation.qualiopi_valid_until],["Catégories", Array.isArray(organisation.qualiopi_categories) ? organisation.qualiopi_categories.join(", ") : null]]} /></div> : null}

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

      {tab === "trainers" ? <div style={s.stack}>{trainers.length === 0 ? <SelenCard><p style={s.muted}>Aucun formateur enregistré.</p></SelenCard> : trainers.map((trainer) => {
        const trainerCerts = certifications.filter((cert) => cert.trainer_profile_id === trainer.id);
        return <SelenCard key={trainer.id}><div style={s.trainerHead}><div><SelenCardTitle>{trainer.display_name || trainer.professional_email || "Formateur"}</SelenCardTitle><p style={s.mutedInline}>{trainer.engagement_type} · {trainer.professional_email || "email non renseigné"}</p></div><div style={s.badgeLine}><SelenBadge variant={trainer.status === "validated" ? "success" : trainer.status === "pending_selen_review" ? "warn" : trainer.status === "rejected" ? "danger" : "neutral"}>{trainer.status}</SelenBadge>{isAdmin && trainer.status !== "validated" ? <form action={reviewTrainer} style={s.inlineForm}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="trainer_profile_id" value={trainer.id} /><SelenButton type="submit" name="decision" value="validated" size="sm">Valider Selen</SelenButton><SelenButton type="submit" name="decision" value="rejected" size="sm" variant="danger">Refuser</SelenButton></form> : null}</div></div><div style={s.certList}>{trainerCerts.length === 0 ? <p style={s.mutedInline}>Aucune certification renseignée par le formateur.</p> : trainerCerts.map((cert) => <div key={cert.id} style={s.certRow}><div><strong>{cert.title}</strong><p style={s.mutedInline}>{[cert.issuer, cert.reference, cert.obtained_on ? `obtenue le ${cert.obtained_on}` : null].filter(Boolean).join(" · ")}</p></div><SelenBadge variant={certVariant(cert.validity_mode, cert.valid_until)}>{certificationLabel(cert.validity_mode, cert.valid_until)}</SelenBadge></div>)}</div><p style={s.readOnlyNotice}>Certifications en consultation uniquement dans Studio. Le formateur les ajoute, les met à jour et dépose ses justificatifs depuis son espace Daily.</p></SelenCard>;
      })}</div> : null}

      {tab === "validations" ? <SelenCard><SelenCardTitle>Demandes de validation Selen</SelenCardTitle>{validations.length === 0 ? <p style={s.muted}>Aucune demande.</p> : validations.map((request) => <article key={request.id} style={s.validationRow}><div style={{ flex: 1 }}><div style={s.badgeLine}><SelenBadge variant={request.status === "pending" ? "warn" : request.status === "approved" ? "success" : "neutral"}>{request.status}</SelenBadge><strong>{request.request_type}</strong></div><pre style={s.pre}>{JSON.stringify(request.proposed_changes, null, 2)}</pre>{request.review_message ? <p style={s.mutedInline}>Décision : {request.review_message}</p> : null}</div>{request.status === "pending" && isAdmin ? <form action={reviewValidation} style={s.reviewForm}><input type="hidden" name="organisation_id" value={id} /><input type="hidden" name="request_id" value={request.id} /><textarea name="message" placeholder="Motif / commentaire" style={s.textarea} /><div style={s.badgeLine}><button type="submit" name="decision" value="approved" style={s.approveButton}>Valider</button><button type="submit" name="decision" value="rejected" style={s.rejectButton}>Refuser</button></div></form> : null}</article>)}</SelenCard> : null}

      {tab === "history" ? <SelenCard><SelenCardTitle>Historique Daily</SelenCardTitle>{(historyRes.data ?? []).length === 0 ? <p style={s.muted}>Aucun événement d’audit enregistré.</p> : (historyRes.data ?? []).map((event) => <div key={event.id} style={s.historyRow}><div><strong>{event.action}</strong><p style={s.mutedInline}>{event.object_type} · {event.actor_role || event.actor_type}</p>{event.reason ? <p style={s.mutedInline}>{event.reason}</p> : null}</div><span style={s.tiny}>{new Date(event.occurred_at).toLocaleString("fr-FR")}</span></div>)}</SelenCard> : null}
    </main>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "info" | "danger" }) {
  const color = tone === "danger" ? "#f48b8b" : tone === "warn" ? "var(--selen-gold)" : tone === "info" ? "var(--selen-info)" : "var(--selen-text)";
  return <SelenCard style={s.statCard}><span style={s.tiny}>{label}</span><strong style={{ color, fontSize: value.length > 16 ? 14 : 24 }}>{value}</strong></SelenCard>;
}
function Signal({ label, value }: { label: string; value: string }) { return <div style={s.signal}><span style={s.mutedInline}>{label}</span><strong>{value}</strong></div>; }
function InfoCard({ title, rows }: { title: string; rows: Array<[string, unknown]> }) { return <SelenCard><SelenCardTitle>{title}</SelenCardTitle>{rows.map(([label, value]) => <Signal key={label} label={label} value={value == null || value === "" ? "—" : String(value)} />)}</SelenCard>; }

const s: Record<string, CSSProperties> = {
  page: { padding: "24px 28px 50px", maxWidth: 1180, margin: "0 auto", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" },
  back: { color: "var(--selen-text3)", fontSize: 12, textDecoration: "none" },
  eyebrow: { marginTop: 10, fontSize: 9, letterSpacing: ".28em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 30, margin: "5px 0" }, subtitle: { fontSize: 13, color: "var(--selen-text2)" },
  assignmentForm: { display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }, smallLabel: { fontSize: 10, color: "var(--selen-text3)" },
  select: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: "9px 10px", minHeight: 38 },
  input: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: "9px 10px", minWidth: 150 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, margin: "18px 0" }, statCard: { minHeight: 82, display: "flex", flexDirection: "column", justifyContent: "space-between" },
  tabs: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }, tab: { color: "var(--selen-text2)", textDecoration: "none", fontSize: 12, border: "1px solid var(--selen-border)", borderRadius: 999, padding: "8px 12px" }, activeTab: { color: "var(--selen-ink)", background: "linear-gradient(135deg,var(--selen-gold),var(--selen-copper))", borderColor: "transparent", fontWeight: 700 },
  twoCols: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }, stack: { display: "grid", gap: 12 }, list: { display: "grid", gap: 10 }, attentionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--selen-border)" }, muted: { color: "var(--selen-text3)", fontSize: 13 }, mutedInline: { margin: "4px 0 0", color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.45 }, tiny: { color: "var(--selen-text3)", fontSize: 10 }, signal: { display: "flex", justifyContent: "space-between", gap: 14, borderBottom: "1px solid var(--selen-border)", padding: "9px 0" },
  checkRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", padding: 12, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg3)" },
  memberCard: { borderTop: "1px solid var(--selen-border)", padding: "14px 0" }, userRow: { display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }, inlineForm: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, accessForm: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, alignItems: "end", marginTop: 12, padding: 12, borderRadius: 12, background: "var(--selen-bg3)" }, fieldset: { border: "1px solid var(--selen-border)", borderRadius: 10, padding: 10, margin: 0 }, legend: { fontSize: 10, color: "var(--selen-text3)", padding: "0 4px" }, checkboxLabel: { display: "block", fontSize: 11, color: "var(--selen-text2)", margin: "5px 0" },
  trainerHead: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }, certList: { display: "grid", marginTop: 8 }, certRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--selen-border)", padding: "10px 0" }, readOnlyNotice: { margin: "12px 0 0", paddingTop: 12, borderTop: "1px solid var(--selen-border)", color: "var(--selen-text3)", fontSize: 11, lineHeight: 1.5 },
  validationRow: { display: "flex", gap: 16, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", borderBottom: "1px solid var(--selen-border)", padding: "13px 0" }, badgeLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, pre: { whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 11, color: "var(--selen-text2)", background: "var(--selen-bg3)", borderRadius: 10, padding: 10 }, reviewForm: { display: "grid", gap: 8, minWidth: 240 }, textarea: { background: "var(--selen-bg3)", color: "var(--selen-text)", border: "1px solid var(--selen-border)", borderRadius: 10, padding: 10, minHeight: 70 }, approveButton: { background: "#40735c", color: "white", border: 0, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }, rejectButton: { background: "#7d4747", color: "white", border: 0, borderRadius: 10, padding: "9px 12px", cursor: "pointer" }, historyRow: { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--selen-border)" }, error: { color: "#ffb0b0" },
};
