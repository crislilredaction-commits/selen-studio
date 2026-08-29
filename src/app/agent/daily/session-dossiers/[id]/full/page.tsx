import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = { params: Promise<{ id: string }> };

type SessionRow = {
  id: string;
  organisation_id: string;
  formation_id: string;
  internal_reference: string | null;
  start_date: string | null;
  end_date: string | null;
  modality: string | null;
  registration_status: string | null;
  adaptation_needed: boolean | null;
  status: string | null;
};

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "Non renseignée";
}

function registrationLabel(status?: string | null) {
  const labels: Record<string, string> = {
    to_prepare: "En attente d'inscription",
    to_review: "Dossier à vérifier",
    ready_to_send: "Prêt à envoyer",
    sent: "Dossier envoyé",
    responses_received: "Réponses reçues",
    summary_to_review: "Synthèse à relire",
    summary_validated: "Synthèse validée",
  };
  return labels[status ?? ""] ?? "En attente";
}

export default async function FullSessionDossierPage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,modality,registration_status,adaptation_needed,status")
    .eq("id", id)
    .maybeSingle();

  if (!session) return <main style={s.page}>Dossier introuvable.</main>;
  const typedSession = session as SessionRow;

  const [organisationRes, formationRes, responsesRes, enrolmentsRes, attendanceRes, followupRes, assessmentsRes, feedbackRes, dossierRes] = await Promise.all([
    admin.from("organisations").select("name,legal_name").eq("id", typedSession.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("id,title,status,version,global_objective,target_audience,prerequisites,duration_hours,duration_days,modality,validation_note").eq("id", typedSession.formation_id).maybeSingle(),
    admin.from("daily_registration_responses").select("id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,created_at").eq("session_id", id).order("created_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("id,status,daily_learners(first_name,last_name,email)").eq("session_id", id),
    admin.from("daily_attendance_slots").select("id,daily_attendance_records(id,status)").eq("session_id", id),
    admin.from("daily_session_followup_entries").select("id,entry_type,level,summary,status,occurred_at").eq("session_id", id).order("occurred_at", { ascending: false }),
    admin.from("daily_learning_assessments").select("id,outcome,score,score_max").eq("session_id", id),
    admin.from("daily_learner_feedback_responses").select("id,overall_rating,submitted_at").eq("session_id", id),
    admin.from("daily_session_dossiers").select("assigned_agent_profile_id,status,completed_at").eq("session_id", id).maybeSingle(),
  ]);

  const formation = formationRes.data;
  if (!formation) return <main style={s.page}>Formation introuvable.</main>;
  const organisation = organisationRes.data?.legal_name || organisationRes.data?.name || "Organisme de formation";
  const responses = responsesRes.data ?? [];
  const enrolments = (enrolmentsRes.data ?? []).filter((row) => !["declined", "cancelled"].includes(row.status));
  const attendanceRecords = (attendanceRes.data ?? []).flatMap((slot) => slot.daily_attendance_records ?? []);
  const signedAttendance = attendanceRecords.filter((record) => record.status === "present").length;
  const followups = followupRes.data ?? [];
  const openFollowups = followups.filter((entry) => entry.status === "open");
  const assessments = assessmentsRes.data ?? [];
  const completedAssessments = assessments.filter((entry) => entry.outcome && entry.outcome !== "pending").length;
  const feedbacks = feedbackRes.data ?? [];

  const programNeedsReview = formation.status === "review";
  const registrationNeedsReview = formation.status === "validated" && responses.length > 0 && (typedSession.adaptation_needed === true || ["to_review", "responses_received", "summary_to_review"].includes(typedSession.registration_status ?? ""));
  const waitingForRegistration = formation.status === "validated" && responses.length === 0;

  let currentTitle = "Dossier en suivi";
  let currentText = "Aucune action immédiate n'est demandée. Les informations du dossier restent consultables ci-dessous.";
  let currentHref: string | null = null;
  let currentAction: string | null = null;

  if (programNeedsReview) {
    currentTitle = "Programme à vérifier";
    currentText = "Le client a terminé son programme. C'est la seule étape à traiter maintenant.";
    currentHref = `/agent/daily/session-dossiers/${id}`;
    currentAction = "Vérifier le programme →";
  } else if (registrationNeedsReview) {
    currentTitle = typedSession.adaptation_needed ? "Dossier d'inscription avec adaptation" : "Dossier d'inscription à traiter";
    currentText = `${responses.length} réponse${responses.length > 1 ? "s" : ""} reçue${responses.length > 1 ? "s" : ""}. Vérifie les besoins, prérequis et positionnements avant de poursuivre.`;
    currentHref = `/agent/daily/sessions/${id}`;
    currentAction = "Traiter l'inscription →";
  } else if (waitingForRegistration) {
    currentTitle = "En attente d'une inscription";
    currentText = "Le programme est validé. Selen n'a rien à faire tant qu'aucun bénéficiaire ou entreprise n'a envoyé de dossier d'inscription.";
  }

  return <main style={s.page}>
    <div style={s.backRow}><Link href="/agent/daily" style={s.back}>← Pilotage Daily</Link><Link href={`/agent/daily/session-dossiers/${id}`} style={s.back}>Programme</Link></div>

    <header style={s.header}>
      <div><p style={s.eyebrow}>Dossier de session</p><h1 style={s.h1}>{formation.title}</h1><p style={s.muted}>{organisation}{typedSession.internal_reference ? ` · ${typedSession.internal_reference}` : ""}</p></div>
      <span style={s.status}>{registrationLabel(typedSession.registration_status)}</span>
    </header>

    <section style={s.nowCard}>
      <div><p style={s.eyebrow}>À faire maintenant</p><h2 style={s.h2}>{currentTitle}</h2><p style={s.lead}>{currentText}</p></div>
      {currentHref && currentAction ? <Link href={currentHref} style={s.primary}>{currentAction}</Link> : <span style={s.rest}>Rien à traiter ✓</span>}
    </section>

    <section style={s.metrics}>
      <Metric label="Inscriptions reçues" value={responses.length} />
      <Metric label="Participants inscrits" value={enrolments.length} />
      <Metric label="Présences signées" value={signedAttendance} />
      <Metric label="Suivis ouverts" value={openFollowups.length} />
      <Metric label="Évaluations renseignées" value={completedAssessments} />
      <Metric label="Satisfactions reçues" value={feedbacks.length} />
    </section>

    <details style={s.details} open>
      <summary style={s.summary}>Repères de la session</summary>
      <div style={s.detailBody}>
        <Info label="Début" value={formatDate(typedSession.start_date)} />
        <Info label="Fin" value={formatDate(typedSession.end_date)} />
        <Info label="Modalité" value={typedSession.modality || formation.modality || "Non renseignée"} />
        <Info label="Durée" value={`${formation.duration_hours ?? "?"} h · ${formation.duration_days ?? "?"} j`} />
        <Info label="Version du programme" value={`v${formation.version ?? 1}`} />
        <Info label="Dossier" value={dossierRes.data?.completed_at ? `Clôturé le ${formatDate(dossierRes.data.completed_at)}` : "Actif"} />
      </div>
    </details>

    <details style={s.details}>
      <summary style={s.summary}>Programme de formation</summary>
      <div style={s.textBlock}>
        <Info label="Objectif" value={formation.global_objective || "Non renseigné"} />
        <Info label="Public visé" value={formation.target_audience || "Non renseigné"} />
        <Info label="Prérequis" value={formation.prerequisites || "Non renseignés"} />
        {formation.validation_note ? <Info label="Note de validation" value={formation.validation_note} /> : null}
      </div>
    </details>

    <details style={s.details} open={responses.length > 0}>
      <summary style={s.summary}>Inscriptions ({responses.length})</summary>
      <div style={s.list}>
        {responses.length === 0 ? <p style={s.empty}>Aucun dossier d'inscription reçu pour le moment.</p> : responses.map((response) => <div key={response.id} style={s.row}>
          <div><strong>{[response.respondent_first_name, response.respondent_last_name].filter(Boolean).join(" ") || response.company_name || "Dossier d'inscription"}</strong><p style={s.small}>{response.respondent_email || response.company_name || response.response_type}</p></div>
          <span style={s.small}>{formatDate(response.created_at)}</span>
        </div>)}
        {responses.length > 0 ? <Link href={`/agent/daily/sessions/${id}`} style={s.secondary}>Ouvrir le traitement des inscriptions →</Link> : null}
      </div>
    </details>

    <details style={s.details}>
      <summary style={s.summary}>Déroulement & incidents ({followups.length})</summary>
      <div style={s.list}>{followups.length === 0 ? <p style={s.empty}>Aucun incident ni adaptation enregistré.</p> : followups.map((entry) => <div key={entry.id} style={s.row}><div><strong>{entry.summary}</strong><p style={s.small}>{entry.entry_type} · {entry.level} · {entry.status === "resolved" ? "traité" : "ouvert"}</p></div><span style={s.small}>{formatDate(entry.occurred_at)}</span></div>)}</div>
    </details>

    <details style={s.details}>
      <summary style={s.summary}>Présences, évaluations & satisfaction</summary>
      <div style={s.detailBody}>
        <Info label="Émargements" value={`${signedAttendance} présence(s) signée(s) sur ${attendanceRecords.length} enregistrement(s)`} />
        <Info label="Évaluations des acquis" value={`${completedAssessments}/${enrolments.length || assessments.length} renseignée(s)`} />
        <Info label="Questionnaires de satisfaction" value={`${feedbacks.length} reçu(s)`} />
      </div>
    </details>

    <div style={s.footerLinks}>
      <Link href={`/agent/daily/communications?session_id=${encodeURIComponent(id)}`} style={s.secondary}>Communications & preuves</Link>
      <Link href={`/agent/daily/session-dossiers/${id}/followup`} style={s.secondary}>Fiche de suivi</Link>
      <Link href={`/agent/daily/session-dossiers/${id}/satisfaction`} style={s.secondary}>Satisfaction commanditaire & formateur</Link>
      <Link href={`/agent/daily/session-dossiers/${id}/closure`} style={s.secondary}>Clôture</Link>
    </div>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div style={s.metric}><strong style={s.metricValue}>{value}</strong><span style={s.metricLabel}>{label}</span></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div style={s.info}><span style={s.infoLabel}>{label}</span><span style={s.infoValue}>{value}</span></div>; }

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1040, margin: "0 auto", padding: "28px 28px 70px", color: "var(--selen-text)" }, backRow: { display: "flex", gap: 14, marginBottom: 16 }, back: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  header: { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", marginBottom: 18 }, eyebrow: { margin: 0, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".16em", fontSize: 10, fontWeight: 800 }, h1: { margin: "5px 0", fontFamily: "var(--font-display)", fontSize: 31 }, h2: { margin: "5px 0 7px", fontSize: 22 }, muted: { margin: 0, color: "var(--selen-text2)", fontSize: 13 }, lead: { margin: 0, maxWidth: 680, lineHeight: 1.6, color: "var(--selen-text2)", fontSize: 13 },
  status: { border: "1px solid var(--selen-border)", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 800 }, nowCard: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", padding: 20, border: "1px solid var(--selen-border2)", borderRadius: 16, background: "var(--selen-bg2)", marginBottom: 16 }, primary: { display: "inline-flex", alignItems: "center", minHeight: 40, padding: "0 14px", borderRadius: 10, background: "var(--selen-gold2)", color: "var(--selen-bg)", textDecoration: "none", fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }, rest: { color: "var(--selen-success)", fontWeight: 800, fontSize: 13 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 18 }, metric: { display: "grid", gap: 4, padding: 14, border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg3)" }, metricValue: { fontSize: 24, color: "var(--selen-gold2)" }, metricLabel: { fontSize: 11, color: "var(--selen-text2)" },
  details: { border: "1px solid var(--selen-border)", borderRadius: 12, background: "var(--selen-bg2)", marginBottom: 10, overflow: "hidden" }, summary: { cursor: "pointer", padding: "14px 16px", fontWeight: 800, fontSize: 14 }, detailBody: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, padding: "0 16px 16px" }, textBlock: { display: "grid", gap: 10, padding: "0 16px 16px" }, info: { display: "grid", gap: 4, padding: 10, borderRadius: 9, background: "var(--selen-bg3)" }, infoLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--selen-text3)", fontWeight: 800 }, infoValue: { fontSize: 13, lineHeight: 1.5 },
  list: { display: "grid", gap: 8, padding: "0 16px 16px" }, row: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", padding: 10, borderRadius: 9, background: "var(--selen-bg3)" }, small: { margin: "3px 0 0", color: "var(--selen-text3)", fontSize: 11 }, empty: { margin: 0, padding: 10, color: "var(--selen-text3)", fontSize: 12 },
  secondary: { display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 12px", border: "1px solid var(--selen-border)", borderRadius: 9, textDecoration: "none", color: "var(--selen-text)", fontSize: 12, fontWeight: 700 }, footerLinks: { display: "flex", flexWrap: "wrap", gap: 9, marginTop: 18 },
};