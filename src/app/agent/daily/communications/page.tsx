import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Props = {
  searchParams: Promise<{ session_id?: string }>;
};

const typeLabels: Record<string, string> = {
  attendance_reminder: "Relance d’émargement",
  convocation: "Convocation",
  satisfaction_request: "Questionnaire de satisfaction",
  completion_certificate: "Certificat de réalisation",
};

const statusLabels: Record<string, string> = {
  sent: "Envoyé",
  delivered: "Livré",
  failed: "Échec",
  bounced: "Rejeté",
};

export default async function DailyCommunicationsPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;

  const { session_id: sessionId } = await searchParams;
  const admin = createSupabaseAdminClient();

  let query = admin
    .from("daily_communications")
    .select("id,organisation_id,session_id,enrolment_id,communication_type,recipient_email,recipient_name,subject,text_body,provider,provider_message_id,status,sent_at,delivered_at,failed_at,failure_reason,created_at,daily_communication_documents(document_id,document_type,logical_name,document_version,sha256,storage_path)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (sessionId) query = query.eq("session_id", sessionId);

  const { data: communications, error } = await query;
  if (error) throw new Error(error.message);

  const sessionIds = [...new Set((communications ?? []).map((item) => item.session_id).filter(Boolean))] as string[];
  const organisationIds = [...new Set((communications ?? []).map((item) => item.organisation_id).filter(Boolean))] as string[];

  const [{ data: sessions }, { data: organisations }] = await Promise.all([
    sessionIds.length
      ? admin.from("daily_sessions").select("id,internal_reference,formation_id").in("id", sessionIds)
      : Promise.resolve({ data: [] }),
    organisationIds.length
      ? admin.from("organisations").select("id,name").in("id", organisationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const formationIds = [...new Set((sessions ?? []).map((item) => item.formation_id).filter(Boolean))] as string[];
  const { data: formations } = formationIds.length
    ? await admin.from("daily_formations").select("id,title").in("id", formationIds)
    : { data: [] as { id: string; title: string }[] };

  const sessionMap = new Map((sessions ?? []).map((item) => [item.id, item]));
  const organisationMap = new Map((organisations ?? []).map((item) => [item.id, item.name]));
  const formationMap = new Map((formations ?? []).map((item) => [item.id, item.title]));

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Communications & preuves</h1>
          <p style={{ marginTop: 0, color: "var(--selen-text2)" }}>
            Historique exact des communications Daily conservées comme preuves d’audit.
          </p>
        </div>
        {sessionId ? <Link href="/agent/daily/communications">Voir tout l’historique</Link> : null}
      </div>

      {sessionId ? (
        <p style={{ padding: 10, border: "1px solid var(--selen-border)", borderRadius: 10 }}>
          Filtre actif : session <code>{sessionId}</code>
        </p>
      ) : null}

      {(communications ?? []).length === 0 ? (
        <SelenCard>
          <SelenCardTitle>Aucune communication enregistrée</SelenCardTitle>
          <p style={{ color: "var(--selen-text2)", marginBottom: 0 }}>Le registre est prêt ; les prochains envois Daily apparaîtront ici automatiquement.</p>
        </SelenCard>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {(communications ?? []).map((communication) => {
            const session = communication.session_id ? sessionMap.get(communication.session_id) : undefined;
            const formationTitle = session?.formation_id ? formationMap.get(session.formation_id) : undefined;
            const documents = Array.isArray(communication.daily_communication_documents)
              ? communication.daily_communication_documents
              : communication.daily_communication_documents
                ? [communication.daily_communication_documents]
                : [];

            return (
              <SelenCard key={communication.id}>
                <SelenCardTitle>{typeLabels[communication.communication_type] ?? communication.communication_type}</SelenCardTitle>
                <div style={{ fontSize: 12, color: "var(--selen-text2)", marginBottom: 8 }}>
                  {organisationMap.get(communication.organisation_id) ?? "Organisme"}
                  {formationTitle ? ` · ${formationTitle}` : ""}
                  {session?.internal_reference ? ` · ${session.internal_reference}` : ""}
                  {communication.sent_at ? ` · ${new Date(communication.sent_at).toLocaleString("fr-FR")}` : ""}
                </div>
                <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Destinataire :</strong> {communication.recipient_name ? `${communication.recipient_name} · ` : ""}{communication.recipient_email}</p>
                <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Objet :</strong> {communication.subject}</p>
                <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Statut :</strong> {statusLabels[communication.status] ?? communication.status}{communication.delivered_at ? ` · livré ${new Date(communication.delivered_at).toLocaleString("fr-FR")}` : ""}</p>
                {communication.failed_at || communication.failure_reason ? <p style={{ margin: "6px 0", fontSize: 13 }}><strong>Échec :</strong> {communication.failure_reason ?? new Date(communication.failed_at).toLocaleString("fr-FR")}</p> : null}
                <details style={{ marginTop: 10 }}>
                  <summary>Voir le contenu exact envoyé</summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, borderTop: "1px solid var(--selen-border)", paddingTop: 10 }}>{communication.text_body}</pre>
                </details>
                <div style={{ fontSize: 12, color: "var(--selen-text2)", marginTop: 10 }}>
                  Prestataire : {communication.provider ?? "—"} · ID message : {communication.provider_message_id ?? "—"} · ID Selen : {communication.id}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                  <a href={`/agent/daily/communications/proof?communication_id=${encodeURIComponent(communication.id)}`}>Télécharger la preuve PDF</a>
                  {communication.session_id ? <Link href={`/agent/daily/session-dossiers/${communication.session_id}`}>Ouvrir le dossier de session</Link> : null}
                </div>
                {documents.length ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--selen-border)", paddingTop: 10 }}>
                    <strong style={{ fontSize: 13 }}>Documents rattachés à cet envoi</strong>
                    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      {documents.map((document) => (
                        <div key={`${communication.id}-${document.document_id}`} style={{ fontSize: 12 }}>
                          {document.logical_name || document.document_type} · version {document.document_version} · SHA-256 <code>{document.sha256}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </SelenCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
