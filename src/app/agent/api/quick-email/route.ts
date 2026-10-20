import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import {
  readStudioEmailAttachmentRefs,
  STUDIO_EMAIL_ATTACHMENT_BUCKET,
  type StudioEmailAttachmentRef,
} from "@/lib/studioEmailAttachments";

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("organisations").select("id,name,email").order("name").limit(500);
  if (error) return NextResponse.json({ error: "Impossible de charger les organismes." }, { status: 500 });
  return NextResponse.json({ organisations: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const organisationId = typeof body.organisationId === "string" ? body.organisationId.trim() : "";
  const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(organisationId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !message || subject.length > 200 || message.length > 20000) {
    return NextResponse.json({ error: "Renseigne un organisme, une adresse email valide, un objet et un message (20 000 caractères maximum)." }, { status: 400 });
  }
  const attachmentRefs = readStudioEmailAttachmentRefs(body.attachments ?? [], organisationId, auth.userId);
  if (!attachmentRefs) return NextResponse.json({ error: "La sélection de pièces jointes est invalide (5 fichiers et 20 Mo maximum)." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: organisation, error: organisationError } = await admin.from("organisations").select("id,name").eq("id", organisationId).maybeSingle();
  if (organisationError || !organisation) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });
  const preparedAttachments: { ref: StudioEmailAttachmentRef; content: Buffer; sha256: string }[] = [];
  for (const ref of attachmentRefs) {
    const { data, error } = await admin.storage.from(STUDIO_EMAIL_ATTACHMENT_BUCKET).download(ref.path);
    if (error || !data) return NextResponse.json({ error: `La pièce « ${ref.name} » est introuvable. Sélectionne-la à nouveau.` }, { status: 409 });
    const content = Buffer.from(await data.arrayBuffer());
    if (content.byteLength !== ref.sizeBytes) return NextResponse.json({ error: `La pièce « ${ref.name} » n’a pas la taille attendue.` }, { status: 409 });
    preparedAttachments.push({ ref, content, sha256: createHash("sha256").update(content).digest("hex") });
  }
  const rendered = renderSelenEmailFromText({ title: subject, bodyText: message });
  const { data: entry, error: logError } = await admin.from("daily_communications").insert({
    organisation_id: organisation.id, communication_type: "studio_manual_email", channel: "email",
    recipient_email: to, subject, text_body: rendered.text, html_body: rendered.html,
    status: "queued", created_by: auth.userId,
    metadata: { source: "studio_global_composer", agent_email: auth.email, attachments: preparedAttachments.map(item => ({ name: item.ref.name, mime_type: item.ref.mimeType, size_bytes: item.ref.sizeBytes, sha256: item.sha256 })) }
  }).select("id").single();
  if (logError || !entry) return NextResponse.json({ error: "Envoi interrompu : impossible de créer la trace d'historique." }, { status: 500 });
  if (preparedAttachments.length) {
    const { data: documents, error: documentError } = await admin.from("daily_documents").insert(preparedAttachments.map(item => ({
      organisation_id: organisation.id, document_type: "email_attachment", linked_object_type: "communication", linked_object_id: entry.id,
      version: 1, status: "published", logical_name: item.ref.name, bucket: STUDIO_EMAIL_ATTACHMENT_BUCKET, storage_path: item.ref.path,
      mime_type: item.ref.mimeType, size_bytes: item.ref.sizeBytes, sha256: item.sha256, created_by: auth.userId, updated_by: auth.userId,
      published_at: new Date().toISOString(), is_current: true, metadata: { source: "studio_global_composer", original_filename: item.ref.name },
    }))).select("id,document_type,logical_name,version,sha256,storage_path");
    if (documentError || !documents || documents.length !== preparedAttachments.length) {
      await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Archivage des pièces jointes impossible" }).eq("id", entry.id);
      return NextResponse.json({ error: "Envoi interrompu : les pièces jointes n’ont pas pu être archivées." }, { status: 500 });
    }
    const { error: linkError } = await admin.from("daily_communication_documents").insert(documents.map(document => ({
      communication_id: entry.id, document_id: document.id, document_type: document.document_type, logical_name: document.logical_name,
      document_version: document.version, sha256: document.sha256, storage_path: document.storage_path,
    })));
    if (linkError) {
      await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Rattachement des pièces jointes impossible" }).eq("id", entry.id);
      return NextResponse.json({ error: "Envoi interrompu : les pièces jointes n’ont pas pu être rattachées à l’historique." }, { status: 500 });
    }
  }
  try {
    const result = await sendClientEmailWithSilence({
      supabase: admin, organisationId: organisation.id, to, subject, html: rendered.html, text: rendered.text,
      attachments: preparedAttachments.map(item => ({ filename: item.ref.name, content: item.content, contentType: item.ref.mimeType })),
    });
    if (result.paused) {
      await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: result.error }).eq("id", entry.id);
      return NextResponse.json({ error: result.error }, { status: 409 });
    }
    const sent = result.sent === true;
    const { error: updateError } = await admin.from("daily_communications").update({
      status: sent ? "sent" : "failed",
      ...(sent ? { sent_at: new Date().toISOString(), provider_message_id: ("resendId" in result ? result.resendId : null) ?? null } : { failed_at: new Date().toISOString(), failure_reason: result.error ?? "Échec d'envoi" })
    }).eq("id", entry.id);
    if (updateError) return NextResponse.json({ error: "Résultat d'envoi non confirmé dans l'historique. Ne renvoie pas le message sans vérifier.", sent, communicationId: entry.id }, { status: 500 });
    if (!sent) return NextResponse.json({ error: result.error ?? "Email non envoyé." }, { status: 502 });
    return NextResponse.json({ sent: true, communicationId: entry.id });
  } catch {
    await admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Erreur d'envoi" }).eq("id", entry.id);
    return NextResponse.json({ error: "Envoi non confirmé. Vérifie l'historique avant de réessayer." }, { status: 502 });
  }
}
