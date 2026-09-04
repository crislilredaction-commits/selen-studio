import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

function formatDate(value?: string | null) {
  if (!value) return "Non renseignée";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date invalide";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
}

export default async function DailyTrainerAnnualReviewsPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}><p>Accès refusé.</p></main>;

  const year = new Date().getFullYear();
  const admin = createSupabaseAdminClient();
  const [{ data: trainers, error: trainersError }, { data: reviews, error: reviewsError }] = await Promise.all([
    admin
      .from("daily_trainer_profiles")
      .select("id,display_name,professional_email,engagement_type,status,active")
      .eq("active", true)
      .neq("status", "archived")
      .order("display_name"),
    admin
      .from("daily_trainer_annual_reviews")
      .select("id,trainer_profile_id,review_year,status,submitted_at,manager_completed_at,updated_at")
      .eq("review_year", year),
  ]);

  if (trainersError || reviewsError) {
    return <main style={s.page}><p style={s.error}>Impossible de charger les bilans annuels formateurs.</p></main>;
  }

  const reviewByTrainer = new Map((reviews ?? []).map((review) => [review.trainer_profile_id, review]));
  const rows = (trainers ?? []).map((trainer) => ({ trainer, review: reviewByTrainer.get(trainer.id) ?? null }));
  const fullyCompleted = rows.filter(({ review }) => Boolean(review?.submitted_at && review?.manager_completed_at)).length;
  const awaitingManager = rows.filter(({ review }) => Boolean(review?.submitted_at && !review?.manager_completed_at)).length;
  const toStart = rows.filter(({ review }) => !review?.submitted_at).length;

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>Selen Daily · Qualité</p>
          <h1 style={s.h1}>Bilan annuel des compétences formateurs</h1>
          <p style={s.lead}>Vue de contrôle pour {year}. Elle réutilise les profils et bilans annuels existants, sans créer de second suivi. Le bilan n'est considéré comme terminé qu'après la contribution du formateur et la partie manager.</p>
        </div>
        <Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link>
      </header>

      <section style={s.stats} aria-label="État des bilans annuels">
        <div style={s.stat}><strong>{rows.length}</strong><span>formateur(s) actif(s)</span></div>
        <div style={s.stat}><strong>{fullyCompleted}</strong><span>bilan(s) terminé(s)</span></div>
        <div style={awaitingManager ? s.statDue : s.stat}><strong>{awaitingManager}</strong><span>à compléter côté manager</span></div>
        <div style={toStart ? s.statDue : s.stat}><strong>{toStart}</strong><span>à faire / soumettre</span></div>
      </section>

      <section style={s.card}>
        <div style={s.cardHead}>
          <div>
            <h2 style={s.h2}>Suivi {year}</h2>
            <p style={s.muted}>Cette vue sert d'aide-mémoire aux agents. Les données restent celles de <code>daily_trainer_profiles</code> et <code>daily_trainer_annual_reviews</code>.</p>
          </div>
        </div>

        {rows.length === 0 ? <p style={s.muted}>Aucun formateur actif à suivre.</p> : (
          <div style={s.list}>
            {rows.map(({ trainer, review }) => {
              const complete = Boolean(review?.submitted_at && review?.manager_completed_at);
              const managerDue = Boolean(review?.submitted_at && !review?.manager_completed_at);
              const label = complete ? "Terminé" : managerDue ? "Manager à compléter" : "À faire / soumettre";
              return (
                <article key={trainer.id} style={complete ? s.rowOk : s.rowDue}>
                  <div>
                    <strong>{trainer.display_name || trainer.professional_email || "Formateur sans nom affiché"}</strong>
                    <p style={s.meta}>{trainer.professional_email || "Email non renseigné"} · {trainer.engagement_type === "subcontractor" ? "Sous-traitant" : "Formateur"}</p>
                  </div>
                  <div style={s.statusBox}>
                    <span style={complete ? s.statusOk : s.statusDue}>{label}</span>
                    <small style={s.date}>Soumis : {formatDate(review?.submitted_at)}</small>
                    <small style={s.date}>Partie manager : {formatDate(review?.manager_completed_at)}</small>
                    <small style={s.date}>Dernière activité : {formatDate(review?.updated_at)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-start", marginBottom: 20 },
  eyebrow: { margin: 0, fontSize: 10, fontWeight: 800, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--selen-gold2)" },
  h1: { margin: "6px 0", fontFamily: "var(--font-display)", fontSize: 30 },
  h2: { margin: 0, fontFamily: "var(--font-display)", fontSize: 22 },
  lead: { margin: 0, maxWidth: 760, lineHeight: 1.65, color: "var(--selen-text2)", fontSize: 13 },
  back: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", marginTop: 8 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginBottom: 16 },
  stat: { display: "grid", gap: 4, border: "1px solid var(--selen-border)", borderRadius: 10, padding: 14, background: "var(--selen-bg2)", fontSize: 12, color: "var(--selen-text2)" },
  statDue: { display: "grid", gap: 4, border: "1px solid rgba(201,148,58,.45)", borderRadius: 10, padding: 14, background: "rgba(201,148,58,.08)", fontSize: 12, color: "var(--selen-text2)" },
  card: { border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", padding: 18 },
  cardHead: { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 },
  muted: { margin: "5px 0 0", color: "var(--selen-text2)", fontSize: 12, lineHeight: 1.6 },
  list: { display: "grid", gap: 9 },
  rowOk: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(250px,auto)", gap: 14, padding: 14, border: "1px solid rgba(74,150,104,.32)", borderRadius: 9, background: "rgba(74,150,104,.06)" },
  rowDue: { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(250px,auto)", gap: 14, padding: 14, border: "1px solid rgba(201,148,58,.38)", borderRadius: 9, background: "rgba(201,148,58,.06)" },
  meta: { margin: "5px 0 0", color: "var(--selen-text3)", fontSize: 11 },
  statusBox: { display: "grid", justifyItems: "end", gap: 3 },
  statusOk: { fontSize: 11, fontWeight: 800, color: "var(--selen-success)" },
  statusDue: { fontSize: 11, fontWeight: 800, color: "var(--selen-gold2)" },
  date: { color: "var(--selen-text3)", fontSize: 10 },
  error: { color: "var(--selen-danger)" },
};
