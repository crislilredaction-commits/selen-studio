import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import PosttrainingAnalysisForm from "./PosttrainingAnalysisForm";
import { getFinalizedDailyAssessmentEnrolmentIds } from "@/lib/server/dailyPosttrainingAssessmentEligibility";

type Props = { params: Promise<{ id: string }> };
type Learner = { id?: string; organisation_id?: string | null; email?: string | null; first_name?: string | null; last_name?: string | null };
type Enrolment = { id: string; learner_id: string; daily_learners?: Learner | Learner[] | null };
type LearnerFeedback = {
  enrolment_id: string; overall_rating: number; objectives_rating: number; trainer_rating: number | null; organisation_rating: number | null;
  content_rating: number | null; pace_rating: number | null; would_recommend: boolean | null; strengths: string | null;
  improvements: string | null; adaptation_feedback: string | null; free_comment: string | null; submitted_at: string;
};
type PosttrainingAnalysis = {
  enrolment_id: string; strengths: string | null; weaknesses: string | null; vigilance: string | null;
  summary: string | null; action_required: boolean; updated_at: string;
};

const stakeholderLabels: Record<string, string> = {
  client: "OF · retour plateforme",
  company: "Commanditaire",
  enterprise: "Commanditaire (historique)",
  trainer: "Formateur",
};
const rating = (value: number | null) => value == null ? "–" : `${value}/5`;
function learnerOf(enrolment: Enrolment) { return Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners; }
function learnerName(enrolment: Enrolment) { const learner = learnerOf(enrolment); return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"; }

function qualityHref(sessionId: string, organisationId: string) {
  const params = new URLSearchParams({ source: "satisfaction", session_id: sessionId, organisation_id: organisationId });
  return `/agent/daily/qualite?${params.toString()}`;
}

export default async function StakeholderSatisfactionPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.organisation_id) return <main style={{ padding: 28 }}>Session introuvable.</main>;
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) {
    return <main style={{ padding: 28 }}>Accès refusé.</main>;
  }

  const [stakeholderRes, enrolmentRes, learnerFeedbackRes, analysisRes] = await Promise.all([
    admin.from("daily_stakeholder_satisfaction_responses").select("id,stakeholder_type,entity_name,entity_email,overall_rating,objectives_rating,trainer_rating,organisation_rating,would_recommend,strengths,improvements,free_comment,submitted_at").eq("session_id", id).order("submitted_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("id,learner_id,daily_learners(id,organisation_id,email,first_name,last_name)").eq("organisation_id", session.organisation_id).eq("session_id", id).not("status", "in", "(declined,cancelled,abandoned)"),
    admin.from("daily_learner_feedback_responses").select("enrolment_id,overall_rating,objectives_rating,trainer_rating,organisation_rating,content_rating,pace_rating,would_recommend,strengths,improvements,adaptation_feedback,free_comment,submitted_at").eq("organisation_id", session.organisation_id).eq("session_id", id),
    admin.from("daily_posttraining_analyses").select("enrolment_id,strengths,weaknesses,vigilance,summary,action_required,updated_at").eq("organisation_id", session.organisation_id).eq("session_id", id),
  ]);
  const error = stakeholderRes.error ?? enrolmentRes.error ?? learnerFeedbackRes.error ?? analysisRes.error;
  if (error) throw new Error(error.message);
  const [{ data: organisation }, { data: formation }] = await Promise.all([
    admin.from("organisations").select("name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title,learning_assessment_mode").eq("id", session.formation_id).maybeSingle(),
  ]);

  const stakeholders = stakeholderRes.data ?? [];
  const enrolments = ((enrolmentRes.data ?? []) as Enrolment[]).filter((enrolment) => {
    const learner = learnerOf(enrolment);
    return learner?.organisation_id === session.organisation_id && learner.id === enrolment.learner_id;
  });
  const enrolmentIds = new Set(enrolments.map((row) => row.id));
  const learnerFeedback = ((learnerFeedbackRes.data ?? []) as LearnerFeedback[]).filter((row) => enrolmentIds.has(row.enrolment_id));
  const feedbackByEnrolment = new Map(learnerFeedback.map((row) => [row.enrolment_id, row]));
  const finalizedAssessmentIds = new Set([...await getFinalizedDailyAssessmentEnrolmentIds(admin, session.organisation_id, id)]
    .filter((enrolmentId) => enrolmentIds.has(enrolmentId)));
  const analysisByEnrolment = new Map(((analysisRes.data ?? []) as PosttrainingAnalysis[])
    .filter((row) => enrolmentIds.has(row.enrolment_id))
    .map((row) => [row.enrolment_id, row]));
  const companyCount = stakeholders.filter((item) => item.stakeholder_type === "company" || item.stakeholder_type === "enterprise").length;
  const trainerCount = stakeholders.filter((item) => item.stakeholder_type === "trainer").length;
  const clientCount = stakeholders.filter((item) => item.stakeholder_type === "client").length;
  const learnerDone = feedbackByEnrolment.size;
  const qualityLink = qualityHref(id, session.organisation_id);

  return <main style={{ maxWidth: 1080, margin: "0 auto", padding: 28 }}>
    <Link href={`/agent/daily/session-dossiers/${id}/full#apres-formation`} style={{ color: "var(--selen-text2)" }}>← Retour à l’étape Après</Link>
    <h1 style={{ marginBottom: 4 }}>Satisfaction de fin de formation</h1>
    <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>{formation?.title ?? "Formation"} · {organisation?.name ?? "Organisme"} · {session.internal_reference || "Sans référence"}</p>

    <SelenCard>
      <SelenCardTitle>Passer du constat au suivi qualité</SelenCardTitle>
      <p style={{ marginTop: 0, color: "var(--selen-text2)", fontSize: 13 }}>Les réponses ci-dessous restent les sources canoniques. Studio ne crée aucune réclamation ni action corrective automatiquement : l’agent qualifie d’abord le constat, puis décide s’il relève d’une amélioration, d’une action corrective ou du suivi des réclamations.</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href={qualityLink} style={{ display: "inline-flex", minHeight: 36, alignItems: "center", padding: "0 11px", borderRadius: 9, border: "1px solid var(--selen-gold2)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 12 }}>Analyser dans Qualité & veilles</Link>
        <Link href="/agent/daily/reclamations" style={{ display: "inline-flex", minHeight: 36, alignItems: "center", padding: "0 11px", borderRadius: 9, border: "1px solid var(--selen-border)", color: "var(--selen-text)", textDecoration: "none", fontWeight: 700, fontSize: 12 }}>Voir Réclamations & suggestions</Link>
      </div>
    </SelenCard>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "18px 0" }}>
      <SelenCard><SelenCardTitle>Apprenants</SelenCardTitle><strong style={{ fontSize: 26 }}>{enrolments.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Satisfactions apprenants</SelenCardTitle><strong style={{ fontSize: 26 }}>{learnerDone}/{enrolments.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Évaluations finalisées</SelenCardTitle><strong style={{ fontSize: 26 }}>{finalizedAssessmentIds.size}/{enrolments.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Retour OF plateforme</SelenCardTitle><strong style={{ fontSize: 26 }}>{clientCount}</strong></SelenCard>
    </div>

    <section style={{ marginBottom: 24 }}>
      <h2>Suivi individuel apprenant</h2>
      <p style={{ color: "var(--selen-text2)" }}>Cette vue est limitée aux retours de satisfaction. <Link href={`/agent/daily/session-dossiers/${id}/evaluation`}>Ouvrir la vue dédiée aux évaluations des acquis.</Link></p>
      {enrolments.length === 0 ? <SelenCard><SelenCardTitle>Aucun apprenant</SelenCardTitle></SelenCard> : <div style={{ display: "grid", gap: 12 }}>
        {enrolments.map((enrolment) => {
          const learner = learnerOf(enrolment);
          const feedback = feedbackByEnrolment.get(enrolment.id);
          const analysis = analysisByEnrolment.get(enrolment.id);
          const assessmentFinalized = finalizedAssessmentIds.has(enrolment.id);
          return <SelenCard key={enrolment.id}>
            <SelenCardTitle>{learnerName(enrolment)}</SelenCardTitle>
            {learner?.email ? <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>{learner.email}</p> : null}
            <p style={{ fontSize: 13 }}><strong>Satisfaction :</strong> {feedback ? `reçue le ${new Date(feedback.submitted_at).toLocaleString("fr-FR")}` : "à recevoir"}</p>
            {feedback ? <><p style={{ fontSize: 13 }}><strong>Global :</strong> {rating(feedback.overall_rating)} · <strong>Objectifs :</strong> {rating(feedback.objectives_rating)} · <strong>Formateur :</strong> {rating(feedback.trainer_rating)} · <strong>Contenu :</strong> {rating(feedback.content_rating)} · <strong>Rythme :</strong> {rating(feedback.pace_rating)}{feedback.would_recommend == null ? null : <> · <strong>Recommande :</strong> {feedback.would_recommend ? "oui" : "non"}</>}</p>{feedback.strengths ? <p style={{ fontSize: 13 }}><strong>Points forts :</strong> {feedback.strengths}</p> : null}{feedback.improvements ? <p style={{ fontSize: 13 }}><strong>Améliorations :</strong> {feedback.improvements}</p> : null}{feedback.adaptation_feedback ? <p style={{ fontSize: 13 }}><strong>Adaptations :</strong> {feedback.adaptation_feedback}</p> : null}{feedback.free_comment ? <p style={{ fontSize: 13 }}><strong>Commentaire :</strong> {feedback.free_comment}</p> : null}</> : null}
            <p style={{ fontSize: 13 }}><strong>Évaluation des acquis :</strong> {assessmentFinalized ? "finalisée" : "en attente de validation"}</p>
            <PosttrainingAnalysisForm sessionId={id} enrolmentId={enrolment.id} initial={analysis} enabled={Boolean(feedback) || assessmentFinalized} />
          </SelenCard>;
        })}
      </div>}
    </section>

    <section>
      <h2>OF, commanditaire et formateur</h2>
      <p style={{ color: "var(--selen-text2)" }}>Retour OF plateforme : {clientCount} · Commanditaire : {companyCount} · Formateur : {trainerCount}.</p>
      {stakeholders.length === 0 ? <SelenCard><SelenCardTitle>Aucune réponse reçue</SelenCardTitle><p style={{ marginBottom: 0, color: "var(--selen-text2)" }}>Les réponses apparaîtront ici dès leur enregistrement.</p></SelenCard> : <div style={{ display: "grid", gap: 12 }}>
        {stakeholders.map((item) => {
          const isClient = item.stakeholder_type === "client";
          return <SelenCard key={item.id}>
            <SelenCardTitle>{stakeholderLabels[item.stakeholder_type] ?? item.stakeholder_type} · {item.entity_name || item.entity_email || (isClient ? organisation?.name : "Répondant")}</SelenCardTitle>
            <p style={{ fontSize: 12, color: "var(--selen-text2)" }}>Reçue le {new Date(item.submitted_at).toLocaleString("fr-FR")} {item.entity_email ? `· ${item.entity_email}` : ""}</p>
            {isClient ? <p style={{ fontSize: 13 }}><strong>Note plateforme :</strong> {rating(item.overall_rating)}</p> : <p style={{ fontSize: 13 }}><strong>Global :</strong> {rating(item.overall_rating)} · <strong>Objectifs :</strong> {rating(item.objectives_rating)} · <strong>Organisation :</strong> {rating(item.organisation_rating)}{item.stakeholder_type !== "trainer" ? <> · <strong>Formateur :</strong> {rating(item.trainer_rating)}</> : null}</p>}
            {item.strengths ? <p style={{ fontSize: 13 }}><strong>{isClient ? "Apprécié" : "Points forts"} :</strong> {item.strengths}</p> : null}{item.improvements ? <p style={{ fontSize: 13 }}><strong>{isClient ? "Moins bien" : "Améliorations"} :</strong> {item.improvements}</p> : null}{item.free_comment ? <p style={{ fontSize: 13 }}><strong>{isClient ? "Suggestions" : "Commentaire"} :</strong> {item.free_comment}</p> : null}
          </SelenCard>;
        })}
      </div>}
    </section>
  </main>;
}
