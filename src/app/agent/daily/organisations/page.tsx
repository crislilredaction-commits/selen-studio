import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { getDailyAgentTasks } from "@/lib/server/dailyAgentTasks";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenBadge from "@/components/ui/SelenBadge";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

type OrganisationRow = {
  id: string;
  name: string;
  legal_name: string | null;
  siret: string | null;
  nda_number: string | null;
  nda_status: string;
  qualiopi_status: string;
  status: string;
};

type AssignmentRow = {
  organisation_id: string;
  agent_profile_id: string;
  agent_profiles: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;
};

type ChecklistRow = {
  organisation_id: string;
  status: string;
  signaled_at: string;
};

type ValidationRow = {
  organisation_id: string;
  status: string;
};

type TrainerRow = {
  id: string;
  organisation_id: string;
};

type CertificationRow = {
  trainer_profile_id: string;
  validity_mode: string;
  valid_until: string | null;
};

function agentLabel(assignment?: AssignmentRow) {
  const profile = assignment?.agent_profiles;
  if (!profile) return "Non assigné";
  const fullName = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || profile.email;
}

function isAttentionStatus(status: string) {
  return ["to_review", "blocked"].includes(status);
}

function isCompletedStatus(status: string) {
  return ["validated", "not_applicable"].includes(status);
}

function daysUntil(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

export default async function DailyOrganisationsPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return <main style={s.page}><p style={s.error}>{auth.error}</p></main>;
  }

  const admin = createSupabaseAdminClient();
  const [{ data: profile, error: profileError }, { data: adminUser, error: adminUserError }] = await Promise.all([
    admin.from("agent_profiles").select("id,role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  const staffReadError = profileError ?? adminUserError;
  if (staffReadError) {
    return <main style={s.page}><p style={s.error}>Erreur Daily : {staffReadError.message}</p></main>;
  }
  const role = (adminUser?.role === "admin" || profile?.role === "admin" ? "admin" : "agent") as "admin" | "agent";

  let attentionTasks;
  try {
    attentionTasks = await getDailyAgentTasks({ id: profile?.id ?? null, role });
  } catch (error) {
    return (
      <main style={s.page}>
        <p style={s.error}>
          Erreur Daily : {error instanceof Error ? error.message : "pilotage Daily indisponible"}
        </p>
      </main>
    );
  }

  let dailyOrganisationIds: string[];
  try {
    dailyOrganisationIds = await getActiveDailyOrganisationIds();
  } catch (error) {
    return (
      <main style={s.page}>
        <p style={s.error}>
          Erreur Daily : {error instanceof Error ? error.message : "périmètre Daily indisponible"}
        </p>
      </main>
    );
  }

  // `.in()` doit toujours recevoir une liste non vide. Cet UUID impossible sert
  // uniquement à produire zéro résultat quand aucun abonnement Daily n'est actif.
  const scopeIds = dailyOrganisationIds.length
    ? dailyOrganisationIds
    : ["00000000-0000-0000-0000-000000000000"];

  const [organisationsRes, assignmentsRes, checklistRes, validationsRes, trainersRes, certificationsRes] =
    await Promise.all([
      admin
        .from("organisations")
        .select("id,name,legal_name,siret,nda_number,nda_status,qualiopi_status,status")
        .in("id", scopeIds)
        .neq("status", "archived")
        .order("name"),
      admin
        .from("daily_organisation_assignments")
        .select("organisation_id,agent_profile_id,agent_profiles(first_name,last_name,email)")
        .in("organisation_id", scopeIds),
      admin
        .from("daily_organisation_checklist_items")
        .select("organisation_id,status,signaled_at")
        .in("organisation_id", scopeIds),
      admin
        .from("daily_organisation_profile_change_requests")
        .select("organisation_id,status")
        .in("organisation_id", scopeIds)
        .eq("status", "pending"),
      admin
        .from("daily_trainer_profiles")
        .select("id,organisation_id")
        .in("organisation_id", scopeIds)
        .eq("active", true),
      admin
        .from("daily_trainer_certifications")
        .select("trainer_profile_id,validity_mode,valid_until")
        .eq("validity_mode", "limited"),
    ]);

  const firstError = [organisationsRes, assignmentsRes, checklistRes, validationsRes, trainersRes, certificationsRes]
    .map((result) => result.error)
    .find(Boolean);

  if (firstError) {
    return <main style={s.page}><p style={s.error}>Erreur Daily : {firstError.message}</p></main>;
  }

  const organisations = (organisationsRes.data ?? []) as OrganisationRow[];
  const assignments = (assignmentsRes.data ?? []) as unknown as AssignmentRow[];
  const checklist = (checklistRes.data ?? []) as ChecklistRow[];
  const validations = (validationsRes.data ?? []) as ValidationRow[];
  const trainers = (trainersRes.data ?? []) as TrainerRow[];
  const certifications = (certificationsRes.data ?? []) as CertificationRow[];

  const trainerOrganisation = new Map(trainers.map((trainer) => [trainer.id, trainer.organisation_id]));
  const urgentCertificationByOrganisation = new Map<string, number>();
  certifications.forEach((certification) => {
    if (!certification.valid_until) return;
    const organisationId = trainerOrganisation.get(certification.trainer_profile_id);
    if (!organisationId) return;
    if (daysUntil(certification.valid_until) <= 90) {
      urgentCertificationByOrganisation.set(
        organisationId,
        (urgentCertificationByOrganisation.get(organisationId) ?? 0) + 1,
      );
    }
  });

  const totalAttention = attentionTasks.length;
  const pendingValidations = validations.length;
  const expiringCertifications = Array.from(urgentCertificationByOrganisation.values()).reduce(
    (total, count) => total + count,
    0,
  );

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Daily · Studio</p>
          <h1 style={s.title}>Organismes</h1>
          <p style={s.subtitle}>
            Pilotage des organismes abonnés à Selen Daily, vérifications, validations Selen et échéances formateurs.
          </p>
        </div>
        <Link href="/agent/daily" style={{ textDecoration: "none" }}>
          <SelenButton variant="ghost">← Pilotage Daily</SelenButton>
        </Link>
      </header>

      <section style={s.stats}>
        <Stat label="Organismes Daily actifs" value={organisations.length} />
        <Stat label="Points à traiter" value={totalAttention} tone="warn" />
        <Stat label="Validations Selen" value={pendingValidations} tone="info" />
        <Stat label="Certifications ≤ 90 j" value={expiringCertifications} tone="danger" />
      </section>

      <SelenCard>
        <SelenCardTitle>Dossiers organismes Daily</SelenCardTitle>
        {organisations.length === 0 ? (
          <p style={s.empty}>Aucun organisme abonné à Daily pour le moment.</p>
        ) : (
          <div style={s.list}>
            {organisations.map((organisation) => {
              const assignment = assignments.find((row) => row.organisation_id === organisation.id);
              const items = checklist.filter((row) => row.organisation_id === organisation.id);
              const done = items.filter((item) => isCompletedStatus(item.status)).length;
              const attention = items.filter((item) => isAttentionStatus(item.status)).length;
              const validationCount = validations.filter((row) => row.organisation_id === organisation.id).length;
              const certificationCount = urgentCertificationByOrganisation.get(organisation.id) ?? 0;
              const progress = items.length ? Math.round((done / items.length) * 100) : 0;

              return (
                <article key={organisation.id} style={s.row}>
                  <div style={s.rowMain}>
                    <div>
                      <h2 style={s.orgTitle}>{organisation.legal_name || organisation.name}</h2>
                      <p style={s.meta}>
                        {organisation.siret || "SIRET à renseigner"} · NDA {organisation.nda_number || "à vérifier"}
                      </p>
                    </div>
                    <div style={s.badges}>
                      <SelenBadge variant={assignment ? "info" : "warn"} dot>
                        {agentLabel(assignment)}
                      </SelenBadge>
                      {attention > 0 ? <SelenBadge variant="warn">{attention} à traiter</SelenBadge> : null}
                      {validationCount > 0 ? <SelenBadge variant="info">{validationCount} validation(s)</SelenBadge> : null}
                      {certificationCount > 0 ? <SelenBadge variant="danger">{certificationCount} échéance(s)</SelenBadge> : null}
                    </div>
                  </div>

                  <div style={s.progressTrack}>
                    <div style={{ ...s.progressFill, width: `${progress}%` }} />
                  </div>
                  <div style={s.rowFooter}>
                    <span style={s.progressText}>{done}/{items.length || 7} vérifications terminées · {progress}%</span>
                    <Link href={`/agent/daily/organisations/${organisation.id}`} style={{ textDecoration: "none" }}>
                      <SelenButton size="sm" variant="primary">Ouvrir le dossier</SelenButton>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SelenCard>
    </main>
  );
}

function Stat({ label, value, tone = "gold" }: { label: string; value: number; tone?: "gold" | "warn" | "info" | "danger" }) {
  const color = tone === "danger" ? "#f48b8b" : tone === "warn" ? "var(--selen-gold)" : tone === "info" ? "var(--selen-info)" : "var(--selen-gold2)";
  return (
    <SelenCard style={s.statCard}>
      <span style={s.statLabel}>{label}</span>
      <strong style={{ ...s.statValue, color }}>{value}</strong>
    </SelenCard>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: "24px 28px 50px", maxWidth: 1180, margin: "0 auto", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22 },
  eyebrow: { fontFamily: "var(--font-display)", fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: "var(--selen-gold)" },
  title: { fontFamily: "var(--font-display)", fontSize: 32, margin: "6px 0 0", fontWeight: 600 },
  subtitle: { color: "var(--selen-text2)", fontSize: 14, maxWidth: 720, lineHeight: 1.6, marginTop: 8 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 },
  statCard: { minHeight: 104, display: "flex", flexDirection: "column", justifyContent: "space-between" },
  statLabel: { color: "var(--selen-text3)", fontSize: 12 },
  statValue: { fontFamily: "var(--font-display)", fontSize: 30 },
  list: { display: "grid", gap: 12 },
  row: { border: "1px solid var(--selen-border)", borderRadius: 16, padding: 16, background: "var(--selen-bg3)" },
  rowMain: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" },
  orgTitle: { margin: 0, fontSize: 17, color: "var(--selen-text)" },
  meta: { margin: "5px 0 0", fontSize: 12, color: "var(--selen-text3)" },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" },
  progressTrack: { height: 7, borderRadius: 99, background: "rgba(255,255,255,.08)", overflow: "hidden", marginTop: 15 },
  progressFill: { height: "100%", borderRadius: 99, background: "linear-gradient(90deg,var(--selen-gold),var(--selen-copper))" },
  rowFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" },
  progressText: { fontSize: 11, color: "var(--selen-text3)" },
  empty: { color: "var(--selen-text3)", fontSize: 13 },
  error: { color: "#ffb0b0" },
};