import { jsPDF } from "jspdf";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export const runtime = "nodejs";

const typeLabels: Record<string, string> = {
  attendance_reminder: "Relance d’émargement",
  convocation: "Envoi de convocation",
  satisfaction_request: "Questionnaire de satisfaction",
  completion_certificate: "Certificat de réalisation",
};

const statusLabels: Record<string, string> = {
  queued: "En préparation",
  sent: "Envoyé",
  delivered: "Livré",
  bounced: "Rejeté",
  failed: "Échec",
};

const documentLabels: Record<string, string> = {
  training_program: "Programme",
  training_agreement: "Convention",
  convocation: "Convocation",
  registration_positioning: "Inscription & positionnement",
  attendance_summary: "Relevé des présences",
  completion_certificate: "Certificat de réalisation",
};

function formatDate(value?: string | null) {
  if (!value) return "Non renseigné";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(value));
}

function safeFilePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "communication";
}

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });

  const communicationId = new URL(req.url).searchParams.get("communication_id")?.trim();
  if (!communicationId) return Response.json({ error: "communication_id requis" }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: communication, error } = await admin
    .from("daily_communications")
    .select("id,communication_type,recipient_email,recipient_name,subject,text_body,provider,provider_message_id,status,sent_at,delivered_at,failed_at,failure_reason,created_at")
    .eq("id", communicationId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!communication) return Response.json({ error: "Communication introuvable." }, { status: 404 });

  const { data: documents, error: documentError } = await admin
    .from("daily_communication_documents")
    .select("document_type,logical_name,document_version,sha256,storage_path,created_at")
    .eq("communication_id", communication.id)
    .order("created_at", { ascending: true });

  if (documentError) return Response.json({ error: documentError.message }, { status: 500 });

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const left = 18;
  const right = 192;
  const width = right - left;
  let y = 20;

  const ensureSpace = (height = 12) => {
    if (y + height <= 278) return;
    pdf.addPage();
    y = 20;
  };

  const addLine = (label: string, value: string, options?: { boldValue?: boolean }) => {
    ensureSpace(10);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.text(`${label} :`, left, y);
    const labelWidth = pdf.getTextWidth(`${label} : `);
    pdf.setFont("helvetica", options?.boldValue ? "bold" : "normal");
    const lines = pdf.splitTextToSize(value || "Non renseigné", Math.max(40, width - labelWidth));
    pdf.text(lines, left + labelWidth, y);
    y += Math.max(5.5, lines.length * 4.7);
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(17);
  pdf.text("Selen Daily — preuve d’envoi", left, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Document généré depuis le registre de communications contrôlé par Selen Studio.", left, y);
  y += 10;

  addLine("Type", typeLabels[communication.communication_type] ?? communication.communication_type, { boldValue: true });
  addLine("Destinataire", communication.recipient_name ? `${communication.recipient_name} <${communication.recipient_email}>` : communication.recipient_email);
  addLine("Objet", communication.subject);
  addLine("Statut", statusLabels[communication.status] ?? communication.status, { boldValue: true });
  addLine("Envoyé le", formatDate(communication.sent_at));
  if (communication.delivered_at) addLine("Livré le", formatDate(communication.delivered_at));
  if (communication.failed_at) addLine("Échec le", formatDate(communication.failed_at));
  if (communication.failure_reason) addLine("Motif", communication.failure_reason);
  addLine("Prestataire", communication.provider || "Non renseigné");
  addLine("Identifiant prestataire", communication.provider_message_id || "Indisponible");
  addLine("Identifiant Selen", communication.id);

  y += 5;
  ensureSpace(18);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("Contenu exact du message", left, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  const bodyLines = pdf.splitTextToSize(communication.text_body || "(contenu texte indisponible)", width);
  for (const line of bodyLines) {
    ensureSpace(6);
    pdf.text(line, left, y);
    y += 4.7;
  }

  if (documents?.length) {
    y += 5;
    ensureSpace(18);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Document(s) rattaché(s) à l’envoi", left, y);
    y += 7;

    for (const document of documents) {
      ensureSpace(28);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.text(documentLabels[document.document_type] ?? document.logical_name ?? document.document_type, left, y);
      y += 5;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      pdf.text(`Version : ${document.document_version}`, left + 3, y);
      y += 4.5;
      const hashLines = pdf.splitTextToSize(`SHA-256 : ${document.sha256 || "indisponible"}`, width - 6);
      pdf.text(hashLines, left + 3, y);
      y += hashLines.length * 4.2;
      const pathLines = pdf.splitTextToSize(`Référence de stockage : ${document.storage_path}`, width - 6);
      pdf.text(pathLines, left + 3, y);
      y += pathLines.length * 4.2 + 4;
    }
  }

  ensureSpace(16);
  y += 4;
  pdf.setDrawColor(180);
  pdf.line(left, y, right, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  const footer = pdf.splitTextToSize(
    "Cette preuve restitue les informations figées dans le registre Selen Daily. Elle atteste des données d’envoi enregistrées par la plateforme ; elle ne constitue pas, à elle seule, une preuve de lecture par le destinataire.",
    width,
  );
  pdf.text(footer, left, y);

  const buffer = Buffer.from(pdf.output("arraybuffer"));
  const filename = `preuve-envoi-${safeFilePart(communication.communication_type)}-${communication.id.slice(0, 8)}.pdf`;

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
