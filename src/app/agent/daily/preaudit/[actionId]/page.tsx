import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { QUALIOPI_PREAUDIT_CHECKLIST, QUALIOPI_PREAUDIT_PRINCIPLES } from "@/lib/daily/qualiopiPreauditChecklist";
import { isOverdueAfterBusinessHours } from "@/lib/franceBusinessTime";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

const AGENT_SHARED_AFTER_BUSINESS_HOURS = 24;
function isOverdue(value?: string | null) {
  return isOverdueAfterBusinessHours(value ?? null, AGENT_SHARED_AFTER_BUSINESS_HOURS);
}
function frDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(`${value}T00:00:00`)) : "Non renseignée";
}

async function currentAgent(email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("agent_profiles").select("id,email,role").eq("email", email).eq("is_active", true).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function completePreaudit(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent();
  if (!auth.ok) throw new Error(auth.error);
  const actionId = String(formData.get("action_id") ?? "");
  if (!actionId) throw new Error("Tâche pré-audit introuvable.");

  const admin = createSupabaseAdminClient();
  const profile = await currentAgent(auth.email);
  if (!profile?.id) throw new Error("Profil agent introuvable.");
  const { data: action, error: actionError } = await admin
    .from("daily_quality_actions")
    .select("id,organisation_id,status,source_type,created_at")
    .eq("id", actionId)
    .eq("source_type", "qualiopi_preaudit")
    .in("status", ["open", "planned"])
    .maybeSingle();
  if (actionError) throw new Error(actionError.message);
  if (!action) throw new Error("Cette tâche a déjà été traitée ou n’existe plus.");

  const { data: assignment, error: assignmentError } = await admin
    .from("daily_organisation_assignments")
    .select("agent_profile_id")
    .eq("organisation_id", action.organisation_id)
    .maybeSingle();
  if (assignmentError) throw new Error(assignmentError.message);
  const canTreat = assignment?.agent_profile_id === profile.id || isOverdue(action.created_at);
  if (!canTreat) throw new Error("Cette tâche est encore réservée à l’agent assigné à l’organisme.");

  const { error: updateError } = await admin
    .from("daily_quality_actions")
    .update({
      status: "implemented",
      implemented_at: new Date().toISOString(),
      implemented_improvement: "Pré-audit Qualiopi traité par Selen.",
    })
    .eq("id", action.id)
    .eq("organisation_id", action.organisation_id)
    .in("status", ["open", "planned"]);
  if (updateError) throw new Error(updateError.message);

  revalidatePath("/agent/daily");
  revalidatePath(`/agent/daily/organisations/${action.organisation_id}`);
  redirect("/agent/daily");
}

export default async function DailyQualiopiPreauditPage({ params }: { params: Promise<{ actionId: string }> }) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;
  const { actionId } = await params;
  const admin = createSupabaseAdminClient();
  const profile = await currentAgent(auth.email);
  if (!profile?.id) return <main style={s.page}><p style={s.error}>Profil agent introuvable.</p></main>;

  const { data: action, error: actionError } = await admin
    .from("daily_quality_actions")
    .select("id,organisation_id,title,observation,proposed_solution,status,source_type,created_at")
    .eq("id", actionId)
    .eq("source_type", "qualiopi_preaudit")
    .in("status", ["open", "planned"])
    .maybeSingle();
  if (actionError) return <main style={s.page}><p style={s.error}>{actionError.message}</p></main>;
  if (!action) return <main style={s.page}><SelenCard><SelenCardTitle>Tâche déjà traitée</SelenCardTitle><p style={s.muted}>Ce pré-audit n’est plus dans les tâches à traiter.</p><Link href="/agent/daily" style={s.link}>Retour au Pilotage Daily</Link></SelenCard></main>;

  const [{ data: organisation }, { data: assignment }] = await Promise.all([
    admin.from("organisations").select("id,name,legal_name,qualiopi_valid_from,qualiopi_valid_until,qualiopi_surveillance_audit_date,qualiopi_surveillance_window_start,qualiopi_surveillance_window_end").eq("id", action.organisation_id).maybeSingle(),
    admin.from("daily_organisation_assignments").select("agent_profile_id").eq("organisation_id", action.organisation_id).maybeSingle(),
  ]);
  const overdueShared = isOverdue(action.created_at);
  const canTreat = assignment?.agent_profile_id === profile.id || overdueShared;
  const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";

  return <main style={s.page}>
    <Link href="/agent/daily" style={s.link}>← Retour au Pilotage Daily</Link>
    <header style={s.header}>
      <p style={s.eyebrow}>Selen Daily · Qualiopi</p>
      <h1 style={s.h1}>{action.title || "Pré-audit Qualiopi"}</h1>
      <p style={s.muted}>{organisationName}</p>
    </header>

    {overdueShared ? <p style={s.warning}>Cette tâche dépasse 24 h ouvrées : elle est maintenant traitable par l’équipe, sans modifier l’assignation de l’organisme.</p> : null}

    <section style={s.grid}>
      <SelenCard><SelenCardTitle>Cycle Qualiopi</SelenCardTitle><Info label="Début du cycle" value={frDate(organisation?.qualiopi_valid_from)} /><Info label="Fin du cycle" value={frDate(organisation?.qualiopi_valid_until)} /><Info label="Fenêtre de surveillance" value={`${frDate(organisation?.qualiopi_surveillance_window_start)} → ${frDate(organisation?.qualiopi_surveillance_window_end)}`} /><Info label="Audit planifié" value={frDate(organisation?.qualiopi_surveillance_audit_date)} /></SelenCard>
      <SelenCard><SelenCardTitle>Préparation</SelenCardTitle><p style={s.muted}>{action.observation || "Préparer le pré-audit avant l’audit de surveillance."}</p>{action.proposed_solution ? <p style={s.muted}>{action.proposed_solution}</p> : null}<p style={s.note}>{QUALIOPI_PREAUDIT_PRINCIPLES.reuseEvidence} {QUALIOPI_PREAUDIT_PRINCIPLES.flagGaps}</p></SelenCard>
    </section>

    <SelenCard style={{ marginTop: 14 }}>
      <SelenCardTitle>Checklist pré-audit</SelenCardTitle>
      <p style={s.muted}>Aide-mémoire agent fondé sur les preuves déjà présentes dans Daily. La checklist reste extensible et servira aussi de source de vérité au futur pré-check Sélion et à l’audit live.</p>
      <div style={s.checklist}>
        {QUALIOPI_PREAUDIT_CHECKLIST.map((item) => <div key={item.indicators} style={s.checkItem}>
          <strong style={s.indicator}>Ind. {item.indicators}</strong>
          <div>
            {item.scope ? <p style={s.scope}><strong>Périmètre :</strong> {item.scope}</p> : null}
            <ul style={s.evidenceList}>{item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
            {item.upcomingRequirement ? <div style={s.upcoming}>
              <strong style={s.upcomingTitle}>À anticiper à partir du {frDate(item.upcomingRequirement.effectiveFrom)}</strong>
              <ul style={s.evidenceList}>{item.upcomingRequirement.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
              <span style={s.regulatorySource}>{item.upcomingRequirement.reference}</span>
            </div> : null}
          </div>
        </div>)}
      </div>
      <p style={s.note}>{QUALIOPI_PREAUDIT_PRINCIPLES.regulatoryReadiness} {QUALIOPI_PREAUDIT_PRINCIPLES.scopedRequirements}</p>
      <p style={s.note}><strong>Pré-check Sélion :</strong> {QUALIOPI_PREAUDIT_PRINCIPLES.selionRole} {QUALIOPI_PREAUDIT_PRINCIPLES.agentRole}</p>
    </SelenCard>

    <SelenCard style={{ marginTop: 14 }}>
      <SelenCardTitle>Clôturer cette intervention</SelenCardTitle>
      {canTreat ? <><p style={s.muted}>Marque la tâche comme traitée lorsque le pré-audit a réellement été réalisé et validé par un agent. Elle disparaîtra alors du Pilotage pour tous les agents.</p><form action={completePreaudit}><input type="hidden" name="action_id" value={action.id} /><button type="submit" style={s.primary}>Pré-audit traité</button></form></> : <p style={s.warning}>Cette tâche est encore réservée à l’agent assigné à l’organisme. Elle deviendra partageable après 24 h ouvrées, hors week-ends et jours fériés, si elle reste ouverte.</p>}
    </SelenCard>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={s.info}><span>{label}</span><strong>{value}</strong></div>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { margin: "20px 0" },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0", fontFamily: "var(--font-display)", fontSize: 32 },
  muted: { color: "var(--selen-text2)", lineHeight: 1.6, fontSize: 13 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 },
  info: { display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--selen-border)", fontSize: 13 },
  checklist: { display: "grid", gap: 10, marginTop: 14 },
  checkItem: { display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--selen-border)" },
  indicator: { color: "var(--selen-gold2)", fontSize: 13 },
  scope: { margin: "0 0 8px", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.5 },
  evidenceList: { margin: 0, paddingLeft: 18, color: "var(--selen-text2)", fontSize: 13, lineHeight: 1.55 },
  upcoming: { marginTop: 10, padding: 10, border: "1px solid rgba(201,148,58,.32)", borderRadius: 8, background: "rgba(201,148,58,.06)" },
  upcomingTitle: { display: "block", marginBottom: 6, color: "var(--selen-gold2)", fontSize: 11 },
  regulatorySource: { display: "block", marginTop: 6, color: "var(--selen-text3)", fontSize: 10 },
  note: { marginTop: 14, padding: 12, borderLeft: "3px solid var(--selen-gold2)", background: "rgba(201,148,58,.07)", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.55 },
  warning: { padding: 12, border: "1px solid rgba(180,78,70,.4)", background: "rgba(180,78,70,.08)", color: "var(--selen-danger)", lineHeight: 1.5, fontSize: 13 },
  primary: { minHeight: 40, border: 0, borderRadius: 8, background: "var(--selen-gold2)", color: "var(--selen-bg)", padding: "0 14px", fontWeight: 800, cursor: "pointer" },
  link: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 800, fontSize: 13 },
  error: { color: "var(--selen-danger)" },
};
