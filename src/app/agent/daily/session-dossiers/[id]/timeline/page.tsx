import Link from "next/link";
import type { CSSProperties } from "react";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = { params: Promise<{ id: string }> };
type Phase = "before" | "during" | "after";

const doneChecklistStatuses = new Set(["validated", "completed", "done", "not_applicable"]);
const failedCommunicationStatuses = new Set(["failed", "bounced", "complained"]);
const terminalSignatureStatuses = new Set(["signed", "expired", "cancelled", "revoked", "refused", "error"]);

function parisDateString(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function currentPhase(start: string | null, end: string | null): Phase {
  const today = parisDateString();
  if (start && today < start) return "before";
  const last = end || start;
  if (last && today > last) return "after";
  return "during";
}

function phaseLabel(phase: Phase) {
  if (phase === "before") return "Avant la formation";
  if (phase === "during") return "Pendant la formation";
  return "Après la formation";
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "—";
}

function formatDateTime(value?: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function communicationLabel(status?: string | null) {
  const labels: Record<string, string> = {
    queued: "Envoi réservé",
    sent: "Envoyé",
    delivered: "Délivré",
    opened: "Ouvert (signal technique)",
    clicked: "Lien cliqué (signal technique)",
    failed: "Échec",
    bounced: "Rejeté",
    complained: "Signalé indésirable",
  };
  return labels[String(status ?? "").toLowerCase()] || status || "État inconnu";
}

function signatureLabel(signature: { status?: string | null; viewed_at?: string | null; signed_at?: string | null }) {
  const status = String(signature.status ?? "").toLowerCase();
  if (status === "signed" || signature.signed_at) return "Signé";
  if (status === "expired") return "Expiré";
  if (["cancelled", "revoked", "refused"].includes(status)) return "Refusé / annulé";
  if (status === "error") return "Échec";
  if (signature.viewed_at || status === "viewed") return "Consulté · signature attendue";
  return "Signature attendue";
}

function signatureParty(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  if (["beneficiaire", "beneficiary", "learner", "apprenant"].includes(normalized)) return "Apprenant";
  if (["entreprise", "company", "enterprise", "commanditaire"].includes(normalized)) return "Entreprise / commanditaire";
  if (["formateur", "trainer"].includes(normalized)) return "Formateur";
  if (["organisme", "organisation"].includes(normalized)) return "Organisme";
  return "Partie prenante";
}

export default async function DailySessionTimelinePage({ params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}>Accès refusé.</main>;

  const { id } = await params;
  const admin = createSupabaseAdminClient();

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status,registration_status")
    .eq("id", id)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) return <main style={s.page}>Session introuvable.</main>;

  const [organisationRes, formationRes, dossierRes, checklistRes, enrolmentsRes, documentsRes, communicationsRes, signaturesRes, attendanceRes, assessmentsRes, feedbackRes] = await Promise.all([
    admin.from("organisations").select("name,legal_name").eq("id", session.organisation_id).maybeSingle(),
    admin.from("daily_formations").select("title,status").eq("id", session.formation_id).maybeSingle(),
    admin.from("daily_session_dossiers").select("status,completed_at").eq("session_id", id).maybeSingle(),
    admin.from("daily_session_checklist_items").select("id,phase,label,description,status,due_at,note,updated_at").eq("session_id", id).order("position", { ascending: true }),
    admin.from("daily_session_enrolments").select("id,status").eq("session_id", id),
    admin.from("daily_documents").select("id,document_type,logical_name,status,is_current,published_at,signed_at,updated_at").eq("session_id", id).order("updated_at", { ascending: false }),
    admin.from("daily_communications").select("id,communication_type,recipient_name,recipient_email,status,sent_at,delivered_at,failed_at,failure_reason,created_at").eq("session_id", id).order("created_at", { ascending: false }),
    admin.from("daily_convention_signatures").select("id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error,updated_at").eq("session_id", id).order("updated_at", { ascending: false }),
    admin.from("daily_attendance_slots").select("id,daily_attendance_records(id,status)").eq("session_id", id),
    admin.from("daily_learning_assessments").select("id,outcome").eq("session_id", id),
    admin.from("daily_learner_feedback_responses").select("id,submitted_at").eq("session_id", id),
  ]);

  for (const result of [organisationRes, formationRes, dossierRes, checklistRes, enrolmentsRes, documentsRes, communicationsRes, signaturesRes, attendanceRes, assessmentsRes, feedbackRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const phase = currentPhase(session.start_date, session.end_date);
  const organisation = organisationRes.data?.legal_name || organisationRes.data?.name || "Organisme de formation";
  const formation = formationRes.data;
  const checklist = checklistRes.data ?? [];
  const openTasks = checklist.filter((item) => !doneChecklistStatuses.has(String(item.status ?? "").toLowerCase()));
  const notes = checklist.filter((item) => String(item.note ?? "").trim());
  const enrolments = (enrolmentsRes.data ?? []).filter((item) => !["declined", "cancelled"].includes(String(item.status ?? "").toLowerCase()));
  const documents = (documentsRes.data ?? []).filter((item) => item.is_current !== false);
  const communications = communicationsRes.data ?? [];
  const failedCommunications = communications.filter((item) => failedCommunicationStatuses.has(String(item.status ?? "").toLowerCase()));
  const signatures = signaturesRes.data ?? [];
  const pendingSignatures = signatures.filter((item) => !terminalSignatureStatuses.has(String(item.status ?? "").toLowerCase()));
  const attendanceRecords = (attendanceRes.data ?? []).flatMap((slot) => slot.daily_attendance_records ?? []);
  const signedAttendance = attendanceRecords.filter((record) => record.status === "present").length;
  const assessments = assessmentsRes.data ?? [];
  const completedAssessments = assessments.filter((item) => item.outcome && item.outcome !== "pending").length;
  const feedbacks = feedbackRes.data ?? [];

  const phaseTasks = (target: Phase) => openTasks.filter((item) => item.phase === target);

  return (
    <main style={s.page}>
      <div style={s.backRow}>
        <Link href="/agent/daily/planning" style={s.back}>← Planning sessions</Link>
        <Link href={`/agent/daily/session-dossiers/${id}/full`} style={s.back}>Dossier complet</Link>
        <Link href={`/agent/daily/communications?session_id=${encodeURIComponent(id)}`} style={s.back}>Communications & preuves</Link>
      </div>

      <header style={s.header}>
        <div style={{ minWidth: 0 }}>
          <p style={s.eyebrow}>Suivi opérationnel de session</p>
          <h1 style={s.h1}>{formation?.title || "Session Daily"}</h1>
          <p style={s.muted}>{organisation}{session.internal_reference ? ` · ${session.internal_reference}` : ""}</p>
        </div>
        <span style={s.badge}>{dossierRes.data?.status === "active" ? "Active" : dossierRes.data?.status || session.status || "Session"}</span>
      </header>

      <SelenCard>
        <SelenCardTitle>Vue synthétique</SelenCardTitle>
        <div style={s.metrics}>
          <Metric label="Apprenants inscrits" value={enrolments.length} />
          <Metric label="Tâches restantes" value={openTasks.length} alert={openTasks.length > 0} />
          <Metric label="Signatures en attente" value={pendingSignatures.length} alert={pendingSignatures.length > 0} />
          <Metric label="Emails en échec" value={failedCommunications.length} alert={failedCommunications.length > 0} />
        </div>
      </SelenCard>

      <section style={s.timeline} aria-label="Timeline de la session">
        {(["before", "during", "after"] as Phase[]).map((itemPhase) => {
          const isCurrent = phase === itemPhase;
          const tasks = phaseTasks(itemPhase);
          return (
            <details key={itemPhase} open={isCurrent || tasks.length > 0} style={{ ...s.phase, ...(isCurrent ? s.phaseCurrent : {}) }}>
              <summary style={s.phaseSummary}>
                <span style={s.phaseTitle}>{phaseLabel(itemPhase)}</span>
                <span style={s.phaseMeta}>{isCurrent ? "Phase actuelle" : ""}{tasks.length ? `${isCurrent ? " · " : ""}${tasks.length} tâche(s) restante(s)` : ""}</span>
              </summary>
              <div style={s.phaseBody}>
                {itemPhase === "before" ? (
                  <div style={s.phaseStats}>
                    <Info label="Inscriptions" value={`${enrolments.length} apprenant(s) inscrit(s)`} />
                    <Info label="Documents courants" value={`${documents.length} document(s) rattaché(s) à la session`} />
                    <Info label="Signatures" value={signatures.length ? `${signatures.length - pendingSignatures.length}/${signatures.length} terminée(s)` : "Aucune demande enregistrée"} />
                  </div>
                ) : null}
                {itemPhase === "during" ? (
                  <div style={s.phaseStats}>
                    <Info label="Émargements" value={`${signedAttendance}/${attendanceRecords.length} présence(s) enregistrée(s)`} />
                    <Info label="Début" value={formatDate(session.start_date)} />
                    <Info label="Fin" value={formatDate(session.end_date)} />
                  </div>
                ) : null}
                {itemPhase === "after" ? (
                  <div style={s.phaseStats}>
                    <Info label="Évaluations" value={`${completedAssessments}/${enrolments.length || assessments.length} renseignée(s)`} />
                    <Info label="Satisfactions apprenants" value={`${feedbacks.length} reçue(s)`} />
                    <Info label="Clôture" value={dossierRes.data?.completed_at ? formatDate(dossierRes.data.completed_at) : "Non clôturée"} />
                  </div>
                ) : null}

                <div style={s.taskList}>
                  <strong style={s.subhead}>Actions restantes</strong>
                  {tasks.length === 0 ? <p style={s.empty}>Aucune tâche restante enregistrée pour cette phase.</p> : tasks.map((task) => (
                    <div key={task.id} style={s.row}>
                      <div style={{ minWidth: 0 }}>
                        <strong>{task.label}</strong>
                        {task.description ? <div style={s.small}>{task.description}</div> : null}
                        {task.note ? <div style={s.note}>Note : {task.note}</div> : null}
                      </div>
                      <div style={s.rowMeta}>{task.due_at ? `Échéance ${formatDateTime(task.due_at)}` : task.status}</div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </section>

      <details open={pendingSignatures.length > 0 || failedCommunications.length > 0} style={s.section}>
        <summary style={s.sectionSummary}>Documents, signatures & communications</summary>
        <div style={s.sectionBody}>
          <div style={s.column}>
            <strong style={s.subhead}>Signatures ({signatures.length})</strong>
            {signatures.length === 0 ? <p style={s.empty}>Aucune demande de signature enregistrée.</p> : signatures.map((signature) => (
              <div key={signature.id} style={s.row}>
                <div style={{ minWidth: 0 }}>
                  <strong>{signatureParty(signature.signatory_type)} · {signature.signatory_name || signature.signatory_email || "destinataire"}</strong>
                  <div style={s.small}>{signatureLabel(signature)}</div>
                  {signature.viewed_at ? <div style={s.small}>Consulté le {formatDateTime(signature.viewed_at)}</div> : null}
                  {signature.signed_at ? <div style={s.small}>Signé le {formatDateTime(signature.signed_at)}</div> : null}
                  {signature.last_error ? <div style={s.error}>Erreur : {signature.last_error}</div> : null}
                </div>
              </div>
            ))}
          </div>

          <div style={s.column}>
            <strong style={s.subhead}>Dernières communications ({communications.length})</strong>
            {communications.length === 0 ? <p style={s.empty}>Aucune communication enregistrée pour cette session.</p> : communications.slice(0, 8).map((communication) => (
              <div key={communication.id} style={s.row}>
                <div style={{ minWidth: 0 }}>
                  <strong>{communication.communication_type || "Communication"}</strong>
                  <div style={s.small}>{communication.recipient_name || communication.recipient_email || "Destinataire non renseigné"}</div>
                  <div style={failedCommunicationStatuses.has(String(communication.status ?? "").toLowerCase()) ? s.error : s.small}>
                    {communicationLabel(communication.status)} · {formatDateTime(communication.sent_at || communication.created_at)}
                  </div>
                  {communication.failure_reason ? <div style={s.error}>{communication.failure_reason}</div> : null}
                </div>
              </div>
            ))}
            {communications.length > 8 ? <Link href={`/agent/daily/communications?session_id=${encodeURIComponent(id)}`} style={s.link}>Voir tout l’historique →</Link> : null}
          </div>
        </div>
      </details>

      {notes.length > 0 ? (
        <details style={s.section}>
          <summary style={s.sectionSummary}>Notes internes ({notes.length})</summary>
          <div style={s.column}>{notes.map((item) => <div key={`note-${item.id}`} style={s.noteCard}><strong>{item.label}</strong><div>{item.note}</div></div>)}</div>
        </details>
      ) : null}

      <div style={s.footerLinks}>
        <Link href={`/agent/daily/session-dossiers/${id}/full`} style={s.link}>Dossier complet</Link>
        <Link href={`/agent/daily/session-dossiers/${id}/followup`} style={s.link}>Fiche de suivi</Link>
        <Link href={`/agent/daily/session-dossiers/${id}/satisfaction`} style={s.link}>Satisfaction</Link>
        <Link href={`/agent/daily/session-dossiers/${id}/closure`} style={s.link}>Clôture</Link>
      </div>
    </main>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return <div style={s.metric}><strong style={{ ...s.metricValue, ...(alert ? s.metricAlert : {}) }}>{value}</strong><span style={s.metricLabel}>{label}</span></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div style={s.info}><span style={s.infoLabel}>{label}</span><strong style={s.infoValue}>{value}</strong></div>;
}

const s = {
  page: { maxWidth: 1120, margin: "0 auto", padding: "clamp(16px, 4vw, 28px) clamp(14px, 4vw, 28px) 70px", color: "var(--selen-text)", minWidth: 0 },
  backRow: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  back: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 18 },
  eyebrow: { margin: 0, color: "var(--selen-gold2)", textTransform: "uppercase", letterSpacing: ".14em", fontSize: 10, fontWeight: 800 },
  h1: { margin: "5px 0", fontFamily: "var(--font-display)", fontSize: "clamp(24px, 5vw, 32px)", overflowWrap: "anywhere" },
  muted: { margin: 0, color: "var(--selen-text2)", fontSize: 13, overflowWrap: "anywhere" },
  badge: { border: "1px solid var(--selen-border)", borderRadius: 999, padding: "7px 10px", fontSize: 11, fontWeight: 800 },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 14 },
  metric: { display: "grid", gap: 4, padding: 12, border: "1px solid var(--selen-border)", borderRadius: 10, background: "var(--selen-bg3)" },
  metricValue: { fontSize: 24, color: "var(--selen-gold2)" },
  metricAlert: { color: "#f0b86a" },
  metricLabel: { fontSize: 11, color: "var(--selen-text2)" },
  timeline: { display: "grid", gap: 10, marginTop: 18 },
  phase: { border: "1px solid var(--selen-border)", borderRadius: 13, background: "var(--selen-bg2)", overflow: "hidden" },
  phaseCurrent: { borderColor: "var(--selen-border2)", boxShadow: "0 0 0 1px rgba(214,177,100,.12)" },
  phaseSummary: { cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "14px 16px" },
  phaseTitle: { fontWeight: 800, fontSize: 15 },
  phaseMeta: { color: "var(--selen-gold2)", fontSize: 11, fontWeight: 700 },
  phaseBody: { display: "grid", gap: 14, padding: "0 16px 16px" },
  phaseStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 },
  info: { display: "grid", gap: 4, padding: 10, borderRadius: 9, background: "var(--selen-bg3)" },
  infoLabel: { color: "var(--selen-text3)", fontSize: 10, textTransform: "uppercase" },
  infoValue: { fontSize: 12 },
  taskList: { display: "grid", gap: 7 },
  subhead: { fontSize: 12, color: "var(--selen-text2)" },
  row: { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", padding: 10, border: "1px solid var(--selen-border)", borderRadius: 9, minWidth: 0 },
  rowMeta: { color: "var(--selen-text3)", fontSize: 10, textAlign: "right", flexShrink: 0 },
  small: { color: "var(--selen-text2)", fontSize: 11, marginTop: 3, overflowWrap: "anywhere" },
  note: { color: "var(--selen-gold2)", fontSize: 11, marginTop: 5, overflowWrap: "anywhere" },
  error: { color: "#f0a0a0", fontSize: 11, marginTop: 3, overflowWrap: "anywhere" },
  empty: { margin: 0, color: "var(--selen-text3)", fontSize: 12 },
  section: { border: "1px solid var(--selen-border)", borderRadius: 13, background: "var(--selen-bg2)", marginTop: 14, overflow: "hidden" },
  sectionSummary: { cursor: "pointer", padding: "14px 16px", fontWeight: 800, fontSize: 14 },
  sectionBody: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 320px),1fr))", gap: 14, padding: "0 16px 16px" },
  column: { display: "grid", gap: 8, minWidth: 0 },
  noteCard: { display: "grid", gap: 4, padding: 10, border: "1px solid var(--selen-border)", borderRadius: 9, fontSize: 12, overflowWrap: "anywhere" },
  link: { color: "var(--selen-gold2)", textDecoration: "none", fontWeight: 700, fontSize: 12 },
  footerLinks: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 },
} satisfies Record<string, CSSProperties>;
