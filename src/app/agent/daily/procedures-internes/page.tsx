import Link from "next/link";
import styles from "./procedures-mobile.module.css";
import { filterAndPrioritizeProcedures, normalizeProcedureQuery, normalizeProcedureView, procedureOrganisationOptions, selectProcedureOrganisation } from "@/lib/daily/internalProceduresTriage.mjs";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const PROCEDURE_LABELS: Record<string, string> = {
  learner_administration: "Parcours administratif apprenant",
  stakeholder_satisfaction: "Satisfaction des parties prenantes",
  absence_dropout: "Absences et abandons",
  difficulties_hazards: "Prévention des difficultés et aléas",
};

function formatDate(value?: string | null) {
  if (!value) return "Jamais revue";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

function needsAnnualReview(reviewedAt?: string | null, updatedAt?: string | null) {
  const reference = reviewedAt || updatedAt;
  if (!reference) return true;
  const timestamp = new Date(reference).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return timestamp < Date.now() - 365 * 24 * 60 * 60 * 1000;
}

type Props = { searchParams?: Promise<{ q?: string | string[]; vue?: string | string[]; organisme?: string | string[] }> };

export default async function DailyInternalProceduresPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  let dailyOrganisationIds: string[];
  try {
    dailyOrganisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main style={s.page}><p style={s.error}>Impossible de vérifier votre périmètre Daily.</p></main>;
  }
  if (dailyOrganisationIds.length === 0) {
    return <main style={s.page}><h1 style={s.h1}>Procédures internes</h1><p>Aucun organisme Daily affecté.</p></main>;
  }

  const admin = createSupabaseAdminClient();
  const { data: organisations, error: organisationsError } = await admin
    .from("organisations")
    .select("id,name,legal_name,status")
    .in("id", dailyOrganisationIds)
    .neq("status", "archived");
  if (organisationsError) {
    return <main role="alert" style={s.page}><p style={s.error}>Impossible de charger les organismes Daily autorisés.</p></main>;
  }
  const organisationOptions = procedureOrganisationOptions(organisations ?? [], dailyOrganisationIds);
  const params = await searchParams;
  const selectedOrganisation = selectProcedureOrganisation(params?.organisme, organisationOptions);
  if (selectedOrganisation === null) {
    return <main role="alert" style={s.page}><p style={s.error}>Organisme non autorisé dans votre périmètre Daily.</p></main>;
  }
  const scopedOrganisationIds = selectedOrganisation ? [selectedOrganisation] : organisationOptions.map((option) => option.id);
  // Le périmètre choisi est appliqué à la requête avant le calcul des compteurs.
  const { data: procedures, error: proceduresError } = scopedOrganisationIds.length
    ? await admin.from("daily_internal_procedures")
        .select("id,organisation_id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
        .in("organisation_id", scopedOrganisationIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (proceduresError) {
    return <main role="alert" style={s.page}><p style={s.error}>Impossible de charger les procédures internes Daily.</p></main>;
  }

  const organisationById = new Map((organisations ?? []).map((organisation) => [organisation.id, organisation]));
  const rows = (procedures ?? []).map((procedure) => ({
    procedure: { ...procedure, internalTypeLabel: PROCEDURE_LABELS[procedure.procedure_type] || procedure.procedure_type },
    organisation: organisationById.get(procedure.organisation_id),
    annualReviewDue: needsAnnualReview(procedure.reviewed_at, procedure.updated_at),
  }));
  const activeCount = rows.filter(({ procedure }) => procedure.status === "active").length;
  const draftCount = rows.filter(({ procedure }) => procedure.status === "draft").length;
  const annualReviewDueCount = rows.filter(({ annualReviewDue }) => annualReviewDue).length;
  const query = normalizeProcedureQuery(params?.q);
  const view = normalizeProcedureView(params?.vue);
  // Les filtres et le tri ne portent que sur les lignes déjà bornées aux affectations.
  const visibleRows = filterAndPrioritizeProcedures(rows, query, view) as typeof rows;
  const viewHref = (nextView: "all" | "due" | "draft" | "active", includeQuery = true) => {
    const search = new URLSearchParams();
    if (query && includeQuery) search.set("q", query);
    if (selectedOrganisation) search.set("organisme", selectedOrganisation);
    if (nextView !== "all") search.set("vue", nextView);
    return search.size ? `/agent/daily/procedures-internes?${search.toString()}` : "/agent/daily/procedures-internes";
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Qualité</p>
          <h1 style={s.h1}>Procédures internes</h1>
          <p style={s.lead}>Vue de contrôle des procédures déjà stockées dans Daily. Elle sert d’aide-mémoire aux agents et conserve <code>daily_internal_procedures</code> comme unique source de vérité.</p>
        </div>
        <Link href="/agent/daily" className={styles.backLink}>← Pilotage Daily</Link>
      </header>

      <section className={styles.stats} aria-label="État des procédures internes">
        <div className={styles.stat}><strong>{rows.length}</strong><span>procédure(s)</span></div>
        <div className={styles.stat}><strong>{activeCount}</strong><span>active(s)</span></div>
        <div className={draftCount ? styles.statDue : styles.stat}><strong>{draftCount}</strong><span>brouillon(s)</span></div>
        <div className={annualReviewDueCount ? styles.statDue : styles.stat}><strong>{annualReviewDueCount}</strong><span>revue annuelle à faire</span></div>
      </section>

      <section style={s.notice}>
        <strong>Règle documentaire</strong>
        <p style={s.muted}>Chaque procédure doit rester datée et vérifiée au moins une fois par an. Cette vue ne crée aucun doublon et ne modifie aucune procédure : elle signale seulement les brouillons et les revues annuelles à prévoir.</p>
      </section>

      <section style={s.notice} aria-label="Choisir un organisme Daily">
        <form method="get" action="/agent/daily/procedures-internes" className={styles.filterForm}>
          {query ? <input type="hidden" name="q" value={query} /> : null}
          {view !== "all" ? <input type="hidden" name="vue" value={view} /> : null}
          <label htmlFor="procedures-organisme" style={{ flex: "1 1 260px", fontSize: 12, fontWeight: 700 }}>
            Organisme
            <select id="procedures-organisme" name="organisme" defaultValue={selectedOrganisation} style={{ display: "block", width: "100%", marginTop: 6, minHeight: 40, padding: "8px 11px", border: "1px solid var(--selen-border)", borderRadius: 9, background: "var(--selen-bg3)", color: "var(--selen-text)" }}>
              <option value="">Tous les organismes ({organisationOptions.length})</option>
              {organisationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <button type="submit" className={styles.submitButton}>Appliquer</button>
          <Link href="/agent/daily/procedures-internes" className={styles.resetLink}>Réinitialiser</Link>
        </form>
      </section>

      <section style={s.notice} aria-label="Rechercher et prioriser les procédures">
        <form action="/agent/daily/procedures-internes" method="get" role="search" className={styles.filterForm}>
          {view !== "all" ? <input type="hidden" name="vue" value={view} /> : null}
          {selectedOrganisation ? <input type="hidden" name="organisme" value={selectedOrganisation} /> : null}
          <label htmlFor="procedures-search" style={{ flex: "1 1 260px", fontSize: 12, fontWeight: 700 }}>
            Rechercher un organisme, une procédure ou un objet
            <input id="procedures-search" type="search" name="q" maxLength={80} defaultValue={query} placeholder="Organisme, titre, objet…" style={{ display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, minHeight: 40, padding: "8px 11px", border: "1px solid var(--selen-border)", borderRadius: 9, background: "var(--selen-bg3)", color: "var(--selen-text)" }} />
          </label>
          <button type="submit" className={styles.submitButton}>Rechercher</button>
          {query ? <Link href={viewHref(view, false)} className={styles.resetLink}>Effacer</Link> : null}
        </form>
        <nav aria-label="Filtrer les procédures par priorité" className={styles.priorityNav}>
          {([
            { key: "all", label: "Toutes", count: rows.length },
            { key: "due", label: "Revue à prévoir", count: annualReviewDueCount },
            { key: "draft", label: "Brouillons", count: draftCount },
            { key: "active", label: "Actives", count: activeCount },
          ] as const).map((item) => (
            <Link key={item.key} href={viewHref(item.key)} aria-current={view === item.key ? "page" : undefined} className={styles.priorityLink} style={{ border: "1px solid var(--selen-border)", borderRadius: 999, padding: "7px 12px", textDecoration: "none", fontSize: 12, fontWeight: 700, background: view === item.key ? "var(--selen-gold2)" : "var(--selen-bg3)", color: view === item.key ? "var(--selen-bg)" : "var(--selen-text)" }}>
              {item.label} ({item.count})
            </Link>
          ))}
        </nav>
        <p role="status" style={s.muted}>{visibleRows.length} procédure{visibleRows.length > 1 ? "s" : ""} affichée{visibleRows.length > 1 ? "s" : ""}. Les revues annuelles à prévoir apparaissent en premier.</p>
      </section>

      {rows.length === 0 ? <section style={s.card}><p style={s.muted}>Aucune procédure interne enregistrée.</p></section> : visibleRows.length === 0 ? (
        <section style={s.card}><p style={s.muted}>Aucune procédure ne correspond à ces filtres.</p><Link href="/agent/daily/procedures-internes" style={s.link}>Afficher toutes les procédures</Link></section>
      ) : (
        <section className={styles.list}>
          {visibleRows.map(({ procedure, organisation, annualReviewDue }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            return (
              <article key={procedure.id} className={procedure.status === "active" && !annualReviewDue ? styles.cardOk : styles.cardDue}>
                <div className={styles.rowHead}>
                  <div>
                    <p style={s.type}>{PROCEDURE_LABELS[procedure.procedure_type] || procedure.procedure_type}</p>
                    <h2 style={s.h2}>{procedure.title}</h2>
                    <p style={s.org}>{organisationName}</p>
                  </div>
                  <div className={styles.statusBox}>
                    <span style={procedure.status === "active" ? s.statusOk : s.statusDue}>{procedure.status === "active" ? "Active" : "Brouillon"}</span>
                    {annualReviewDue ? <span style={s.reviewDue}>Revue annuelle à prévoir</span> : <span style={s.reviewOk}>Revue annuelle à jour</span>}
                  </div>
                </div>

                {procedure.purpose ? <p style={s.text}><strong>Objet :</strong> {procedure.purpose}</p> : null}
                <div className={styles.metaGrid}>
                  <div><span>Dernière revue</span><strong>{formatDate(procedure.reviewed_at)}</strong></div>
                  <div><span>Dernière mise à jour</span><strong>{formatDate(procedure.updated_at)}</strong></div>
                </div>
                <Link href={`/agent/daily/organisations/${procedure.organisation_id}`} className={styles.organisationLink}>Voir l’organisme →</Link>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 20 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0", fontFamily: "var(--font-display)", fontSize: 30 },
  h2: { margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: 20 },
  lead: { margin: 0, maxWidth: 760, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 13 },
  back: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", marginTop: 8 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 14 },
  stat: { display: "grid", gap: 4, border: "1px solid var(--selen-border)", borderRadius: 10, padding: 14, background: "var(--selen-bg2)", fontSize: 12, color: "var(--selen-text2)" },
  statDue: { display: "grid", gap: 4, border: "1px solid rgba(201,148,58,.45)", borderRadius: 10, padding: 14, background: "rgba(201,148,58,.08)", fontSize: 12, color: "var(--selen-text2)" },
  notice: { border: "1px solid var(--selen-border)", borderRadius: 10, padding: 14, background: "var(--selen-bg2)", marginBottom: 14 },
  muted: { margin: "5px 0 0", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.6 },
  list: { display: "grid", gap: 10 },
  card: { border: "1px solid var(--selen-border)", borderRadius: 12, padding: 16, background: "var(--selen-bg2)" },
  cardOk: { border: "1px solid rgba(74,150,104,.34)", borderRadius: 12, padding: 16, background: "rgba(74,150,104,.05)" },
  cardDue: { border: "1px solid rgba(201,148,58,.4)", borderRadius: 12, padding: 16, background: "rgba(201,148,58,.05)" },
  rowHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" },
  type: { margin: 0, color: "var(--selen-gold2)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" },
  org: { margin: "5px 0 0", color: "var(--selen-text3)", fontSize: 12 },
  statusBox: { display: "grid", justifyItems: "end", gap: 4 },
  statusOk: { fontSize: 11, fontWeight: 800, color: "var(--selen-success)" },
  statusDue: { fontSize: 11, fontWeight: 800, color: "var(--selen-gold2)" },
  reviewDue: { fontSize: 10, fontWeight: 700, color: "var(--selen-danger)" },
  reviewOk: { fontSize: 10, fontWeight: 700, color: "var(--selen-success)" },
  text: { margin: "12px 0 0", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.55 },
  metaGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8, marginTop: 12 },
  link: { display: "inline-block", marginTop: 12, color: "var(--selen-gold2)", fontWeight: 800, fontSize: 12, textDecoration: "none" },
  error: { color: "var(--selen-danger)" },
};
