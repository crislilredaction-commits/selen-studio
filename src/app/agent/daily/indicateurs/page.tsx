import Link from "next/link";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

function percent(value: number, total: number) {
  if (!total) return "—";
  return `${Math.round((value / total) * 100)} %`;
}

function average(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return "—";
  return `${(usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(1)} / 5`;
}

export default async function DailyTrainingIndicatorsPage() {
  const admin = createSupabaseAdminClient();
  const organisationIds = await getActiveDailyOrganisationIds();

  const [organisationsResult, sessionsResult, enrolmentsResult, attendanceResult, assessmentsResult, learnerFeedbackResult, stakeholderFeedbackResult] = organisationIds.length
    ? await Promise.all([
        admin.from("organisations").select("id,name,legal_name").in("id", organisationIds).order("name"),
        admin.from("daily_sessions").select("id,organisation_id,status").in("organisation_id", organisationIds),
        admin.from("daily_session_enrolments").select("id,organisation_id,status").in("organisation_id", organisationIds),
        admin.from("daily_attendance_records").select("id,organisation_id,status").in("organisation_id", organisationIds),
        admin.from("daily_learning_assessments").select("id,organisation_id,outcome").in("organisation_id", organisationIds),
        admin.from("daily_learner_feedback_responses").select("id,organisation_id,overall_rating,would_recommend").in("organisation_id", organisationIds),
        admin.from("daily_stakeholder_satisfaction_responses").select("id,organisation_id,overall_rating,would_recommend").in("organisation_id", organisationIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const error = [organisationsResult, sessionsResult, enrolmentsResult, attendanceResult, assessmentsResult, learnerFeedbackResult, stakeholderFeedbackResult]
    .map((result) => result.error)
    .find(Boolean);

  if (error) {
    return <main style={s.page}><p style={s.error}>Impossible de charger les indicateurs formation : {error.message}</p></main>;
  }

  const organisations = organisationsResult.data ?? [];
  const sessions = sessionsResult.data ?? [];
  const enrolments = enrolmentsResult.data ?? [];
  const attendance = attendanceResult.data ?? [];
  const assessments = assessmentsResult.data ?? [];
  const learnerFeedback = learnerFeedbackResult.data ?? [];
  const stakeholderFeedback = stakeholderFeedbackResult.data ?? [];

  const decidedAttendance = attendance.filter((row) => row.status !== "pending");
  const presentAttendance = decidedAttendance.filter((row) => row.status === "present");
  const assessed = assessments.filter((row) => !["pending", "not_applicable"].includes(row.outcome));
  const achieved = assessed.filter((row) => row.outcome === "achieved");
  const completedEnrolments = enrolments.filter((row) => row.status === "completed");
  const abandonedEnrolments = enrolments.filter((row) => row.status === "abandoned");
  const recommendationAnswers = [...learnerFeedback, ...stakeholderFeedback].filter((row) => typeof row.would_recommend === "boolean");
  const recommendations = recommendationAnswers.filter((row) => row.would_recommend === true);

  return (
    <main style={s.page}>
      <header style={s.header}>
        <div>
          <p style={s.kicker}>Selen Studio · Daily</p>
          <h1 style={s.h1}>Indicateurs formation</h1>
          <p style={s.muted}>Vue consolidée calculée directement depuis les sessions, inscriptions, présences, évaluations et réponses de satisfaction des seuls organismes Daily actifs.</p>
        </div>
        <Link href="/agent/daily" style={s.secondary}>← Pilotage Daily</Link>
      </header>

      <section style={s.metrics} aria-label="Indicateurs consolidés">
        <article style={s.card}><span style={s.label}>Sessions</span><strong style={s.value}>{sessions.length}</strong><small style={s.hint}>sessions Daily actives dans le périmètre</small></article>
        <article style={s.card}><span style={s.label}>Inscriptions terminées</span><strong style={s.value}>{completedEnrolments.length}</strong><small style={s.hint}>{enrolments.length} inscription(s) au total · {abandonedEnrolments.length} abandon(s)</small></article>
        <article style={s.card}><span style={s.label}>Présence constatée</span><strong style={s.value}>{percent(presentAttendance.length, decidedAttendance.length)}</strong><small style={s.hint}>{presentAttendance.length} présence(s) sur {decidedAttendance.length} relevé(s) finalisé(s)</small></article>
        <article style={s.card}><span style={s.label}>Objectifs atteints</span><strong style={s.value}>{percent(achieved.length, assessed.length)}</strong><small style={s.hint}>{achieved.length} évaluation(s) atteinte(s) sur {assessed.length} décision(s)</small></article>
        <article style={s.card}><span style={s.label}>Satisfaction globale</span><strong style={s.value}>{average([...learnerFeedback.map((row) => row.overall_rating), ...stakeholderFeedback.map((row) => row.overall_rating)])}</strong><small style={s.hint}>{learnerFeedback.length + stakeholderFeedback.length} réponse(s) consolidée(s)</small></article>
        <article style={s.card}><span style={s.label}>Recommandation</span><strong style={s.value}>{percent(recommendations.length, recommendationAnswers.length)}</strong><small style={s.hint}>{recommendations.length} oui sur {recommendationAnswers.length} réponse(s)</small></article>
      </section>

      <section style={s.tableCard}>
        <div style={s.sectionHead}>
          <div>
            <h2 style={s.h2}>Lecture par organisme</h2>
            <p style={s.muted}>Les chiffres restent dérivés des sources opérationnelles. Aucun stockage parallèle d’indicateurs n’est créé.</p>
          </div>
          <span style={s.scope}>{organisations.length} organisme(s) Daily actif(s)</span>
        </div>

        {organisations.length === 0 ? (
          <p style={s.empty}>Aucun organisme Daily actif à analyser pour le moment.</p>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Organisme</th>
                  <th style={s.th}>Sessions</th>
                  <th style={s.th}>Inscriptions</th>
                  <th style={s.th}>Présence</th>
                  <th style={s.th}>Objectifs atteints</th>
                  <th style={s.th}>Satisfaction</th>
                </tr>
              </thead>
              <tbody>
                {organisations.map((organisation) => {
                  const orgSessions = sessions.filter((row) => row.organisation_id === organisation.id);
                  const orgEnrolments = enrolments.filter((row) => row.organisation_id === organisation.id);
                  const orgAttendance = attendance.filter((row) => row.organisation_id === organisation.id && row.status !== "pending");
                  const orgPresent = orgAttendance.filter((row) => row.status === "present");
                  const orgAssessments = assessments.filter((row) => row.organisation_id === organisation.id && !["pending", "not_applicable"].includes(row.outcome));
                  const orgAchieved = orgAssessments.filter((row) => row.outcome === "achieved");
                  const orgRatings = [
                    ...learnerFeedback.filter((row) => row.organisation_id === organisation.id).map((row) => row.overall_rating),
                    ...stakeholderFeedback.filter((row) => row.organisation_id === organisation.id).map((row) => row.overall_rating),
                  ];

                  return (
                    <tr key={organisation.id}>
                      <td style={s.td}><Link href={`/agent/daily/organisations/${organisation.id}`} style={s.link}>{organisation.legal_name || organisation.name || organisation.id}</Link></td>
                      <td style={s.td}>{orgSessions.length}</td>
                      <td style={s.td}>{orgEnrolments.length}</td>
                      <td style={s.td}>{percent(orgPresent.length, orgAttendance.length)}</td>
                      <td style={s.td}>{percent(orgAchieved.length, orgAssessments.length)}</td>
                      <td style={s.td}>{average(orgRatings)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1180, margin: "0 auto", padding: "24px 28px 60px", color: "var(--selen-text)" },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 22 },
  kicker: { margin: 0, fontSize: 10, textTransform: "uppercase", letterSpacing: ".2em", color: "var(--selen-gold2)", fontWeight: 800 },
  h1: { margin: "6px 0", fontFamily: "var(--font-display)", fontSize: 32 },
  h2: { margin: "0 0 4px", fontFamily: "var(--font-display)", fontSize: 22 },
  muted: { margin: 0, color: "var(--selen-text2)", lineHeight: 1.6, fontSize: 13, maxWidth: 760 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 20 },
  card: { display: "grid", gap: 5, border: "1px solid var(--selen-border)", borderRadius: "var(--radius-md)", background: "var(--selen-bg2)", padding: 16 },
  label: { color: "var(--selen-text2)", fontSize: 12, fontWeight: 700 },
  value: { fontSize: 27, fontFamily: "var(--font-display)" },
  hint: { color: "var(--selen-text3)", lineHeight: 1.45 },
  tableCard: { border: "1px solid var(--selen-border)", borderRadius: "var(--radius-md)", background: "var(--selen-bg2)", padding: 18 },
  sectionHead: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 14 },
  scope: { whiteSpace: "nowrap", border: "1px solid var(--selen-border)", borderRadius: 999, padding: "6px 9px", color: "var(--selen-text2)", fontSize: 11 },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 9px", borderBottom: "1px solid var(--selen-border)", color: "var(--selen-text2)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" },
  td: { padding: "11px 9px", borderBottom: "1px solid var(--selen-border)" },
  link: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 800 },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 38, padding: "0 13px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 13 },
  empty: { margin: "16px 0 0", color: "var(--selen-text2)" },
  error: { color: "var(--selen-danger)" },
};
