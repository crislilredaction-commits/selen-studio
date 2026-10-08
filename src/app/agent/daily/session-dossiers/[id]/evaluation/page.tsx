import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = { params: Promise<{ id: string }> };
type Learner = { email?: string | null; first_name?: string | null; last_name?: string | null };
type Enrolment = { id: string; daily_learners?: Learner | Learner[] | null };
type Assessment = { enrolment_id: string; outcome: string; score: number | null; score_max: number | null; method: string | null; notes: string | null; assessed_at: string | null };
type Response = { enrolment_id: string; auto_score: number | null; score_max: number | null; requires_manual_review: boolean; submitted_at: string | null };
type Evidence = { id: string; enrolment_id: string; logical_name: string; status: string; version: number; created_at: string };

const outcomeLabel: Record<string, string> = { pending: "À valider", achieved: "Acquis", partially_achieved: "En cours d’acquisition", not_achieved: "Non acquis", not_applicable: "Non applicable" };
function one<T>(value: T | T[] | null | undefined) { return Array.isArray(value) ? value[0] ?? null : value ?? null; }
function learnerName(enrolment: Enrolment) { const learner = one(enrolment.daily_learners); return [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant"; }
function date(value?: string | null) { return value ? new Date(value).toLocaleString("fr-FR") : "–"; }

export default async function DailyEvaluationPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin.from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,status").eq("id", id).maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session?.organisation_id || ["archived", "cancelled"].includes(session.status ?? "")) return <main style={{ padding: 28 }}>Session introuvable ou inactive.</main>;
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const [enrolmentRes, assessmentRes, responseRes, evidenceRes, formationRes] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,daily_learners(email,first_name,last_name)").eq("organisation_id", session.organisation_id).eq("session_id", id).not("status", "in", "(declined,cancelled,abandoned)"),
    admin.from("daily_learning_assessments").select("enrolment_id,outcome,score,score_max,method,notes,assessed_at").eq("organisation_id", session.organisation_id).eq("session_id", id),
    admin.from("daily_learning_assessment_responses").select("enrolment_id,auto_score,score_max,requires_manual_review,submitted_at").eq("organisation_id", session.organisation_id).eq("session_id", id),
    admin.from("daily_documents").select("id,enrolment_id,logical_name,status,version,created_at").eq("organisation_id", session.organisation_id).eq("session_id", id).eq("document_type", "learning_assessment_evidence").eq("is_current", true).is("archived_at", null),
    admin.from("daily_formations").select("title,learning_assessment_mode").eq("id", session.formation_id).maybeSingle(),
  ]);
  const error = enrolmentRes.error ?? assessmentRes.error ?? responseRes.error ?? evidenceRes.error ?? formationRes.error;
  if (error) throw new Error(error.message);
  const enrolments = (enrolmentRes.data ?? []) as Enrolment[];
  const assessments = new Map(((assessmentRes.data ?? []) as Assessment[]).map((row) => [row.enrolment_id, row]));
  const responses = new Map(((responseRes.data ?? []) as Response[]).map((row) => [row.enrolment_id, row]));
  const evidence = new Map(((evidenceRes.data ?? []) as Evidence[]).map((row) => [row.enrolment_id, row]));
  const finalized = enrolments.filter((row) => { const value = assessments.get(row.id); return value && value.outcome !== "pending"; }).length;
  const submitted = enrolments.filter((row) => responses.has(row.id) || evidence.has(row.id)).length;

  return <main style={{ maxWidth: 1080, margin: "0 auto", padding: 28 }}>
    <Link href={`/agent/daily/session-dossiers/${id}`} style={{ color: "var(--selen-text2)" }}>← Retour au dossier de session</Link>
    <h1 style={{ marginBottom: 4 }}>Évaluation finale des acquis</h1>
    <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>{formationRes.data?.title ?? "Formation"} · {session.internal_reference || "Sans référence"} · mode {formationRes.data?.learning_assessment_mode === "selen_quiz" ? "questionnaire Selen" : "évaluation externe / formateur"}</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "18px 0" }}>
      <SelenCard><SelenCardTitle>Apprenants</SelenCardTitle><strong style={{ fontSize: 26 }}>{enrolments.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Réponses ou preuves reçues</SelenCardTitle><strong style={{ fontSize: 26 }}>{submitted}/{enrolments.length}</strong></SelenCard>
      <SelenCard><SelenCardTitle>Résultats finalisés</SelenCardTitle><strong style={{ fontSize: 26 }}>{finalized}/{enrolments.length}</strong></SelenCard>
    </div>
    <p style={{ color: "var(--selen-text2)" }}>Une réponse transmise ou une preuve importée ne vaut pas résultat final : l’issue structurée doit être validée séparément dans Daily.</p>
    <section style={{ display: "grid", gap: 12 }}>
      {enrolments.map((enrolment) => {
        const assessment = assessments.get(enrolment.id); const response = responses.get(enrolment.id); const document = evidence.get(enrolment.id);
        return <SelenCard key={enrolment.id}>
          <SelenCardTitle>{learnerName(enrolment)}</SelenCardTitle>
          <p style={{ fontSize: 13 }}><strong>Transmission :</strong> {response ? `questionnaire reçu le ${date(response.submitted_at)}` : document ? `preuve externe reçue le ${date(document.created_at)}` : "aucune réponse ni preuve"}</p>
          {response?.auto_score != null && response.score_max != null ? <p style={{ fontSize: 13 }}><strong>Score automatique :</strong> {response.auto_score}/{response.score_max}{response.requires_manual_review ? " · revue humaine requise" : ""}</p> : null}
          <p style={{ fontSize: 13 }}><strong>Résultat :</strong> {assessment ? outcomeLabel[assessment.outcome] ?? assessment.outcome : "À renseigner"}{assessment?.score != null && assessment.score_max != null ? ` · ${assessment.score}/${assessment.score_max}` : ""}{assessment?.method ? ` · ${assessment.method}` : ""}</p>
          {assessment?.notes ? <p style={{ fontSize: 13 }}><strong>Notes :</strong> {assessment.notes}</p> : null}
          {document ? <p style={{ fontSize: 13 }}><a href={`/agent/api/daily/learning-assessment-evidence/download?id=${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Consulter la preuve externe · version {document.version}</a></p> : null}
        </SelenCard>;
      })}
    </section>
  </main>;
}
