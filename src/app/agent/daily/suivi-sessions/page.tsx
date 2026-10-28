import Link from "next/link";
import styles from "./session-followup-mobile.module.css";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { buildScopedSessionFollowupRows } from "@/lib/daily/sessionFollowupScope.mjs";
import { normalizeSessionFollowupFilters, resolveSessionFollowupOrganisationSelection, filterSessionFollowupRows, countSessionFollowupStates } from "@/lib/daily/sessionFollowupFilters.mjs";

const TYPE_LABELS: Record<string, string> = {
  incident: "Incident",
  adaptation: "Adaptation",
  note: "Note de suivi",
  absence: "Absence",
  delay: "Retard",
  abandonment_alert: "Abandon à confirmer",
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

type Props = { searchParams?: Promise<{ organisation_id?: string | string[]; q?: string | string[]; etat?: string | string[]; niveau?: string | string[]; type?: string | string[] }> };

export default async function DailySessionFollowupPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  // Le service-role ne doit jamais transformer un accès agent en lecture globale.
  let organisationIds: string[];
  try {
    organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main role="alert" style={s.page}><p>Impossible de vérifier votre périmètre Daily. Réessayez plus tard.</p></main>;
  }
  if (organisationIds.length === 0) {
    return <main style={s.page}><p>Aucun organisme Daily actif dans votre périmètre.</p></main>;
  }

  const params = (await searchParams) ?? {};
  const selection = resolveSessionFollowupOrganisationSelection(params.organisation_id, organisationIds);
  if (!selection.valid) return <main role="alert" style={s.page}>Organisme indisponible dans votre périmètre Daily.</main>;

  const admin = createSupabaseAdminClient();
  const { data: organisations, error: organisationsError } = await admin
    .from("organisations")
    .select("id,name,legal_name,status")
    .in("id", organisationIds)
    .neq("status", "archived");
  if (organisationsError) return <main style={s.page}><p style={s.error}>Impossible de charger les organismes Daily.</p></main>;
  const activeOrganisationIds = (organisations ?? []).map((organisation) => organisation.id);
  if (selection.id && !activeOrganisationIds.includes(selection.id)) {
    return <main role="alert" style={s.page}>Organisme indisponible dans votre périmètre Daily.</main>;
  }
  const scopedOrganisationIds = selection.id ? [selection.id] : activeOrganisationIds;
  if (scopedOrganisationIds.length === 0) return <main style={s.page}><p>Aucun organisme Daily actif dans votre périmètre.</p></main>;

  const [
    { data: entries, error: entriesError },
    { data: sessions, error: sessionsError },
    { data: formations, error: formationsError },
  ] = await Promise.all([
    admin
      .from("daily_session_followup_entries")
      .select("id,organisation_id,session_id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at,author_role,author_name,created_at,updated_at")
      .in("organisation_id", scopedOrganisationIds)
      .order("occurred_at", { ascending: false }),
    admin
      .from("daily_sessions")
      .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status")
      .in("organisation_id", scopedOrganisationIds),
    admin
      .from("daily_formations")
      .select("id,organisation_id,title,status,archived_at")
      .in("organisation_id", scopedOrganisationIds),
  ]);

  if (entriesError || sessionsError || formationsError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger le suivi des sessions Daily.</p></main>;
  }

  // Même si une référence inter-organismes est corrompue, aucun détail ne traverse le périmètre.
  const rows = buildScopedSessionFollowupRows(entries ?? [], sessions ?? [], formations ?? [], organisations ?? [], scopedOrganisationIds) as Array<{
    entry: NonNullable<typeof entries>[number];
    session: NonNullable<typeof sessions>[number] | undefined;
    formation: NonNullable<typeof formations>[number] | undefined;
    organisation: NonNullable<typeof organisations>[number];
    actionable: boolean;
  }>;

  // Les filtres portent exclusivement sur les lignes déjà autorisées, jamais sur une requête globale.
  const filters = normalizeSessionFollowupFilters(params);
  const visibleRows = filterSessionFollowupRows(rows, filters) as typeof rows;
  const stateCounts = countSessionFollowupStates(rows);
  const openCount = rows.filter(({ entry, actionable }) => actionable && entry.status === "open").length;
  const incidentCount = rows.filter(({ entry }) => entry.entry_type === "incident").length;
  const criticalOpenCount = rows.filter(({ entry, actionable }) => actionable && entry.status === "open" && entry.level === "critical").length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Sessions</p>
          <h1 style={s.h1}>Suivi sessions & incidents</h1>
          <p style={s.lead}>Vue de contrôle de la fiche de suivi déjà alimentée par Daily. Elle regroupe incidents, adaptations et notes sans créer de stockage parallèle.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section className={styles.stats} aria-label="État du suivi des sessions">
        <div style={s.stat}><strong>{rows.length}</strong><span>entrée(s) de suivi</span></div>
        <div style={openCount ? s.statDue : s.stat}><strong>{openCount}</strong><span>ouverte(s)</span></div>
        <div style={s.stat}><strong>{incidentCount}</strong><span>incident(s)</span></div>
        <div style={criticalOpenCount ? s.statCritical : s.stat}><strong>{criticalOpenCount}</strong><span>critique(s) ouvert(s)</span></div>
      </section>

      <form method="get" action="/agent/daily/suivi-sessions" style={s.filterPanel} aria-label="Rechercher et filtrer les suivis">
        <div style={s.filterGrid}>
          <label style={s.filterLabel} htmlFor="followup-organisation">
            Organisme
            <select id="followup-organisation" name="organisation_id" defaultValue={selection.id ?? ""} style={s.filterInput}>
              <option value="">Tous mes organismes</option>
              {(organisations ?? []).map((organisation) => (
                <option key={organisation.id} value={organisation.id}>{organisation.legal_name || organisation.name || "Organisme Daily"}</option>
              ))}
            </select>
          </label>
          <label style={s.filterLabel} htmlFor="followup-search">
            Recherche
            <input id="followup-search" name="q" type="search" maxLength={80} defaultValue={filters.q} placeholder="Organisme, formation, session, événement…" style={s.filterInput} />
          </label>
          <label style={s.filterLabel} htmlFor="followup-state">
            État
            <select id="followup-state" name="etat" defaultValue={filters.state} style={s.filterInput}>
              <option value="all">Tous ({stateCounts.all})</option>
              <option value="open">Ouverts ({stateCounts.open})</option>
              <option value="resolved">Résolus ({stateCounts.resolved})</option>
              <option value="history">Historique sans action ({stateCounts.history})</option>
            </select>
          </label>
          <label style={s.filterLabel} htmlFor="followup-level">
            Criticité
            <select id="followup-level" name="niveau" defaultValue={filters.level} style={s.filterInput}>
              <option value="all">Toutes</option>
              <option value="critical">Critique</option>
              <option value="attention">Attention</option>
              <option value="info">Information</option>
            </select>
          </label>
          <label style={s.filterLabel} htmlFor="followup-type">
            Nature
            <select id="followup-type" name="type" defaultValue={filters.type} style={s.filterInput}>
              <option value="all">Toutes</option>
              <option value="incident">Incidents</option>
              <option value="adaptation">Adaptations</option>
              <option value="note">Notes de suivi</option>
              <option value="absence">Absences</option>
              <option value="delay">Retards</option>
              <option value="abandonment_alert">Alertes abandon</option>
            </select>
          </label>
        </div>
        <div style={s.filterActions}>
          <button type="submit" style={s.filterButton}>Appliquer les filtres</button>
          <Link href="/agent/daily/suivi-sessions" style={s.secondary}>Réinitialiser</Link>
          <span role="status" style={s.muted}>{visibleRows.length} résultat(s) sur {rows.length} · urgences ouvertes en premier</span>
        </div>
      </form>

      <section style={s.notice}>
        <strong>Source de vérité conservée</strong>
        <p style={s.muted}>Cette vue lit uniquement <code>daily_session_followup_entries</code>. Les incidents de session ont donc déjà une source canonique : ils ne doivent pas être dupliqués dans une table qualité séparée.</p>
      </section>

      {rows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucune entrée de suivi enregistrée pour le moment.</p></section>
      ) : visibleRows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucun suivi ne correspond aux filtres. Modifiez la recherche ou réinitialisez les filtres.</p></section>
      ) : (
        <section style={s.list}>
          {visibleRows.map(({ entry, session, formation, organisation, actionable }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            const sessionLabel = session?.internal_reference || "Session Daily";
            const resolved = entry.status === "resolved";
            return (
              <article key={entry.id} className={styles.followupCard} style={resolved ? s.cardOk : entry.level === "critical" ? s.cardCritical : s.cardDue}>
                <div className={styles.rowHead}>
                  <div>
                    <div style={s.badges}>
                      <span style={entry.entry_type === "incident" ? s.badgeIncident : entry.entry_type === "adaptation" ? s.badgeAdaptation : s.badgeNote}>{TYPE_LABELS[entry.entry_type] || entry.entry_type}</span>
                      <span style={entry.level === "critical" ? s.badgeCritical : entry.level === "attention" ? s.badgeAttention : s.badgeInfo}>{LEVEL_LABELS[entry.level] || entry.level}</span>
                      <span style={resolved || !actionable ? s.badgeResolved : s.badgeOpen}>{resolved ? "Résolue" : actionable ? "Ouverte" : "Historique — sans action"}</span>
                    </div>
                    <h2 style={s.h2}>{entry.summary}</h2>
                    <p style={s.org}>{organisationName} · {formation?.title || "Formation non renseignée"}</p>
                    <p style={s.session}>{sessionLabel} · {formatSessionDates(session?.start_date, session?.end_date)}</p>
                  </div>
                  <span className={styles.date}>{formatDate(entry.occurred_at)}</span>
                </div>

                {entry.description ? <p style={s.text}>{entry.description}</p> : null}
                <div className={styles.metaGrid}>
                  <div><span>Auteur</span><strong>{entry.author_name || entry.author_role || "Non renseigné"}</strong></div>
                  <div><span>Apprenant lié</span><strong>{entry.enrolment_id ? "Oui" : "Non"}</strong></div>
                  <div><span>Action menée</span><strong>{entry.action_taken || "À renseigner"}</strong></div>
                  <div><span>Résolution</span><strong>{entry.resolved_at ? formatDate(entry.resolved_at) : resolved ? "Résolue" : "Ouverte"}</strong></div>
                </div>

                <div className={styles.actions}>
                  {session?.id && session.organisation_id === entry.organisation_id ? (
                    <Link href={`/agent/daily/session-dossiers/${session.id}`} className={styles.actionLink} style={s.secondary}>Ouvrir la session</Link>
                  ) : null}
                  <Link href={`/agent/daily/organisations/${entry.organisation_id}`} className={styles.actionLink} style={s.secondary}>Voir l’organisme</Link>
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
  filterPanel: { padding: 16, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 14 },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 },
  filterLabel: { display: "grid", gap: 6, fontSize: 12, fontWeight: 700 },
  filterInput: { width: "100%", minWidth: 0, minHeight: 38, padding: "8px 10px", border: "1px solid var(--selen-border)", borderRadius: 8, background: "var(--selen-bg)", color: "var(--selen-text)", fontSize: 13 },
  filterActions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 },
  filterButton: { minHeight: 38, padding: "8px 13px", border: 0, borderRadius: 8, background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 800, cursor: "pointer" },
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
