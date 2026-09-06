import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const PROCEDURE_LABELS: Record<string, string> = {
  learner_administration: "Parcours administratif apprenant",
  stakeholder_satisfaction: "Satisfaction des parties prenantes",
  absence_dropout: "Absences et abandons",
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

export default async function DailyInternalProceduresPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const admin = createSupabaseAdminClient();
  const dailyOrganisationIds = await getActiveDailyOrganisationIds();
  const proceduresRequest = dailyOrganisationIds.length
    ? admin
        .from("daily_internal_procedures")
        .select("id,organisation_id,procedure_type,title,purpose,steps,responsibilities,evidence,status,reviewed_at,updated_at")
        .in("organisation_id", dailyOrganisationIds)
        .order("updated_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });
  const organisationsRequest = dailyOrganisationIds.length
    ? admin
        .from("organisations")
        .select("id,name,legal_name,status")
        .in("id", dailyOrganisationIds)
    : Promise.resolve({ data: [], error: null });
  const [{ data: procedures, error: proceduresError }, { data: organisations, error: organisationsError }] = await Promise.all([
    proceduresRequest,
    organisationsRequest,
  ]);

  if (proceduresError || organisationsError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger les procédures internes Daily.</p></main>;
  }

  const organisationById = new Map((organisations ?? []).map((organisation) => [organisation.id, organisation]));
  const rows = (procedures ?? []).map((procedure) => ({
    procedure,
    organisation: organisationById.get(procedure.organisation_id),
    annualReviewDue: needsAnnualReview(procedure.reviewed_at, procedure.updated_at),
  }));
  const activeCount = rows.filter(({ procedure }) => procedure.status === "active").length;
  const draftCount = rows.filter(({ procedure }) => procedure.status === "draft").length;
  const annualReviewDueCount = rows.filter(({ annualReviewDue }) => annualReviewDue).length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Qualité</p>
          <h1 style={s.h1}>Procédures internes</h1>
          <p style={s.lead}>Vue de contrôle des procédures déjà stockées dans Daily. Elle sert d’aide-mémoire aux agents et conserve <code>daily_internal_procedures</code> comme unique source de vérité.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section style={s.stats} aria-label="État des procédures internes">
        <div style={s.stat}><strong>{rows.length}</strong><span>procédure(s)</span></div>
        <div style={s.stat}><strong>{activeCount}</strong><span>active(s)</span></div>
        <div style={draftCount ? s.statDue : s.stat}><strong>{draftCount}</strong><span>brouillon(s)</span></div>
        <div style={annualReviewDueCount ? s.statDue : s.stat}><strong>{annualReviewDueCount}</strong><span>revue annuelle à faire</span></div>
      </section>

      <section style={s.notice}>
        <strong>Règle documentaire</strong>
        <p style={s.muted}>Chaque procédure doit rester datée et vérifiée au moins une fois par an. Cette vue ne crée aucun doublon et ne modifie aucune procédure : elle signale seulement les brouillons et les revues annuelles à prévoir.</p>
      </section>

      {rows.length === 0 ? <section style={s.card}><p style={s.muted}>Aucune procédure interne enregistrée.</p></section> : (
        <section style={s.list}>
          {rows.map(({ procedure, organisation, annualReviewDue }) => {
            const organisationName = organisation?.legal_name || organisation?.name || "Organisme Daily";
            return (
              <article key={procedure.id} style={procedure.status === "active" && !annualReviewDue ? s.cardOk : s.cardDue}>
                <div style={s.rowHead}>
                  <div>
                    <p style={s.type}>{PROCEDURE_LABELS[procedure.procedure_type] || procedure.procedure_type}</p>
                    <h2 style={s.h2}>{procedure.title}</h2>
                    <p style={s.org}>{organisationName}</p>
                  </div>
                  <div style={s.statusBox}>
                    <span style={procedure.status === "active" ? s.statusOk : s.statusDue}>{procedure.status === "active" ? "Active" : "Brouillon"}</span>
                    {annualReviewDue ? <span style={s.reviewDue}>Revue annuelle à prévoir</span> : <span style={s.reviewOk}>Revue annuelle à jour</span>}
                  </div>
                </div>

                {procedure.purpose ? <p style={s.text}><strong>Objet :</strong> {procedure.purpose}</p> : null}
                <div style={s.metaGrid}>
                  <div><span>Dernière revue</span><strong>{formatDate(procedure.reviewed_at)}</strong></div>
                  <div><span>Dernière mise à jour</span><strong>{formatDate(procedure.updated_at)}</strong></div>
                </div>
                <Link href={`/agent/daily/organisations/${procedure.organisation_id}`} style={s.link}>Voir l’organisme →</Link>
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
