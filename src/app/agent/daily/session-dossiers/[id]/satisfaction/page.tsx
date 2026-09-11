import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = { params: Promise<{ id: string }> };
type Learner = { id?: string; email?: string | null; first_name?: string | null; last_name?: string | null };
type Enrolment = { id: string; daily_learners?: Learner | Learner[] | null };
type LearnerFeedback = {
  enrolment_id: string;
  overall_rating: number;
  objectives_rating: number;
  trainer_rating: number | null;
  organisation_rating: number | null;
  content_rating: number | null;
  pace_rating: number | null;
  would_recommend: boolean | null;
  strengths: string | null;
  improvements: string | null;
  adaptation_feedback: string | null;
  free_comment: string | null;
  submitted_at: string;
};

type AssessmentState = { enrolment_id: string; outcome?: string | null; method?: string | null; assessed_at?: string | null };
type AssessmentResponse = { enrolment_id: string; submitted_at: string | null };

const stakeholderLabels: Record<string, string> = { enterprise: "Commanditaire", trainer: "Formateur" };
const rating = (value: number | null) => value == null ? "–" : `${value}/5`;

function learnerOf(enrolment: Enrolment) {
  return Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
}

function learnerName(enrolment: Enrolment) {
  const learner = learnerOf(enrolment);
  return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
}

export default async function StakeholderSatisfactionPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const [sessionRes, stakeholderRes, enrolmentRes, learnerFeedbackRes, assessmentRes, responseRes] = await Promise.all([
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date").eq("id", id).maybeSingle(),
    admin.from("daily_stakeholder_satisfaction_responses").select("id,stakeholder_type,entity_name,entity_email,overall_rating,objectives_rating,trainer_rating,organisation_rating,would_recommend,strengths,improvements,free_comment,submitted_at").eq("session_id", id).order("submitted_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("id,daily_learners(id,email,first_name,last_name)").eq("session_id", id).not("status", "in", "(declined,cancelled,abandoned)"),
    admin.from("daily_learner_feedback_responses").select("enrolment_id,overall_rating,objectives_rating,trainer_rating,organisation_rating,content_rating,pace_rating,would_recommend,strengths,improvements,adaptation_feedback,free_comment,submitted_at").eq("session_id", id),
    admin.from("daily_learning_assessments").select("enrolment_id,outcome,method,assessed_at").eq("session_id", id),
    admin.from("daily_learning_assessment_responses").select("enrolment_id,submitted_at").eq("session_id", id),
  ]);

  const session = sessionRes.data;
  if (!session) return <main style={{ padding: 28 }}>Session introuvable.</main>;
  const error = stakeholderRes.error ?? enrolmentRes.error ?? learnerFeedbackRes.error ?? assessmentRes.error ?? responseRes.error;
  if (error) throw new Error(error.message);

  const [{ data: organisation }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title,learning_assessment_mode").eq("id", session.formation_id).maybeSingle(),
  ]);

  const stakeholders = stakeholderRes.data ?? [];
  const enrolments = (enrolmentRes.data ?? []) as Enrolment[];
  const learnerFeedback = (learnerFeedbackRes.data ?? []) as LearnerFeedback[];
  const assessments = (assessmentRes.data ?? []) as AssessmentState[];
  const assessmentResponses = (responseRes.data ?? []) as AssessmentResponse[];
  const feedbackByEnrolment = new Map(learnerFeedback.map((row) => [row.enrolment_id, row]));
  const assessmentByEnrolment = new Map(assessments.map((row) => [row.enrolment_id, row]));
  const responseByEnrolment = new Map(assessmentResponses.map((row) => [row.enrolment_id, row]));

  const enterpriseCount = stakeholders.filter((item) => item.stakeholder_type === "enterprise").length;
  const trainerCount = stakeholders.filter((item) => item.stakeholder_type === "trainer").length;
  const learnerDone = learnerFeedback.length;
  const learnerAssessmentDone = enrolments.filter((row) => assessmentByEnrolment.has(row.id) || responseByEnrolment.has(row.id)).length;

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: 28 }}>
      <Link href={`/agent/daily/session-dossiers/${id}`} style={{ color: "var(--selen-text2)" }}>← Retour au dossier de session</Link>
      <h1 style={{ marginBottom: 4 }}>Évaluation et satisfaction de fin de formation</h1>
      <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
        {formation?.title ?? "Formation"} · {organisation?.name ?? "Organisme"} · {session.internal_reference || "Sans référence"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "18px 0" }}>
        <SelenCard><SelenCardTitle>Apprenants</SelenCardTitle><strong style={{ fontSize: 26 }}>{enrolments.length}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Évaluations tracées</SelenCardTitle><strong style={{ fontSize: 26 }}>{learnerAssessmentDone}/{enrolments.length}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Satisfactions apprenants</SelenCardTitle><strong style={{ fontSize: 26 }}>{learnerDone}/{enrolments.length}</strong></SelenCard>
        <SelenCard><SelenCardTitle>Autres parties prenantes</SelenCardTitle><strong style={{ fontSize: 26 }}>{stakeholders.length}</strong></SelenCard>
      </div>

      <section style={{ marginBottom: 24 }}>
        <h2>Suivi individuel apprenant</h2>
        <p style={{ color: "var(--selen-text2)" }}>
          Mode d’évaluation : {formation?.learning_assessment_mode === "selen_quiz" ? "questionnaire Selen" : "évaluation gérée par le formateur"}. Chaque ligne permet de vérifier séparément l’évaluation et la satisfaction.
        </p>
        {enrolments.length === 0 ? <SelenCard><SelenCardTitle>Aucun apprenant</SelenCardTitle></SelenCard> : (
          <div style={{ display: "grid", gap: 12 }}>
            {enrolments.map((enrolment) => {
              const learner = learnerOf(enrolment);
              const feedback = feedbackByEnrolment.get(enrolment.id);
              const assessment = assessmentByEnrolment.get(enrolment.id);
              const response = responseByEnrolment.get(enrolment.id);
              const evaluationDone = Boolean(assessment || response);
              return (
                <SelenCard key={enrolment.id}>
                  <SelenCardTitle>{learnerName(enrolment)}</SelenCardTitle>
                  {learner?.email ? <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>{learner.email}</p> : null}
                  <p style={{ fontSize: 13 }}>
                    <strong>Évaluation :</strong> {evaluationDone ? "tracée" : "à compléter / importer"}
                    {assessment?.method ? ` · ${assessment.method}` : ""}
                    {assessment?.outcome ? ` · ${assessment.outcome}` : ""}
                    {response?.submitted_at ? ` · transmise le ${new Date(response.submitted_at).toLocaleString("fr-FR")}` : ""}
                  </p>
                  <p style={{ fontSize: 13 }}>
                    <strong>Satisfaction :</strong> {feedback ? `reçue le ${new Date(feedback.submitted_at).toLocaleString("fr-FR")}` : "à recevoir"}
                  </p>
                  {feedback ? <>
                    <p style={{ fontSize: 13 }}>
                      <strong>Global :</strong> {rating(feedback.overall_rating)} · <strong>Objectifs :</strong> {rating(feedback.objectives_rating)} · <strong>Formateur :</strong> {rating(feedback.trainer_rating)} · <strong>Contenu :</strong> {rating(feedback.content_rating)} · <strong>Rythme :</strong> {rating(feedback.pace_rating)}
                      {feedback.would_recommend == null ? null : <> · <strong>Recommande :</strong> {feedback.would_recommend ? "oui" : "non"}</>}
                    </p>
                    {feedback.strengths ? <p style={{ fontSize: 13 }}><strong>Points forts :</strong> {feedback.strengths}</p> : null}
                    {feedback.improvements ? <p style={{ fontSize: 13 }}><strong>Améliorations :</strong> {feedback.improvements}</p> : null}
                    {feedback.adaptation_feedback ? <p style={{ fontSize: 13 }}><strong>Adaptations :</strong> {feedback.adaptation_feedback}</p> : null}
                    {feedback.free_comment ? <p style={{ fontSize: 13 }}><strong>Commentaire :</strong> {feedback.free_comment}</p> : null}
                  </> : null}
                </SelenCard>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2>Commanditaire et formateur</h2>
        <p style={{ color: "var(--selen-text2)" }}>Commanditaire : {enterpriseCount} réponse(s) · Formateur : {trainerCount} réponse(s).</p>
        {stakeholders.length === 0 ? (
          <SelenCard><SelenCardTitle>Aucune réponse reçue</SelenCardTitle><p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Les réponses apparaîtront ici dès leur enregistrement.</p></SelenCard>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {stakeholders.map((item) => (
              <SelenCard key={item.id}>
                <SelenCardTitle>{stakeholderLabels[item.stakeholder_type] ?? item.stakeholder_type} · {item.entity_name || item.entity_email || "Répondant"}</SelenCardTitle>
                <p style={{ fontSize: 12, color: "var(--selen-text2)" }}>Reçue le {new Date(item.submitted_at).toLocaleString("fr-FR")} {item.entity_email ? `· ${item.entity_email}` : ""}</p>
                <p style={{ fontSize: 13 }}><strong>Global :</strong> {rating(item.overall_rating)} · <strong>Objectifs :</strong> {rating(item.objectives_rating)} · <strong>Organisation :</strong> {rating(item.organisation_rating)}{item.stakeholder_type !== "trainer" ? <> · <strong>Formateur :</strong> {rating(item.trainer_rating)}</> : null}</p>
                {item.strengths ? <p style={{ fontSize: 13 }}><strong>Points forts :</strong> {item.strengths}</p> : null}
                {item.improvements ? <p style={{ fontSize: 13 }}><strong>Améliorations :</strong> {item.improvements}</p> : null}
                {item.free_comment ? <p style={{ fontSize: 13 }}><strong>Commentaire :</strong> {item.free_comment}</p> : null}
              </SelenCard>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
