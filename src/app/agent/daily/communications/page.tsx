import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
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
  return value ? new Date(value).toLocaleString("fr-FR") : "—";
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
  if (!reminder.due_at) return "Relance active";
  return new Date(reminder.due_at).getTime() <= Date.now() ? "Relance nécessaire" : "Relance prévue à H+72";
}

export default async function DailyCommunicationsPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const { session_id: sessionId } = await searchParams;
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("daily_communications")
    .select("id,organisation_id,session_id,enrolment_id,communication_type,recipient_email,recipient_name,subject,text_body,provider,provider_message_id,status,sent_at,delivered_at,failed_at,failure_reason,created_at,metadata,daily_communication_documents(document_id,document_type,logical_name,document_version,sha256,storage_path)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (sessionId) query = query.eq("session_id", sessionId);

  const { data: communications, error } = await query;
  if (error) throw new Error(error.message);

  const communicationRows = communications ?? [];
  const sessionIds = [...new Set(communicationRows.map((item) => item.session_id).filter(Boolean))] as string[];
  const organisationIds = [...new Set(communicationRows.map((item) => item.organisation_id).filter(Boolean))] as string[];

  let signatureQuery = admin
    .from("daily_convention_signatures")
    .select("id,convention_id,session_id,signatory_type,signatory_name,signatory_email,status,viewed_at,signed_at,expires_at,last_error,daily_conventions(id,document_name,recipient_type,recipient_name,recipient_email,company_name,version)")
    .order("created_at", { ascending: false })
    .limit(300);
  if (sessionId) signatureQuery = signatureQuery.eq("session_id", sessionId);
  else if (sessionIds.length) signatureQuery = signatureQuery.in("session_id", sessionIds);

  const [{ data: sessions }, { data: organisations }, { data: signatures, error: signatureError }] = await Promise.all([
    sessionIds.length
      ? admin.from("daily_sessions").select("id,internal_reference,formation_id").in("id", sessionIds)
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
      .eq("reminder_type", "daily_signature_pending_72h")
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
                  ? new Date(new Date(initial.sent_at).getTime() + 72 * 60 * 60 * 1000).toISOString()
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
                      {" · "}<strong>Échéance H+72 :</strong> {dateLabel(deadline)}
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

      {communicationRows.length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucune communication enregistrée</SelenCardTitle>
          <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Le registre est prêt ; les prochains envois Daily apparaîtront ici automatiquement.</p>
        </SelenCard>
      ) : (
        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          {communicationRows.map((communication) => {
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
