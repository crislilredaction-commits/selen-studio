import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const TYPE_LABELS: Record<string, string> = {
  incident: "Incident",
  adaptation: "Adaptation",
  note: "Note de suivi",
};

const LEVEL_LABELS: Record<string, string> = {
  info: "Information",
  attention: "Attention",
  critical: "Critique",
};

function formatDate(value?: string | null) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatSessionDates(startDate?: string | null, endDate?: string | null) {
  if (!startDate && !endDate) return "Dates non renseignées";
  const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
  const start = startDate ? formatter.format(new Date(`${startDate}T12:00:00Z`)) : null;
  const end = endDate ? formatter.format(new Date(`${endDate}T12:00:00Z`)) : null;
  return start && end && start !== end ? `${start} → ${end}` : start || end || "Dates non renseignées";
}

export default async function DailySessionFollowupPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const [
    { data: entries, error: entriesError },
    { data: sessions, error: sessionsError },
    { data: formations, error: formationsError },
    { data: organisations, error: organisationsError },
  ] = await Promise.all([
    admin
      .from("daily_session_followup_entries")
      .select("id,organisation_id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name,created_at,updated_at")
      .order("occurred_at", { ascending: false }),
    admin
      .from("daily_sessions")
      .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status"),
    admin
      .from("daily_formations")
      .select("id,organisation_id,title,status,archived_at"),
    admin
      .from("organisations")
      .select("id,name,legal_name,status")
      .neq("status", "archived"),
  ]);

  if (entriesError || sessionsError || formationsError || organisationsError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger le suivi des sessions Daily.</p></main>;
  }

  const sessionById = new Map((sessions ?? []).map((session) => [session.id, session]));
  const formationById = new Map((formations ?? []).map((formation) => [formation.id, formation]));
  const organisationById = new Map((organisations ?? []).map((organisation) => [organisation.id, organisation]));

  const rows = (entries ?? []).map((entry) => {
    const session = sessionById.get(entry.session_id);
    const formation = session?.formation_id ? formationById.get(session.formation_id) : undefined;
    const organisation = organisationById.get(entry.organisation_id);
    return { entry, session, formation, organisation };
  });

  const openCount = rows.filter(({ entry }) => entry.status === "open").length;
  const incidentCount = rows.filter(({ entry }) => entry.entry_type === "incident").length;
  const criticalOpenCount = rows.filter(({ entry }) => entry.status === "open" && entry.level === "critical").length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Sessions</p>
          <h1 style={s.h1}>Suivi sessions & incidents</h1>
          <p style={s.lead}>Vue de contrôle de la fiche de suivi déjà alimentée par Daily. Elle regroupe incidents, adaptations et notes sans créer de stockage parallèle.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section style={s.stats} aria-label="État du suivi des sessions">
        <div style={s.stat}><strong>{rows.length}</strong><span>entrée(s) de suivi</span></div>
        <div style={openCount ? s.statDue : s.stat}><strong>{openCount}</strong><span>ouverte(s)</span></div>
        <div style={s.stat}><strong>{incidentCount}</strong><span>incident(s)</span></div>
        <div style={criticalOpenCount ? s.statCritical : s.stat}><strong>{criticalOpenCount}</strong><span>critique(s) ouvert(s)</span></div>
      </section>

      <section style={s.notice}>
        <strong>Source de vérité conservée</strong>
        <p style={s.muted}>Cette vue lit uniquement <code>daily_session_followup_entries</code>. Les incidents de session ont donc déjà une source canonique : ils ne doivent pas être dupliqués dans une table qualité séparée.</p>
      </section>

      {rows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucune entrée de suivi enregistrée pour le moment.</p></section>
      ) : (
        <section style={s.list}>
          {rows.map(({ entry, session, formation, organisation }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            const sessionLabel = session?.internal_reference || "Session Daily";
            const resolved = entry.status === "resolved";
            return (
              <article key={entry.id} style={resolved ? s.cardOk : entry.level === "critical" ? s.cardCritical : s.cardDue}>
                <div style={s.rowHead}>
                  <div>
                    <div style={s.badges}>
                      <span style={entry.entry_type === "incident" ? s.badgeIncident : entry.entry_type === "adaptation" ? s.badgeAdaptation : s.badgeNote}>{TYPE_LABELS[entry.entry_type] || entry.entry_type}</span>
                      <span style={entry.level === "critical" ? s.badgeCritical : entry.level === "attention" ? s.badgeAttention : s.badgeInfo}>{LEVEL_LABELS[entry.level] || entry.level}</span>
                      <span style={resolved ? s.badgeResolved : s.badgeOpen}>{resolved ? "Résolue" : "Ouverte"}</span>
                    </div>
                    <h2 style={s.h2}>{entry.summary}</h2>
                    <p style={s.org}>{organisationName} · {formation?.title || "Formation non renseignée"}</p>
                    <p style={s.session}>{sessionLabel} · {formatSessionDates(session?.start_date, session?.end_date)}</p>
                  </div>
                  <span style={s.date}>{formatDate(entry.occurred_at)}</span>
                </div>

                {entry.description ? <p style={s.text}>{entry.description}</p> : null}
                <div style={s.metaGrid}>
                  <div><span>Auteur</span><strong>{entry.author_name || entry.author_role || "Non renseigné"}</strong></div>
                  <div><span>Apprenant lié</span><strong>{entry.enrolment_id ? "Oui" : "Non"}</strong></div>
                  <div><span>Action menée</span><strong>{entry.action_taken || "À renseigner"}</strong></div>
                  <div><span>Résolution</span><strong>{entry.resolved_at ? formatDate(entry.resolved_at) : resolved ? "Résolue" : "Ouverte"}</strong></div>
                </div>

                <div style={s.actions}>
                  <Link href={`/agent/daily/organisations/${entry.organisation_id}`} style={s.secondary}>Voir l’organisme</Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 22, alignItems: "flex-start", marginBottom: 18 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0 5px", fontFamily: "var(--font-display)", fontSize: 32 },
  h2: { margin: "5px 0", fontSize: 18 },
  lead: { margin: 0, maxWidth: 760, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 14 },
  back: { display: "inline-flex", minHeight: 38, alignItems: "center", padding: "0 12px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontSize: 13, fontWeight: 700 },
  stats: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 },
  stat: { display: "grid", gap: 3, padding: 14, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)" },
  statDue: { display: "grid", gap: 3, padding: 14, border: "1px solid rgba(201,148,58,.35)", borderRadius: 12, background: "rgba(201,148,58,.08)" },
  statCritical: { display: "grid", gap: 3, padding: 14, border: "1px solid rgba(180,78,70,.4)", borderRadius: 12, background: "rgba(180,78,70,.1)" },
  notice: { padding: 15, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 14 },
  list: { display: "grid", gap: 12 },
  card: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardOk: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardDue: { padding: 18, border: "1px solid rgba(201,148,58,.28)", borderRadius: 14, background: "rgba(201,148,58,.045)" },
  cardCritical: { padding: 18, border: "1px solid rgba(180,78,70,.36)", borderRadius: 14, background: "rgba(180,78,70,.055)" },
  rowHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" },
  badgeIncident: { padding: "4px 8px", borderRadius: 999, background: "rgba(180,78,70,.12)", color: "var(--selen-danger)", fontSize: 11, fontWeight: 800 },
  badgeAdaptation: { padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeNote: { padding: "4px 8px", borderRadius: 999, background: "rgba(83,132,166,.12)", color: "var(--selen-info)", fontSize: 11, fontWeight: 800 },
  badgeCritical: { padding: "4px 8px", borderRadius: 999, background: "rgba(180,78,70,.16)", color: "var(--selen-danger)", fontSize: 11, fontWeight: 800 },
  badgeAttention: { padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeInfo: { padding: "4px 8px", borderRadius: 999, background: "rgba(83,132,166,.12)", color: "var(--selen-info)", fontSize: 11, fontWeight: 800 },
  badgeResolved: { padding: "4px 8px", borderRadius: 999, background: "rgba(77,135,104,.12)", color: "var(--selen-success)", fontSize: 11, fontWeight: 800 },
  badgeOpen: { padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  org: { margin: "5px 0 0", fontSize: 12, color: "var(--selen-text2)" },
  session: { margin: "3px 0 0", fontSize: 12, color: "var(--selen-text3)" },
  date: { fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap" },
  text: { margin: "14px 0", lineHeight: 1.6, fontSize: 13, color: "var(--selen-text2)" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 9, margin: "14px 0" },
  actions: { display: "flex", gap: 9, flexWrap: "wrap" },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 },
  muted: { margin: "6px 0 0", lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 },
  error: { color: "var(--selen-danger)" },
};
