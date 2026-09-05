import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyAgentTasks } from "@/lib/server/dailyAgentTasks";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Date inconnue";
}

export default async function AgentDailyPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    admin.from("agent_profiles").select("id,role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  const role = (adminUser?.role === "admin" || profile?.role === "admin" ? "admin" : "agent") as "admin" | "agent";

  let tasks;
  try {
    tasks = await getDailyAgentTasks({ id: profile?.id ?? null, role });
  } catch (error) {
    return <main style={s.page}><p style={s.error}>Impossible de charger le pilotage Daily : {error instanceof Error ? error.message : "erreur inconnue"}</p></main>;
  }

  return <main style={s.page}>
    <header style={s.header}>
      <div>
        <p style={s.eyebrow}>Selen Daily</p>
        <h1 style={s.h1}>Pilotage Daily</h1>
        <p style={s.lead}>Ici, tu ne vois que les interventions réellement à faire. L'assignation d'un agent est toujours la première tâche d'un nouvel organisme. Ensuite, toutes ses formations, sessions et inscriptions restent rattachées au même agent.</p>
      </div>
      <div style={s.counter}><strong>{tasks.length}</strong><span>à traiter</span></div>
    </header>

    <SelenCard style={s.ruleCard}>
      <strong>Règle des 72 h</strong>
      <p style={s.ruleText}>Une tâche est d'abord visible par l'agent responsable de l'organisme. Si elle reste ouverte plus de 72 h, elle devient aussi traitable par les autres agents, sans modifier l'assignation du dossier.</p>
    </SelenCard>

    <SelenCard style={s.qualityShortcut}>
      <div>
        <strong>Bilan annuel des compétences formateurs</strong>
        <p style={s.ruleText}>Contrôle en un coup d'œil les bilans de l'année : contribution du formateur, partie manager et dossiers encore à compléter.</p>
      </div>
      <Link href="/agent/daily/revues-formateurs" style={s.secondary}>Voir le suivi annuel →</Link>
    </SelenCard>

    <SelenCard style={s.qualityShortcut}>
      <div>
        <strong>Procédures internes</strong>
        <p style={s.ruleText}>Retrouve les procédures Daily existantes, les brouillons et les revues documentaires annuelles à prévoir.</p>
      </div>
      <Link href="/agent/daily/procedures-internes" style={s.secondary}>Voir les procédures →</Link>
    </SelenCard>

    <SelenCard style={s.qualityShortcut}>
      <div>
        <strong>Réclamations & suggestions</strong>
        <p style={s.ruleText}>Repère les retours encore ouverts, leur revue Selen, leur transmission à l’organisme et leur résolution.</p>
      </div>
      <Link href="/agent/daily/reclamations" style={s.secondary}>Voir les retours →</Link>
    </SelenCard>

    <SelenCard style={s.qualityShortcut}>
      <div>
        <strong>Suivi sessions & incidents</strong>
        <p style={s.ruleText}>Contrôle les incidents, adaptations et notes de suivi déjà enregistrés pendant les sessions, avec leur niveau de criticité et leur résolution.</p>
      </div>
      <Link href="/agent/daily/suivi-sessions" style={s.secondary}>Voir le suivi des sessions →</Link>
    </SelenCard>

    {tasks.length === 0 ? <SelenCard style={s.empty}>
      <div style={{ fontSize: 30 }}>✓</div>
      <SelenCardTitle>Rien ne demande ton intervention</SelenCardTitle>
      <p style={s.muted}>Les organismes qui te sont assignés n'ont actuellement aucune action à traiter. Une formation validée sans inscription reçue reste volontairement silencieuse.</p>
    </SelenCard> : <section style={s.list}>
      {tasks.map((item) => <SelenCard key={item.id} style={s.card}>
        <div style={s.cardHead}>
          <div>
            <div style={s.badges}>
              <span style={{ ...s.badge, ...(item.kind === "assignment" ? s.badgeAssignment : item.kind === "adaptation" ? s.badgeDanger : item.kind === "registration" ? s.badgeInfo : {}) }}>{item.reason}</span>
              {item.overdueShared ? <span style={{ ...s.badge, ...s.badgeOverdue }}>72 h dépassées · équipe</span> : null}
            </div>
            <SelenCardTitle>{item.title}</SelenCardTitle>
            <p style={s.org}>{item.organisation}</p>
          </div>
          <span style={s.date}>{formatDate(item.createdAt)}</span>
        </div>
        <p style={s.detail}>{item.detail}</p>
        <div style={s.actions}>
          {item.kind === "assignment" ? (
            role === "admin" ? (
              <Link href={item.href} style={s.primary}>Assigner un agent →</Link>
            ) : (
              <form method="post" action="/agent/api/daily/organisation-assignment">
                <input type="hidden" name="organisation_id" value={item.organisationId} />
                <button type="submit" style={s.primaryButton}>Me l’assigner →</button>
              </form>
            )
          ) : (
            <Link href={item.href} style={s.primary}>Traiter maintenant →</Link>
          )}
          {item.kind !== "assignment" ? <Link href={`/agent/daily/organisations/${item.organisationId}`} style={s.secondary}>Voir l'organisme</Link> : null}
        </div>
      </SelenCard>)}
    </section>}
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 22, alignItems: "center", marginBottom: 18 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0 5px", fontFamily: "var(--font-display)", fontSize: 32 },
  lead: { margin: 0, maxWidth: 720, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 14 },
  counter: { minWidth: 105, display: "grid", justifyItems: "center", padding: "14px 18px", border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  ruleCard: { marginBottom: 12, padding: 15 }, ruleText: { margin: "5px 0 0", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.55 },
  qualityShortcut: { marginBottom: 12, padding: 15, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" },
  list: { display: "grid", gap: 12, marginTop: 6 }, card: { padding: 18 }, cardHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" }, badges: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 8 },
  badge: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeAssignment: { background: "rgba(201,148,58,.22)", color: "var(--selen-gold2)" }, badgeInfo: { background: "rgba(83,132,166,.12)", color: "var(--selen-info)" }, badgeDanger: { background: "rgba(180,78,70,.12)", color: "var(--selen-danger)" }, badgeOverdue: { background: "rgba(180,78,70,.16)", color: "var(--selen-danger)" },
  org: { margin: "5px 0 0", fontSize: 12, color: "var(--selen-text3)" }, date: { fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap" },
  detail: { margin: "14px 0", maxWidth: 760, lineHeight: 1.55, fontSize: 13, color: "var(--selen-text2)" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" }, primary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", textDecoration: "none", fontWeight: 800, fontSize: 13 },
  primaryButton: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: 0, background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 800, fontSize: 13, cursor: "pointer" },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 },
  empty: { padding: 30, textAlign: "center", marginTop: 6 }, muted: { margin: "8px auto 0", maxWidth: 660, lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 }, error: { color: "var(--selen-danger)" },
};
