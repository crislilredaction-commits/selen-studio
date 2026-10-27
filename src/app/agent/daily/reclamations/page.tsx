import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { normalizeStakeholderFeedbackFilters, filterStakeholderFeedbackRows, countStakeholderFeedbackStages, stakeholderFeedbackStage } from "@/lib/daily/stakeholderFeedbackTriage.mjs";
import { stakeholderFeedbackOrganisationOptions, selectStakeholderFeedbackOrganisation } from "@/lib/daily/stakeholderFeedbackOrganisationScope.mjs";

const TYPE_LABELS: Record<string, string> = {
  complaint: "Réclamation",
  suggestion: "Suggestion",
};

const STAGE_LABELS: Record<string, string> = {
  review: "À examiner par Selen",
  forward: "À transmettre à l’organisme",
  response: "En attente de réponse organisme",
  close: "Réponse reçue · à clôturer",
  resolved: "Clôturée",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Reçue",
  reviewed: "Revue par Selen",
  reviewed_by_selen: "Revue par Selen",
  forwarded_to_organisation: "Transmise à l’organisme",
  resolved: "Résolue",
};

function formatDate(value?: string | null) {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isResolved(status?: string | null, resolvedAt?: string | null) {
  return status === "resolved" || Boolean(resolvedAt);
}

type Props = { searchParams?: Promise<{ q?: string | string[]; etape?: string | string[]; type?: string | string[]; organisme?: string | string[] }> };

export default async function DailyStakeholderFeedbackPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  let organisationIds: string[];
  try {
    organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main role="alert" style={s.page}>Impossible de vérifier votre périmètre Daily.</main>;
  }
  const admin = createSupabaseAdminClient();
  // Le sélecteur ne peut proposer que les organismes affectés à cet agent.
  const { data: organisations, error: organisationsError } = organisationIds.length
    ? await admin.from("organisations")
        .select("id,name,legal_name,status")
        .in("id", organisationIds)
        .neq("status", "archived")
    : { data: [], error: null };
  if (organisationsError) {
    return <main role="alert" style={s.page}>Impossible de charger les organismes Daily autorisés.</main>;
  }
  const organisationOptions: { id: string; name: string }[] =
    stakeholderFeedbackOrganisationOptions(organisations ?? [], organisationIds);
  const params = (await searchParams) ?? {};
  const selectedOrganisation = selectStakeholderFeedbackOrganisation(params.organisme, organisationOptions);
  if (selectedOrganisation === null) {
    return <main role="alert" style={s.page}>Organisme non autorisé dans votre périmètre Daily.</main>;
  }
  const scopedOrganisationIds = selectedOrganisation ? [selectedOrganisation] : organisationIds;

  // La lecture des retours est bornée côté base, avant tout tri, compteur ou affichage.
  const { data: feedback, error: feedbackError } = scopedOrganisationIds.length
    ? await admin.from("daily_stakeholder_feedback")
        .select("id,organisation_id,session_id,enrolment_id,submission_type,stakeholder_type,submitter_name,submitter_email,subject,message,status,selen_review_note,selen_reviewed_at,forwarded_at,organisation_response,resolved_at,created_at,updated_at")
        .in("organisation_id", scopedOrganisationIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (feedbackError) {
    return <main role="alert" style={s.page}>Impossible de charger les réclamations et suggestions Daily.</main>;
  }

  const organisationById = new Map((organisations ?? []).filter((organisation) => scopedOrganisationIds.includes(organisation.id)).map((organisation) => [organisation.id, organisation]));
  const rows = (feedback ?? []).map((item) => ({
    item,
    organisation: organisationById.get(item.organisation_id),
    resolved: isResolved(item.status, item.resolved_at),
  }));

  const complaintCount = rows.filter(({ item }) => item.submission_type === "complaint").length;
  const suggestionCount = rows.filter(({ item }) => item.submission_type === "suggestion").length;
  const openCount = rows.filter(({ resolved }) => !resolved).length;
  // Filtrage uniquement après la lecture bornée aux organismes affectés à l’agent.
  const filters = normalizeStakeholderFeedbackFilters(params);
  const visibleRows = filterStakeholderFeedbackRows(rows, filters) as typeof rows;
  const stageCounts = countStakeholderFeedbackStages(rows);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Qualité</p>
          <h1 style={s.h1}>Réclamations & suggestions</h1>
          <p style={s.lead}>Vue de contrôle des retours déjà enregistrés dans Daily. Elle conserve <code>daily_stakeholder_feedback</code> comme source unique et permet aux agents d’identifier rapidement les retours encore ouverts.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section style={s.stats} aria-label="État des réclamations et suggestions">
        <div style={s.stat}><strong>{rows.length}</strong><span>retour(s)</span></div>
        <div style={complaintCount ? s.statDue : s.stat}><strong>{complaintCount}</strong><span>réclamation(s)</span></div>
        <div style={s.stat}><strong>{suggestionCount}</strong><span>suggestion(s)</span></div>
        <div style={openCount ? s.statDue : s.stat}><strong>{openCount}</strong><span>encore ouvert(s)</span></div>
      </section>

      <form method="get" action="/agent/daily/reclamations" style={s.filterPanel} aria-label="Rechercher et prioriser les réclamations et suggestions">
        <div style={s.filterGrid}>
          <label style={s.filterLabel} htmlFor="feedback-organisation">
            Organisme
            <select id="feedback-organisation" name="organisme" defaultValue={selectedOrganisation} style={s.filterInput}>
              <option value="">Tous les organismes ({organisationOptions.length})</option>
              {organisationOptions.map((organisation) => (
                <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
              ))}
            </select>
          </label>
          <label style={s.filterLabel} htmlFor="feedback-search">
            Recherche
            <input id="feedback-search" name="q" type="search" maxLength={80} defaultValue={filters.q} placeholder="Organisme, sujet, déposant…" style={s.filterInput} />
          </label>
          <label style={s.filterLabel} htmlFor="feedback-stage">
            Prochaine étape
            <select id="feedback-stage" name="etape" defaultValue={filters.stage} style={s.filterInput}>
              <option value="all">Toutes ({stageCounts.all})</option>
              <option value="review">À examiner ({stageCounts.review})</option>
              <option value="forward">À transmettre ({stageCounts.forward})</option>
              <option value="response">Attente organisme ({stageCounts.response})</option>
              <option value="close">À clôturer ({stageCounts.close})</option>
              <option value="resolved">Clôturées ({stageCounts.resolved})</option>
            </select>
          </label>
          <label style={s.filterLabel} htmlFor="feedback-type">
            Nature
            <select id="feedback-type" name="type" defaultValue={filters.type} style={s.filterInput}>
              <option value="all">Réclamations et suggestions</option>
              <option value="complaint">Réclamations</option>
              <option value="suggestion">Suggestions</option>
            </select>
          </label>
        </div>
        <div style={s.filterActions}>
          <button type="submit" style={s.filterButton}>Appliquer les filtres</button>
          <Link href="/agent/daily/reclamations" style={s.secondary}>Réinitialiser</Link>
          <span role="status" style={s.muted}>{visibleRows.length} résultat(s) sur {rows.length} · étapes ouvertes en premier</span>
        </div>
      </form>

      <section style={s.notice}>
        <strong>Source de vérité conservée</strong>
        <p style={s.muted}>Cette vue n’ajoute ni table ni workflow parallèle. Elle expose les réclamations et suggestions déjà suivies par Daily, avec leur revue Selen, leur transmission éventuelle à l’organisme, sa réponse et leur résolution.</p>
      </section>

      {rows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucune réclamation ni suggestion enregistrée.</p></section>
      ) : visibleRows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucun retour ne correspond aux filtres. Modifiez la recherche ou réinitialisez les filtres.</p></section>
      ) : (
        <section style={s.list}>
          {visibleRows.map(({ item, organisation, resolved }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            const statusLabel = STATUS_LABELS[item.status] || item.status || "Statut inconnu";
            const stage = stakeholderFeedbackStage({ item });
            return (
              <article key={item.id} style={resolved ? s.cardOk : s.cardDue}>
                <div style={s.rowHead}>
                  <div>
                    <div style={s.badges}>
                      <span style={item.submission_type === "complaint" ? s.badgeComplaint : s.badgeSuggestion}>{TYPE_LABELS[item.submission_type] || item.submission_type}</span>
                      <span style={resolved ? s.badgeResolved : s.badgeOpen}>{statusLabel}</span>
                      <span style={resolved ? s.badgeResolved : s.badgeOpen}>{STAGE_LABELS[stage]}</span>
                    </div>
                    <h2 style={s.h2}>{item.subject}</h2>
                    <p style={s.org}>{organisationName} · {item.stakeholder_type || "partie prenante"}</p>
                  </div>
                  <span style={s.date}>{formatDate(item.created_at)}</span>
                </div>

                <p style={s.text}>{item.message}</p>
                <div style={s.metaGrid}>
                  <div><span>Déposant</span><strong>{item.submitter_name || "Non renseigné"}</strong></div>
                  <div><span>Revue Selen</span><strong>{item.selen_reviewed_at ? formatDate(item.selen_reviewed_at) : "À faire"}</strong></div>
                  <div><span>Transmission organisme</span><strong>{item.forwarded_at ? formatDate(item.forwarded_at) : "Non transmise"}</strong></div>
                  <div><span>Résolution</span><strong>{item.resolved_at ? formatDate(item.resolved_at) : resolved ? "Résolue" : "Ouverte"}</strong></div>
                </div>

                {item.selen_review_note ? <p style={s.note}><strong>Note Selen :</strong> {item.selen_review_note}</p> : null}
                {item.organisation_response ? <p style={s.note}><strong>Réponse organisme :</strong> {item.organisation_response}</p> : null}

                <div style={s.actions}>
                  <Link href={`/agent/daily/organisations/${item.organisation_id}`} style={s.secondary}>Voir l’organisme</Link>
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
  statDue: { display: "grid", gap: 3, padding: 14, border: "1px solid rgba(180,78,70,.35)", borderRadius: 12, background: "rgba(180,78,70,.08)" },
  notice: { padding: 15, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 14 },
  filterPanel: { padding: 15, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 14 },
  filterGrid: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" },
  filterLabel: { display: "grid", gap: 6, flex: "1 1 180px", fontSize: 12, fontWeight: 700 },
  filterInput: { width: "100%", minHeight: 38, padding: "8px 10px", border: "1px solid var(--selen-border)", borderRadius: 9, background: "var(--selen-bg)", color: "var(--selen-text)" },
  filterActions: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 12 },
  filterButton: { minHeight: 38, padding: "0 14px", border: 0, borderRadius: 9, background: "var(--selen-gold2)", color: "var(--selen-bg)", fontWeight: 800, cursor: "pointer" },
  list: { display: "grid", gap: 12 },
  card: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardOk: { padding: 18, border: "1px solid var(--selen-border)", borderRadius: 14, background: "var(--selen-bg2)" },
  cardDue: { padding: 18, border: "1px solid rgba(180,78,70,.28)", borderRadius: 14, background: "rgba(180,78,70,.045)" },
  rowHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start" },
  badges: { display: "flex", gap: 7, flexWrap: "wrap" },
  badgeComplaint: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(180,78,70,.14)", color: "var(--selen-danger)", fontSize: 11, fontWeight: 800 },
  badgeSuggestion: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(83,132,166,.12)", color: "var(--selen-info)", fontSize: 11, fontWeight: 800 },
  badgeOpen: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(201,148,58,.14)", color: "var(--selen-gold2)", fontSize: 11, fontWeight: 800 },
  badgeResolved: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "rgba(75,140,100,.12)", color: "var(--selen-success)", fontSize: 11, fontWeight: 800 },
  org: { margin: 0, color: "var(--selen-text3)", fontSize: 12 },
  date: { fontSize: 11, color: "var(--selen-text3)", whiteSpace: "nowrap" },
  text: { margin: "14px 0", lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13, whiteSpace: "pre-wrap" },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginTop: 12 },
  note: { margin: "12px 0 0", padding: 11, borderRadius: 10, background: "var(--selen-bg)", color: "var(--selen-text2)", lineHeight: 1.55, fontSize: 12 },
  actions: { display: "flex", gap: 9, marginTop: 14 },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 11px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  muted: { margin: "6px 0 0", lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 },
  error: { color: "var(--selen-danger)" },
};
