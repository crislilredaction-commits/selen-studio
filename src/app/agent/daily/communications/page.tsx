import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import {
  DAILY_SIGNATURE_REMINDER_TYPE,
  signatureReminderDueAt,
} from "@/lib/daily/signatureReminder24h";
import { attendanceReviewStateLabel, getAttendanceReviewHistory } from "@/lib/daily/attendanceReviewHistory";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import {
  communicationHistoryMetrics,
  filterCommunicationHistory,
  normalizeCommunicationQuery,
  normalizeCommunicationStatus,
  normalizeCommunicationType,
} from "@/lib/daily/communicationHistoryTriage.mjs";

type Props = {
  searchParams: Promise<{ session_id?: string; q?: string | string[]; etat?: string | string[]; categorie?: string | string[] }>;
};

type JsonRecord = Record<string, unknown>;
type SignatureRow = {
  id: string;
  convention_id: string;
  session_id: string;
  signatory_type: string | null;
  signatory_name: string | null;
  signatory_email: string | null;
  status: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  last_error: string | null;
  daily_conventions: JsonRecord | JsonRecord[] | null;
};
type ReminderRow = {
  id: string;
  prestation_id: string | null;
  status: string | null;
  due_at: string | null;
  metadata: JsonRecord | null;
};

const typeLabels: Record<string, string> = {
  attendance_reminder: "Relance d’émargement",
  attendance_correction_request: "Demande de correction d’émargement",
  attendance_regularization_followup: "Relance ciblée de régularisation d’émargement",
  convocation: "Convocation",
  satisfaction_request: "Questionnaire de satisfaction",
  completion_certificate: "Certificat de réalisation",
  convention_signature: "Demande de signature de convention",
  convention_signature_followup: "Relance manuelle de signature",
};

const statusLabels: Record<string, string> = {
  queued: "Envoi réservé",
  sent: "Envoyé",
  delivered: "Délivré",
  opened: "Ouvert (signal technique, pas preuve de lecture)",
  clicked: "Lien cliqué (signal technique, pas preuve de lecture)",
  failed: "Échec",
  bounced: "Rejeté",
  complained: "Signalé comme indésirable",
};

const activeReminderStatuses = new Set(["draft", "ready", "postponed"]);
const terminalSignatureStatuses = new Set(["signed", "expired", "cancelled", "revoked", "refused", "error"]);

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function one(value: JsonRecord | JsonRecord[] | null | undefined): JsonRecord {
  if (Array.isArray(value)) return value[0] ?? {};
  return value ?? {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
}
function partyLabel(value: string | null) {
  const normalized = text(value).toLowerCase();
  if (["beneficiaire", "beneficiary", "learner", "apprenant"].includes(normalized)) return "Apprenant";
  if (["entreprise", "company", "enterprise", "commanditaire"].includes(normalized)) return "Entreprise / commanditaire";
  if (["formateur", "trainer"].includes(normalized)) return "Formateur";
  if (["organisme", "organisation"].includes(normalized)) return "Organisme";
  return "Autre partie prenante";
}
function signatureIdFromCommunication(communication: { metadata?: unknown }) {
  return text(record(communication.metadata).signature_id);
}
function latestForSignature<T extends { metadata?: unknown }>(rows: T[], signatureId: string) {
  return rows.find((row) => signatureIdFromCommunication(row) === signatureId);
}
function reminderForSignature(reminders: ReminderRow[], signatureId: string) {
  return reminders.find((row) => row.prestation_id === signatureId || text(row.metadata?.signature_id) === signatureId);
}
function signatureBusinessLabel(signature: SignatureRow, initial: { status?: string | null } | undefined) {
  const status = text(signature.status).toLowerCase();
  if (status === "signed") return "Signé";
  if (status === "expired") return "Expiré";
  if (["cancelled", "revoked", "refused"].includes(status)) return "Refusé / annulé";
  if (status === "error") return "Échec";
  if (!initial) return "Non envoyé";
  if (["failed", "bounced", "complained"].includes(text(initial.status).toLowerCase())) return "Échec d’envoi";
  if (status === "viewed") return "Consulté · signature attendue";
  if (!terminalSignatureStatuses.has(status)) return "Signature attendue";
  return status || "Signature attendue";
}
function reminderLabel(reminder: ReminderRow | undefined) {
  if (!reminder) return "Aucune relance enregistrée";
  if (reminder.status === "resolved") return "Relance clôturée";
  if (!activeReminderStatuses.has(String(reminder.status ?? ""))) return `Relance ${reminder.status ?? "—"}`;
  const stage = text(reminder.metadata?.followup_stage);
  if (stage === "automatic_email_j3") return "Relance automatique J+3 planifiée";
  if (stage === "automatic_email_j6") return "Relance automatique J+6 planifiée";
  if (stage === "phone_call_j9") return "Appel agent J+9 à traiter";
  if (stage === "agent_urgent_before_start") return "Alerte urgente avant démarrage";
  if (!reminder.due_at) return "Relance active";
  return new Date(reminder.due_at).getTime() <= Date.now()
    ? "Relance nécessaire"
    : "Relance planifiée";
}

export default async function DailyCommunicationsPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  let dailyOrganisationIds: string[];
  try {
    dailyOrganisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main style={{ padding: 28 }}>Impossible de vérifier votre périmètre Daily.</main>;
  }
  if (dailyOrganisationIds.length === 0) {
    return <main style={{ padding: 28 }}>Aucun organisme Daily affecté.</main>;
  }

  const { session_id: sessionId, q: queryParam, etat: statusParam, categorie: typeParam } = await searchParams;
  const searchQuery = normalizeCommunicationQuery(queryParam);
  const statusFilter = normalizeCommunicationStatus(statusParam);
  const typeFilter = normalizeCommunicationType(typeParam);
  const admin = createSupabaseAdminClient();
  const { data: scopedSession, error: scopedSessionError } = sessionId
    ? await admin.from("daily_sessions").select("id,organisation_id").eq("id", sessionId).in("organisation_id", dailyOrganisationIds).maybeSingle()
    : { data: null, error: null };
  if (scopedSessionError) throw new Error(scopedSessionError.message);
  if (sessionId && !scopedSession) return <main style={{ padding: 28 }}>Session introuvable ou non autorisée.</main>;

  let query = admin
    .from("daily_communications")
    .select("id,organisation_id,session_id,enrolment_id,communication_type,recipient_email,recipient_name,subject,text_body,provider,provider_message_id,status,sent_at,delivered_at,failed_at,failure_reason,created_at,metadata,daily_communication_documents(document_id,document_type,logical_name,document_version,sha256,storage_path)")
    .in("organisation_id", dailyOrganisationIds)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sessionId) query = query.eq("session_id", sessionId);

  const { data: communications, error } = await query;
  if (error) throw new Error(error.message);

  const communicationRows = communications ?? [];
  // Les conventions sans communication initiale doivent rester visibles, mais uniquement
  // pour des sessions appartenant aux organismes autorisés de l'agent.
  const { data: scopedSignatureSessions, error: scopedSignatureSessionsError } = sessionId
    ? { data: [{ id: sessionId }], error: null }
    : await admin.from("daily_sessions")
        .select("id")
        .in("organisation_id", dailyOrganisationIds)
        .limit(1000);
  if (scopedSignatureSessionsError) throw new Error(scopedSignatureSessionsError.message);
  const signatureSessionIds = (scopedSignatureSessions ?? []).map((session) => session.id);
  const sessionIds = [...new Set([sessionId, ...communicationRows.map((item) => item.session_id)].filter(Boolean))] as string[];
  const organisationIds = [...new Set([scopedSession?.organisation_id, ...communicationRows.map((item) => item.organisation_id)].filter(Boolean))] as string[];

  const signatureQuery = signatureSessionIds.length
    ? admin.from("daily_convention_signatures")
        .select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error,daily_conventions(id,document_name,recipient_type,recipient_name,recipient_email,company_name,version)")
        .in("session_id", signatureSessionIds)
        .order("created_at", { ascending: false })
        .limit(300)
    : Promise.resolve({ data: [] as SignatureRow[], error: null });

  const [{ data: sessions }, { data: organisations }, { data: signatures, error: signatureError }] = await Promise.all([
    sessionIds.length
      ? admin.from("daily_sessions").select("id,internal_reference,formation_id").in("id", sessionIds).in("organisation_id", dailyOrganisationIds)
      : Promise.resolve({ data: [] }),
    organisationIds.length
      ? admin.from("organisations").select("id,name").in("id", organisationIds)
      : Promise.resolve({ data: [] }),
    signatureQuery,
  ]);
  if (signatureError) throw new Error(signatureError.message);

  const signatureRows = (signatures ?? []) as SignatureRow[];
  const signatureIds = signatureRows.map((item) => item.id);
  const { data: reminders, error: reminderError } = signatureIds.length
    ? await admin
      .from("client_reminders")
      .select("id,prestation_id,status,due_at,metadata")
      .eq("reminder_type", DAILY_SIGNATURE_REMINDER_TYPE)
      .in("prestation_id", signatureIds)
      .order("due_at", { ascending: false })
    : { data: [] as ReminderRow[], error: null };
  if (reminderError) throw new Error(reminderError.message);
  const reminderRows = (reminders ?? []) as ReminderRow[];

  const formationIds = [...new Set((sessions ?? []).map((item) => item.formation_id).filter(Boolean))] as string[];
  const { data: formations } = formationIds.length
    ? await admin.from("daily_formations").select("id,title").in("id", formationIds)
    : { data: [] as { id: string; title: string }[] };

  const sessionMap = new Map((sessions ?? []).map((item) => [item.id, item]));
  const organisationMap = new Map((organisations ?? []).map((item) => [item.id, item.name]));
  const formationMap = new Map((formations ?? []).map((item) => [item.id, item.title]));
  // Le registre source reste inchangé pour relier chaque signature à son dernier envoi.
  // Les filtres de présentation portent uniquement sur les 200 envois déjà autorisés.
  const communicationMetrics = communicationHistoryMetrics(communicationRows);
  const visibleCommunications = filterCommunicationHistory(
    communicationRows.map((row) => {
      const session = row.session_id ? sessionMap.get(row.session_id) : undefined;
      return {
        ...row,
        organisation_label: organisationMap.get(row.organisation_id) ?? "",
        session_label: session?.internal_reference ?? "",
        formation_label: session?.formation_id ? formationMap.get(session.formation_id) ?? "" : "",
      };
    }),
    { q: searchQuery, etat: statusFilter, categorie: typeFilter },
  );
  const [attendanceSlotsResult, attendanceEnrolmentsResult] = sessionId
    ? await Promise.all([
      admin.from("daily_attendance_slots")
        .select("id,slot_date,starts_at,ends_at,daily_attendance_records(id,enrolment_id,signed_at,evidence_metadata)")
        .eq("session_id", sessionId).order("slot_date").order("starts_at"),
      admin.from("daily_session_enrolments")
        .select("id,daily_learners(first_name,last_name,email)")
        .eq("session_id", sessionId),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (attendanceSlotsResult.error || attendanceEnrolmentsResult.error) {
    throw new Error(attendanceSlotsResult.error?.message || attendanceEnrolmentsResult.error?.message);
  }
  const attendanceLearners = new Map((attendanceEnrolmentsResult.data ?? []).map((enrolment) => {
    const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
    const name = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email || "Apprenant";
    return [enrolment.id, name] as const;
  }));
  const attendanceReviews = (attendanceSlotsResult.data ?? []).flatMap((slot) =>
    (slot.daily_attendance_records ?? []).flatMap((attendance) =>
      getAttendanceReviewHistory(attendance).map((review) => ({
        ...review,
        recordId: attendance.id,
        learnerName: attendanceLearners.get(attendance.enrolment_id) || "Apprenant",
        slotLabel: `${dateLabel(slot.slot_date)} · ${String(slot.starts_at).slice(0, 5)}–${String(slot.ends_at).slice(0, 5)}`,
      })),
    ),
  ).sort((a, b) => new Date(b.decidedAt || b.submittedAt || 0).getTime() - new Date(a.decidedAt || a.submittedAt || 0).getTime());

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(16px, 4vw, 28px)", minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap", minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h1 style={{ marginBottom: 4, overflowWrap: "anywhere" }}>Communications & preuves</h1>
          <p style={{ marginTop: 0, color: "var(--selen-text2)", overflowWrap: "anywhere" }}>
            Preuve d’envoi et état métier sont affichés séparément : une ouverture ou un clic ne vaut jamais signature.
          </p>
        </div>
        {sessionId ? <Link href="/agent/daily/communications">Voir tout l’historique</Link> : null}
      </div>

      {sessionId ? (
        <p style={{ padding: 10, border: "1px solid var(--selen-border)", borderRadius: 10, overflowWrap: "anywhere" }}>
          Filtre actif : session <code style={{ wordBreak: "break-all" }}>{sessionId}</code>
        </p>
      ) : null}

      {sessionId ? (
        <section style={{ marginBottom: 20 }} aria-labelledby="attendance-review-history-title">
          <h2 id="attendance-review-history-title" style={{ marginBottom: 10 }}>Preuves de revue des émargements</h2>
          {attendanceReviews.length === 0 ? (
            <SelenCard>
              <SelenCardTitle>Aucune revue tardive enregistrée</SelenCardTitle>
              <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Les validations et rejets successifs apparaîtront ici sans jeton, chemin de stockage ni identité privée du décideur.</p>
            </SelenCard>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {attendanceReviews.map((review) => (
                <SelenCard key={`${review.recordId}:${review.version}`}>
                  <SelenCardTitle>{review.learnerName} · preuve v{review.version}</SelenCardTitle>
                  <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Créneau :</strong> {review.slotLabel}</p>
                  <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Décision :</strong> {attendanceReviewStateLabel(review.state)}</p>
                  {review.submittedAt ? <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Transmise :</strong> {dateLabel(review.submittedAt)}</p> : null}
                  {review.decidedAt ? <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Décidée :</strong> {dateLabel(review.decidedAt)}</p> : null}
                  {review.reason ? <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Motif :</strong> {review.reason}</p> : null}
                </SelenCard>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 10 }}>Signatures attendues & preuves</h2>
        {signatureRows.length === 0 ? (
          <SelenCard>
            <SelenCardTitle>Aucune signature de convention enregistrée</SelenCardTitle>
            <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Les demandes de signature apparaîtront ici dès leur création, y compris avant le premier envoi.</p>
          </SelenCard>
        ) : (
          <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
            {signatureRows.map((signature) => {
              const convention = one(signature.daily_conventions);
              const initial = latestForSignature(communicationRows.filter((row) => row.communication_type === "convention_signature"), signature.id);
              const manualFollowup = latestForSignature(communicationRows.filter((row) => row.communication_type === "convention_signature_followup"), signature.id);
              const reminder = reminderForSignature(reminderRows, signature.id);
              const deadline = reminder?.due_at || (
                initial?.sent_at
                  ? signatureReminderDueAt(new Date(initial.sent_at)).toISOString()
                  : null
              );
              const businessState = signatureBusinessLabel(signature, initial);

              return (
                <SelenCard key={`signature-${signature.id}`}>
                  <div style={{ display: "grid", gap: 6, minWidth: 0, overflowWrap: "anywhere" }}>
                    <SelenCardTitle>{text(convention.document_name) || "Convention de formation"}</SelenCardTitle>
                    <div style={{ fontSize: 12, color: "var(--selen-text2)" }}>
                      {partyLabel(signature.signatory_type)}
                      {signature.signatory_name ? ` · ${signature.signatory_name}` : ""}
                      {signature.signatory_email ? ` · ${signature.signatory_email}` : ""}
                    </div>
                    <p style={{ margin: "4px 0", fontSize: 13 }}><strong>État métier :</strong> {businessState}</p>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Preuve email :</strong> {initial ? (statusLabels[initial.status] ?? initial.status) : "Non envoyé"}
                      {initial?.sent_at ? ` · envoyé ${dateLabel(initial.sent_at)}` : ""}
                      {initial?.delivered_at ? ` · délivré ${dateLabel(initial.delivered_at)}` : ""}
                    </p>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Consultation du document :</strong> {signature.viewed_at ? dateLabel(signature.viewed_at) : "Non tracée"}
                      {" · "}<strong>Prochaine échéance :</strong> {dateLabel(deadline)}
                    </p>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Signature :</strong> {signature.signed_at ? dateLabel(signature.signed_at) : "En attente"}
                      {signature.signed_at && signature.signatory_name ? ` · ${signature.signatory_name}` : ""}
                    </p>
                    <p style={{ margin: "4px 0", fontSize: 13 }}>
                      <strong>Relance :</strong> {reminderLabel(reminder)}
                      {manualFollowup ? ` · dernière relance manuelle ${dateLabel(manualFollowup.sent_at || manualFollowup.created_at)}` : ""}
                    </p>
                    {signature.expires_at ? <p style={{ margin: "4px 0", fontSize: 13 }}><strong>Expiration du lien :</strong> {dateLabel(signature.expires_at)}</p> : null}
                    {signature.last_error ? <p style={{ margin: "4px 0", fontSize: 13 }}><strong>Échec métier :</strong> {signature.last_error}</p> : null}
                    {signature.session_id ? <Link href={`/agent/daily/session-dossiers/${signature.session_id}`}>Ouvrir le dossier de session</Link> : null}
                  </div>
                </SelenCard>
              );
            })}
          </div>
        )}
      </section>

      <section aria-label="Filtrer les communications" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 10 }}>Historique des communications</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }} aria-label="Compteurs des envois consultés">
          <span><strong>{communicationMetrics.total}</strong> envoi(s) consulté(s)</span>
          <span><strong>{communicationMetrics.issues}</strong> échec(s) à examiner</span>
          <span><strong>{communicationMetrics.queued}</strong> en attente d’envoi</span>
        </div>
        <form method="get" role="search" style={{ display: "flex", flexWrap: "wrap", alignItems: "end", gap: 12, padding: 14, border: "1px solid var(--selen-border)", borderRadius: 12 }}>
          {sessionId ? <input type="hidden" name="session_id" value={sessionId} /> : null}
          <label style={{ display: "grid", gap: 4, flex: "2 1 200px" }}>
            Rechercher
            <input type="search" name="q" maxLength={80} defaultValue={searchQuery} placeholder="Destinataire, organisme, objet, session…" style={{ width: "100%", padding: 9 }} />
          </label>
          <label style={{ display: "grid", gap: 4, flex: "1 1 150px" }}>
            État d’envoi
            <select name="etat" defaultValue={statusFilter} style={{ padding: 9 }}>
              <option value="all">Tous les états</option>
              <option value="issues">Échecs à examiner</option>
              <option value="queued">En attente</option>
              <option value="sent">Envoyés / délivrés</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 4, flex: "1 1 160px" }}>
            Catégorie
            <select name="categorie" defaultValue={typeFilter} style={{ padding: 9 }}>
              <option value="all">Toutes les catégories</option>
              <option value="attendance">Émargements</option>
              <option value="signature">Conventions à signer</option>
              <option value="other">Autres communications</option>
            </select>
          </label>
          <button type="submit" style={{ padding: "10px 16px", cursor: "pointer" }}>Appliquer</button>
          <Link href={sessionId ? `/agent/daily/communications?session_id=${encodeURIComponent(sessionId)}` : "/agent/daily/communications"}>Réinitialiser</Link>
        </form>
        <p style={{ color: "var(--selen-text2)", fontSize: 13 }}>
          {visibleCommunications.length} résultat(s) affiché(s). Les échecs sont présentés en premier.
          {communicationMetrics.total === 200 ? " Attention : affichage limité aux 200 communications les plus récentes ; les filtres ne couvrent pas l’historique antérieur." : ""}
          {" "}Les états email ne prouvent jamais une signature.
        </p>
      </section>

      {communicationRows.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucune communication enregistrée</SelenCardTitle>
          <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Le registre est prêt ; les prochains envois Daily apparaîtront ici automatiquement.</p>
        </SelenCard>
      ) : visibleCommunications.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucun envoi ne correspond aux filtres</SelenCardTitle>
          <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Ajustez la recherche ou réinitialisez les filtres pour retrouver les preuves.</p>
        </SelenCard>
      ) : (
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          {visibleCommunications.map((communication) => {
            const session = communication.session_id ? sessionMap.get(communication.session_id) : undefined;
            const formationTitle = session?.formation_id ? formationMap.get(session.formation_id) : undefined;
            const documents = Array.isArray(communication.daily_communication_documents)
              ? communication.daily_communication_documents
              : communication.daily_communication_documents
                ? [communication.daily_communication_documents]
                : [];
            const linkedSignatureId = signatureIdFromCommunication(communication);
            const linkedSignature = linkedSignatureId ? signatureRows.find((item) => item.id === linkedSignatureId) : undefined;

            return (
              <SelenCard key={communication.id}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                  <SelenCardTitle>{typeLabels[communication.communication_type] ?? communication.communication_type}</SelenCardTitle>
                  <div style={{ fontSize: 12, color: "var(--selen-text2)", marginBottom: 8, overflowWrap: "anywhere" }}>
                    {organisationMap.get(communication.organisation_id) ?? "Organisme"}
                    {formationTitle ? ` · ${formationTitle}` : ""}
                    {session?.internal_reference ? ` · ${session.internal_reference}` : ""}
                    {communication.sent_at ? ` · ${dateLabel(communication.sent_at)}` : ""}
                  </div>
                  <p style={{ margin: "6px 0", fontSize: 13, overflowWrap: "anywhere" }}><strong>Destinataire :</strong> {communication.recipient_name ? `${communication.recipient_name} · ` : ""}{communication.recipient_email}</p>
                  <p style={{ margin: "6px 0", fontSize: 13, overflowWrap: "anywhere" }}><strong>Objet :</strong> {communication.subject}</p>
                  <p style={{ margin: "6px 0", fontSize: 13, overflowWrap: "anywhere" }}><strong>Statut email :</strong> {statusLabels[communication.status] ?? communication.status}{communication.delivered_at ? ` · délivré ${dateLabel(communication.delivered_at)}` : ""}</p>
                  {linkedSignature ? <p style={{ margin: "6px 0", fontSize: 13, overflowWrap: "anywhere" }}><strong>État signature :</strong> {signatureBusinessLabel(linkedSignature, communication.communication_type === "convention_signature" ? communication : latestForSignature(communicationRows, linkedSignature.id))}</p> : null}
                  {communication.failed_at || communication.failure_reason ? <p style={{ margin: "6px 0", fontSize: 13, overflowWrap: "anywhere" }}><strong>Échec :</strong> {communication.failure_reason ?? dateLabel(communication.failed_at)}</p> : null}
                  <details style={{ marginTop: 10, minWidth: 0 }}>
                    <summary>Voir le contenu exact envoyé</summary>
                    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", maxWidth: "100%", fontFamily: "inherit", fontSize: 13, borderTop: "1px solid var(--selen-border)", paddingTop: 10 }}>{communication.text_body}</pre>
                  </details>
                  <div style={{ fontSize: 12, color: "var(--selen-text2)", marginTop: 10, overflowWrap: "anywhere" }}>
                    Prestataire : {communication.provider ?? "—"} · ID message : <span style={{ wordBreak: "break-all" }}>{communication.provider_message_id ?? "—"}</span> · ID Selen : <span style={{ wordBreak: "break-all" }}>{communication.id}</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <a href={`/agent/daily/communications/proof?communication_id=${encodeURIComponent(communication.id)}`}>Télécharger la preuve PDF</a>
                    {communication.session_id ? <Link href={`/agent/daily/session-dossiers/${communication.session_id}`}>Ouvrir le dossier de session</Link> : null}
                  </div>
                  {documents.length ? (
                    <div style={{ marginTop: 12, borderTop: "1px solid var(--selen-border)", paddingTop: 10, minWidth: 0 }}>
                      <strong style={{ fontSize: 13 }}>Documents rattachés à cet envoi</strong>
                      <div style={{ display: "grid", gap: 8, marginTop: 8, minWidth: 0 }}>
                        {documents.map((document) => (
                          <div key={`${communication.id}-${document.document_id}`} style={{ fontSize: 12, minWidth: 0, overflowWrap: "anywhere" }}>
                            <div>{document.logical_name || document.document_type} · version {document.document_version} · SHA-256 <code style={{ wordBreak: "break-all" }}>{document.sha256}</code></div>
                            <a href={`/agent/daily/communications/document?communication_id=${encodeURIComponent(communication.id)}&document_id=${encodeURIComponent(document.document_id)}`} style={{ display: "inline-block", marginTop: 4 }}>Télécharger cette version exacte</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </SelenCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
