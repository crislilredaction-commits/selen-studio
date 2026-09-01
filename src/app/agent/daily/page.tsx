import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyAgentTasks } from "@/lib/server/dailyAgentTasks";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Date inconnue";
}

function taskAccent(kind: string) {
  if (kind === "assignment") return "var(--selen-gold2)";
  if (kind === "adaptation") return "var(--selen-danger)";
  if (kind === "registration") return "var(--selen-info)";
  return "var(--selen-text3)";
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

  const assignments = tasks.filter((item) => item.kind === "assignment").length;
  const sharedOverdue = tasks.filter((item) => item.overdueShared).length;
  const activeFollowUps = Math.max(tasks.length - assignments, 0);

  return <main style={s.page}>
    <section style={s.hero}>
      <div style={s.heroGlow} aria-hidden="true" />
      <div style={s.heroCopy}>
        <div style={s.heroBadge}>Selen Daily</div>
        <h1 style={s.h1}>Ton centre de pilotage</h1>
        <p style={s.lead}>Les actions qui demandent vraiment une intervention sont regroupées ici. L&apos;organisme reste la source d&apos;assignation pour tout son parcours Daily.</p>
        <div style={s.heroMeta}>
          <span style={s.heroMetaItem}>● Assignation organisme unique</span>
          <span style={s.heroMetaItem}>● Partage équipe après 72 h</span>
        </div>
      </div>
      <div style={s.heroCounter}>
        <span style={s.heroCounterValue}>{tasks.length}</span>
        <span style={s.heroCounterLabel}>action{tasks.length > 1 ? "s" : ""} à traiter</span>
      </div>
    </section>

    <section style={s.metrics} aria-label="Synthèse Daily">
      <SelenCard style={s.metricCard}>
        <div style={{ ...s.metricIcon, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)" }}>↳</div>
        <div>
          <div style={s.metricValue}>{assignments}</div>
          <div style={s.metricLabel}>organisme{assignments > 1 ? "s" : ""} à assigner</div>
        </div>
      </SelenCard>
      <SelenCard style={s.metricCard}>
        <div style={{ ...s.metricIcon, background: "rgba(83,132,166,.12)", color: "var(--selen-info)" }}>✓</div>
        <div>
          <div style={s.metricValue}>{activeFollowUps}</div>
          <div style={s.metricLabel}>suivi{activeFollowUps > 1 ? "s" : ""} actif{activeFollowUps > 1 ? "s" : ""}</div>
        </div>
      </SelenCard>
      <SelenCard style={s.metricCard}>
        <div style={{ ...s.metricIcon, background: "rgba(180,78,70,.12)", color: "var(--selen-danger)" }}>72</div>
        <div>
          <div style={s.metricValue}>{sharedOverdue}</div>
          <div style={s.metricLabel}>partagé{sharedOverdue > 1 ? "s" : ""} avec l&apos;équipe</div>
        </div>
      </SelenCard>
    </section>

    <div style={s.contentGrid}>
      <section style={s.primaryColumn}>
        <div style={s.sectionHeading}>
          <div>
            <p style={s.eyebrow}>File active</p>
            <h2 style={s.h2}>À traiter maintenant</h2>
          </div>
          <span style={s.sectionCount}>{tasks.length}</span>
        </div>

        {tasks.length === 0 ? <SelenCard style={s.empty}>
          <div style={s.emptyIcon}>✓</div>
          <SelenCardTitle>Tout est à jour</SelenCardTitle>
          <p style={s.muted}>Aucune intervention n&apos;est requise pour le moment. Une formation validée sans inscription reçue reste volontairement silencieuse.</p>
        </SelenCard> : <section style={s.list}>
          {tasks.map((item) => <SelenCard key={item.id} style={s.card}>
            <div style={{ ...s.cardAccent, background: taskAccent(item.kind) }} aria-hidden="true" />
            <div style={s.cardBody}>
              <div style={s.cardHead}>
                <div style={s.cardTitleBlock}>
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
                    <Link href={item.href} style={s.primary}>Assigner un agent <span aria-hidden="true">→</span></Link>
                  ) : (
                    <form method="post" action="/agent/api/daily/organisation-assignment">
                      <input type="hidden" name="organisation_id" value={item.organisationId} />
                      <button type="submit" style={s.primaryButton}>Me l&apos;assigner <span aria-hidden="true">→</span></button>
                    </form>
                  )
                ) : (
                  <Link href={item.href} style={s.primary}>Traiter maintenant <span aria-hidden="true">→</span></Link>
                )}
                {item.kind !== "assignment" ? <Link href={`/agent/daily/organisations/${item.organisationId}`} style={s.secondary}>Voir l&apos;organisme</Link> : null}
              </div>
            </div>
          </SelenCard>)}
        </section>}
      </section>

      <aside style={s.sideColumn}>
        <SelenCard style={s.ruleCard}>
          <div style={s.sideIcon}>72 h</div>
          <p style={s.eyebrow}>Règle d&apos;équipe</p>
          <SelenCardTitle>La tâche circule, pas le dossier</SelenCardTitle>
          <p style={s.ruleText}>Une tâche reste d&apos;abord chez l&apos;agent responsable. Après 72 h sans traitement, les autres agents peuvent agir dessus sans modifier l&apos;assignation de l&apos;organisme.</p>
        </SelenCard>
        <SelenCard style={s.ruleCard}>
          <div style={{ ...s.sideIcon, color: "var(--selen-gold2)", borderColor: "rgba(201,148,58,.24)" }}>01</div>
          <p style={s.eyebrow}>Ordre de traitement</p>
          <SelenCardTitle>L&apos;assignation passe en premier</SelenCardTitle>
          <p style={s.ruleText}>Un organisme non assigné commence toujours par « Assigner un agent ». Ses formations, sessions, inscriptions et documents héritent ensuite de cette responsabilité.</p>
        </SelenCard>
      </aside>
    </div>
  </main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1220, margin: "0 auto", padding: "34px 32px 84px", color: "var(--selen-text)" },
  hero: { position: "relative", overflow: "hidden", display: "flex", justifyContent: "space-between", alignItems: "stretch", gap: 30, padding: "30px 32px", marginBottom: 18, border: "1px solid rgba(201,148,58,.2)", borderRadius: 24, background: "linear-gradient(135deg, rgba(201,148,58,.12), rgba(201,148,58,.035) 42%, rgba(255,255,255,.015))", boxShadow: "0 20px 60px rgba(0,0,0,.16)" },
  heroGlow: { position: "absolute", width: 240, height: 240, right: -80, top: -120, borderRadius: 999, background: "rgba(201,148,58,.16)", filter: "blur(18px)", pointerEvents: "none" },
  heroCopy: { position: "relative", zIndex: 1, maxWidth: 760 },
  heroBadge: { display: "inline-flex", padding: "6px 10px", borderRadius: 999, background: "rgba(201,148,58,.12)", border: "1px solid rgba(201,148,58,.18)", color: "var(--selen-gold2)", fontSize: 10, fontWeight: 900, letterSpacing: ".16em", textTransform: "uppercase" },
  h1: { margin: "12px 0 8px", fontFamily: "var(--font-display)", fontSize: 38, lineHeight: 1.05, letterSpacing: "-.02em" },
  lead: { margin: 0, maxWidth: 720, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 14 },
  heroMeta: { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 18 },
  heroMetaItem: { color: "var(--selen-text3)", fontSize: 11, fontWeight: 700 },
  heroCounter: { position: "relative", zIndex: 1, minWidth: 158, display: "grid", placeContent: "center", justifyItems: "center", padding: "18px 22px", borderRadius: 20, border: "1px solid rgba(201,148,58,.22)", background: "rgba(10,10,10,.22)", backdropFilter: "blur(12px)" },
  heroCounterValue: { fontFamily: "var(--font-display)", fontSize: 46, lineHeight: 1, color: "var(--selen-gold2)" },
  heroCounterLabel: { marginTop: 7, color: "var(--selen-text2)", fontSize: 11, fontWeight: 800 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginBottom: 26 },
  metricCard: { display: "flex", alignItems: "center", gap: 14, padding: "16px 18px" },
  metricIcon: { width: 40, height: 40, flex: "0 0 40px", display: "grid", placeItems: "center", borderRadius: 12, fontWeight: 900, fontSize: 12 },
  metricValue: { fontFamily: "var(--font-display)", fontSize: 22, lineHeight: 1.05 },
  metricLabel: { marginTop: 3, color: "var(--selen-text3)", fontSize: 11, fontWeight: 700 },
  contentGrid: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 290px", gap: 20, alignItems: "start" },
  primaryColumn: { minWidth: 0 },
  sideColumn: { display: "grid", gap: 12, position: "sticky", top: 20 },
  sectionHeading: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 16, margin: "0 2px 12px" },
  eyebrow: { margin: 0, fontSize: 9, fontWeight: 900, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h2: { margin: "5px 0 0", fontFamily: "var(--font-display)", fontSize: 24 },
  sectionCount: { minWidth: 32, height: 32, display: "grid", placeItems: "center", borderRadius: 999, background: "var(--selen-bg2)", border: "1px solid var(--selen-border)", color: "var(--selen-text2)", fontSize: 12, fontWeight: 900 },
  list: { display: "grid", gap: 12 },
  card: { position: "relative", overflow: "hidden", padding: 0 },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  cardBody: { padding: "18px 18px 18px 21px" },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" },
  cardTitleBlock: { minWidth: 0 },
  badges: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9 },
  badge: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 10, fontWeight: 900 },
  badgeAssignment: { background: "rgba(201,148,58,.2)", color: "var(--selen-gold2)" },
  badgeInfo: { background: "rgba(83,132,166,.12)", color: "var(--selen-info)" },
  badgeDanger: { background: "rgba(180,78,70,.12)", color: "var(--selen-danger)" },
  badgeOverdue: { background: "rgba(180,78,70,.16)", color: "var(--selen-danger)" },
  org: { margin: "5px 0 0", fontSize: 11, color: "var(--selen-text3)", fontWeight: 700 },
  date: { fontSize: 10, color: "var(--selen-text3)", whiteSpace: "nowrap", paddingTop: 2 },
  detail: { margin: "13px 0 15px", maxWidth: 760, lineHeight: 1.58, fontSize: 12, color: "var(--selen-text2)" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" },
  primary: { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 14px", borderRadius: 10, background: "var(--selen-gold2)", color: "var(--selen-bg)", textDecoration: "none", fontWeight: 900, fontSize: 12, boxShadow: "0 8px 24px rgba(201,148,58,.14)" },
  primaryButton: { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 38, padding: "0 14px", borderRadius: 10, border: 0, background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 900, fontSize: 12, cursor: "pointer", boxShadow: "0 8px 24px rgba(201,148,58,.14)" },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 10, border: "1px solid var(--selen-border)", color: "var(--selen-text)", background: "rgba(255,255,255,.015)", textDecoration: "none", fontWeight: 800, fontSize: 12 },
  ruleCard: { padding: 18 },
  sideIcon: { width: 42, height: 42, display: "grid", placeItems: "center", marginBottom: 14, borderRadius: 12, border: "1px solid rgba(180,78,70,.22)", color: "var(--selen-danger)", background: "rgba(255,255,255,.018)", fontSize: 10, fontWeight: 900 },
  ruleText: { margin: "8px 0 0", color: "var(--selen-text2)", fontSize: 11, lineHeight: 1.62 },
  empty: { padding: 38, textAlign: "center" },
  emptyIcon: { width: 48, height: 48, margin: "0 auto 14px", display: "grid", placeItems: "center", borderRadius: 15, background: "rgba(201,148,58,.12)", color: "var(--selen-gold2)", fontSize: 20, fontWeight: 900 },
  muted: { margin: "8px auto 0", maxWidth: 660, lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 12 },
  error: { color: "var(--selen-danger)" },
};
