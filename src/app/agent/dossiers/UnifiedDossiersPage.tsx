import Link from "next/link";
import SelenButton from "@/components/ui/SelenButton";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import DossiersRegistry, { type RegistryEntry } from "./DossiersRegistry";

type Organisation = { id: string; name: string; siret: string | null; email: string | null };
type OrganisationRelation = Organisation | Organisation[] | null;
type AssignmentProfile = { first_name: string | null; last_name: string | null; email: string | null } | Array<{ first_name: string | null; last_name: string | null; email: string | null }> | null;
type LegacyDossier = {
  id: string; title: string; type: string; status: string; created_at: string;
  organisations: OrganisationRelation;
  dossier_assignments: Array<{ is_primary: boolean; profiles: AssignmentProfile }> | null;
  messages: Array<{ sender_type: string; read_by_agent_at: string | null }> | null;
};
type DailyAssignment = { organisation_id: string; agent_profiles: AssignmentProfile };
type PreauditSession = {
  session_id: string; user_id: string; client_name: string | null; client_email: string | null;
  organisation_name: string | null; session_status: string | null; audit_type: string | null; session_created_at: string;
};
type AuditBlancCase = { id: string; client_email: string; status: string; created_at: string; profile_data: Record<string, unknown> | null };

function singleOrganisation(value: OrganisationRelation) { return Array.isArray(value) ? value[0] ?? null : value; }
function normalisedEmail(value: string | null | undefined) { return value?.trim().toLowerCase() || null; }
function profileText(profile: Record<string, unknown> | null, keys: string[]) {
  if (!profile) return null;
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
function agentName(value: AssignmentProfile) {
  const profile = Array.isArray(value) ? value[0] ?? null : value;
  if (!profile) return null;
  return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.email || null;
}
function dossierType(type: string) {
  switch (type) {
    case "nda": return { key: "nda", label: "Prépa NDA" };
    case "daily": return { key: "daily", label: "Daily" };
    case "review":
    case "audit_blanc": return { key: "audit_blanc", label: "Audit blanc" };
    case "prepa":
    case "mise_en_conformite": return { key: "prepa", label: "Prépa Qualiopi" };
    case "non_conformite": return { key: "non_conformite", label: "Mise en conformité" };
    default: return { key: type || "autre", label: type || "Autre prestation" };
  }
}
function statusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    draft: "Brouillon", waiting_client: "En attente client", assignable: "À assigner", assigned: "Assigné",
    in_progress: "En cours", generated: "Généré", collecting_documents: "Collecte documents",
    under_review: "En vérification", to_complete: "À compléter", compliant: "Conforme", archived: "Archivé",
    completed: "Terminé", paid: "Paiement validé", booking_pending: "À planifier", partially_booked: "Partiellement réservé",
    booked: "Réservé", report_ready: "Rapport prêt", cancelled: "Annulé",
  };
  return status ? labels[status] ?? status : "À suivre";
}

export default async function UnifiedDossiersPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: "24px 28px", color: "var(--selen-danger)" }}>{auth.error}</main>;

  const admin = createSupabaseAdminClient();
  const [dossiersRes, preauditsRes, auditsBlancsRes, organisationsRes, dailyAssignmentsRes] = await Promise.all([
    admin.from("dossiers").select(`id,title,type,status,created_at,organisations(id,name,siret,email),dossier_assignments(is_primary,profiles:agent_id(first_name,last_name,email)),messages(sender_type,read_by_agent_at)`).order("created_at", { ascending: false }),
    admin.from("admin_preaudit_sessions_overview").select("session_id,user_id,client_name,client_email,organisation_name,session_status,audit_type,session_created_at").order("session_created_at", { ascending: false }),
    admin.from("audit_blanc_cases").select("id,client_email,status,created_at,profile_data").neq("status", "cancelled").order("created_at", { ascending: false }),
    admin.from("organisations").select("id,name,siret,email"),
    admin.from("daily_organisation_assignments").select("organisation_id,agent_profiles(first_name,last_name,email)"),
  ]);

  const firstError = dossiersRes.error ?? preauditsRes.error ?? auditsBlancsRes.error ?? organisationsRes.error ?? dailyAssignmentsRes.error;
  if (firstError) return <main style={{ padding: "24px 28px", color: "var(--selen-danger)" }}>Impossible de charger le registre des dossiers. {firstError.message}</main>;

  const organisations = (organisationsRes.data ?? []) as Organisation[];
  const byEmail = new Map(organisations.map((organisation) => [normalisedEmail(organisation.email), organisation] as const).filter((pair): pair is [string, Organisation] => Boolean(pair[0])));
  const dailyAgentByOrganisation = new Map(
    ((dailyAssignmentsRes.data ?? []) as unknown as DailyAssignment[]).map((assignment) => [assignment.organisation_id, agentName(assignment.agent_profiles)] as const),
  );
  const entries: RegistryEntry[] = [];

  for (const dossier of (dossiersRes.data ?? []) as unknown as LegacyDossier[]) {
    const organisation = singleOrganisation(dossier.organisations);
    const type = dossierType(dossier.type);
    const primary = dossier.dossier_assignments?.find((item) => item.is_primary) ?? dossier.dossier_assignments?.[0];
    const legacyAgentName = agentName(primary?.profiles ?? null);
    const assignedAgentName = dossier.type === "daily" && organisation
      ? dailyAgentByOrganisation.get(organisation.id) ?? null
      : legacyAgentName;
    const unread = (dossier.messages ?? []).filter((message) => message.sender_type === "client" && message.read_by_agent_at === null).length;
    entries.push({
      key: `dossier:${dossier.id}`, title: dossier.title, organisationName: organisation?.name ?? dossier.title,
      siret: organisation?.siret ?? null, prestation: type.label, prestationKey: type.key, status: dossier.status,
      statusLabel: statusLabel(dossier.status), createdAt: dossier.created_at,
      href: dossier.type === "daily" && organisation ? `/agent/daily/organisations/${organisation.id}` : `/agent/dossiers/${dossier.id}`,
      secondary: [assignedAgentName ? `Agent : ${assignedAgentName}` : dossier.type === "daily" ? "Agent : non assigné" : null, unread ? `${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ") || null,
    });
  }

  for (const session of (preauditsRes.data ?? []) as PreauditSession[]) {
    const organisation = byEmail.get(normalisedEmail(session.client_email) ?? "") ?? null;
    entries.push({
      key: `preaudit:${session.session_id}`, title: "Préaudit Qualiopi",
      organisationName: session.organisation_name || organisation?.name || session.client_name || session.client_email || "Client Préaudit",
      siret: organisation?.siret ?? null, prestation: "Préaudit", prestationKey: "preaudit",
      status: session.session_status ?? "draft", statusLabel: statusLabel(session.session_status), createdAt: session.session_created_at,
      href: organisation ? `/agent/clients/${organisation.id}` : null, secondary: session.client_email,
    });
  }

  for (const audit of (auditsBlancsRes.data ?? []) as AuditBlancCase[]) {
    const organisation = byEmail.get(normalisedEmail(audit.client_email) ?? "") ?? null;
    entries.push({
      key: `audit-blanc:${audit.id}`, title: "Audit blanc",
      organisationName: profileText(audit.profile_data, ["organisation_name", "organization_name", "company_name", "of_name", "name"]) || organisation?.name || audit.client_email || "Client Audit blanc",
      siret: organisation?.siret ?? profileText(audit.profile_data, ["siret"]), prestation: "Audit blanc", prestationKey: "audit_blanc",
      status: audit.status, statusLabel: statusLabel(audit.status), createdAt: audit.created_at,
      href: `/agent/audits-blancs/${audit.id}`, secondary: audit.client_email,
    });
  }

  entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main style={{ padding: "24px 28px", maxWidth: 1180, margin: "0 auto", color: "var(--selen-text)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--selen-gold)", opacity: 0.8 }}>Studio agent</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, marginTop: 8, lineHeight: 1.2 }}>Dossiers</h1>
          <p style={{ marginTop: 8, fontSize: 13, color: "var(--selen-text2)" }}>Registre transversal de tous les clients Selen, quelle que soit la prestation.</p>
        </div>
        <Link href="/agent/dossiers/new" style={{ textDecoration: "none" }}><SelenButton variant="primary">+ Nouveau dossier</SelenButton></Link>
      </div>
      <DossiersRegistry entries={entries} />
    </main>
  );
}