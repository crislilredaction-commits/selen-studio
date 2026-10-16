import { NextRequest, NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { deterministicAttendanceFollowupId, normalizeAttendanceReminderEmail, prepareAttendanceRegularizationReminder } from "@/lib/server/dailyAttendanceRegularizationReminder";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function emailHtml(value: string) {
  const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  return `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escaped}</div>`;
}

export async function POST(request: NextRequest) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requête invalide." }, { status: 400 }); }
  const sessionId = String(body.sessionId ?? "").trim();
  const enrolmentId = String(body.enrolmentId ?? "").trim();
  const slotId = String(body.slotId ?? "").trim();
  const recipientEmail = normalizeAttendanceReminderEmail(body.recipientEmail);
  if (![sessionId, enrolmentId, slotId].every((value) => UUID.test(value))) return NextResponse.json({ error: "Identifiants invalides." }, { status: 400 });
  if (body.confirmedRecipient !== true || body.confirmedSend !== true) return NextResponse.json({ error: "Les deux confirmations humaines sont requises avant l’envoi." }, { status: 400 });

  const prepared = await prepareAttendanceRegularizationReminder({ agentEmail: auth.email, sessionId, enrolmentId, slotId, recipientEmail });
  if (!prepared.ok) return NextResponse.json({ error: prepared.error }, { status: prepared.status });
  const idempotencyKey = `attendance-regularization-followup:v1:${sessionId}:${enrolmentId}:${slotId}:${prepared.canonicalEmail}:${prepared.cycle}`;
  const communicationId = deterministicAttendanceFollowupId(idempotencyKey);
  const evidence = {
    id: communicationId,
    organisation_id: prepared.session.organisation_id,
    session_id: sessionId,
    enrolment_id: enrolmentId,
    communication_type: "attendance_regularization_followup",
    channel: "email",
    recipient_email: prepared.canonicalEmail,
    recipient_name: prepared.learnerName,
    subject: prepared.email.subject,
    text_body: prepared.email.body,
    html_body: emailHtml(prepared.email.body),
    provider: "resend",
    status: "queued",
    created_by: auth.userId,
    metadata: { attendance_slot_id: slotId, review_cycle: prepared.cycle, idempotency_key: idempotencyKey, template_version: 1, manual: true },
  };
  const { error: evidenceError } = await prepared.admin.from("daily_communications").insert(evidence);
  if (evidenceError?.code === "23505") {
    const { data: existing, error: existingError } = await prepared.admin.from("daily_communications").select("id,status").eq("id", communicationId).maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: "La preuve d’envoi existante est indisponible." }, { status: 503 });
    if (["sent", "delivered"].includes(existing.status)) return NextResponse.json({ ok: true, sent: true, deduplicated: true, communicationId });
    if (existing.status === "queued") return NextResponse.json({ error: "Un envoi identique est déjà en cours." }, { status: 409 });
    const { data: claimed, error: claimError } = await prepared.admin.from("daily_communications").update({ status: "queued", failed_at: null, failure_reason: null }).eq("id", communicationId).eq("status", "failed").select("id").maybeSingle();
    if (claimError || !claimed) return NextResponse.json({ error: "Cette relance ne peut pas être réessayée maintenant." }, { status: 409 });
  } else if (evidenceError) {
    return NextResponse.json({ error: "La preuve préalable n’a pas pu être créée ; aucun email envoyé." }, { status: 503 });
  }

  const rechecked = await prepareAttendanceRegularizationReminder({ agentEmail: auth.email, sessionId, enrolmentId, slotId, recipientEmail });
  if (!rechecked.ok || rechecked.cycle !== prepared.cycle) {
    const reason = !rechecked.ok ? rechecked.error : "Le cycle de validation a changé avant l’envoi.";
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId).eq("status", "queued");
    return NextResponse.json({ error: `${reason} Aucun email envoyé.` }, { status: 409 });
  }
  const { data: refreshedEvidence, error: refreshError } = await prepared.admin.from("daily_communications").update({
    recipient_name: rechecked.learnerName,
    subject: rechecked.email.subject,
    text_body: rechecked.email.body,
    html_body: emailHtml(rechecked.email.body),
    metadata: { attendance_slot_id: slotId, review_cycle: rechecked.cycle, idempotency_key: idempotencyKey, template_version: 1, manual: true },
  }).eq("id", communicationId).eq("status", "queued").select("id").maybeSingle();
  if (refreshError || !refreshedEvidence) {
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "La preuve exacte n’a pas pu être rafraîchie avant transport." }).eq("id", communicationId).eq("status", "queued");
    return NextResponse.json({ error: "La preuve exacte n’a pas pu être rafraîchie ; aucun email envoyé." }, { status: 503 });
  }

  let delivery: Awaited<ReturnType<typeof sendClientEmailWithSilence>>;
  try {
    delivery = await sendClientEmailWithSilence({ supabase: rechecked.admin, organisationId: rechecked.session.organisation_id, email: rechecked.canonicalEmail, to: rechecked.canonicalEmail, subject: rechecked.email.subject, html: emailHtml(rechecked.email.body), text: rechecked.email.body });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Échec du transport email.";
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId);
    return NextResponse.json({ error: reason }, { status: 502 });
  }
  if (!delivery.sent) {
    const reason = delivery.error ?? "Email non envoyé.";
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId);
    return NextResponse.json({ error: reason, paused: delivery.paused }, { status: delivery.paused ? 409 : 502 });
  }
  const providerMessageId = "resendId" in delivery ? delivery.resendId ?? null : null;
  const { data: finalized, error: finalError } = await prepared.admin.from("daily_communications").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: providerMessageId, failed_at: null, failure_reason: null }).eq("id", communicationId).eq("status", "queued").select("id").maybeSingle();
  if (finalError || !finalized) return NextResponse.json({ error: "Email envoyé, mais la finalisation de la preuve a échoué. Ne pas renvoyer avant vérification manuelle.", communicationId }, { status: 503 });
  return NextResponse.json({ ok: true, sent: true, deduplicated: false, communicationId });
}
