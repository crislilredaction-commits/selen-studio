import { NextRequest, NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { buildAttendanceRegularizationEmail, buildDirectAttendanceCorrectionUrl } from "@/lib/daily/attendanceRegularizationLink";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { createAttendanceCorrectionAccess, deterministicAttendanceFollowupId, normalizeAttendanceReminderEmail, prepareAttendanceRegularizationReminder } from "@/lib/server/dailyAttendanceRegularizationReminder";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

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
  const initialEmail = prepared.email ?? {
    subject: "Action requise : corriger votre émargement",
    body: "Préparation du lien individuel de correction en cours.",
  };
  const evidence = {
    id: communicationId,
    organisation_id: prepared.session.organisation_id,
    session_id: sessionId,
    enrolment_id: enrolmentId,
    communication_type: "attendance_regularization_followup",
    channel: "email",
    recipient_email: prepared.canonicalEmail,
    recipient_name: prepared.learnerName,
    subject: initialEmail.subject,
    text_body: initialEmail.body,
    html_body: emailHtml(initialEmail.body),
    provider: "resend",
    status: "queued",
    created_by: auth.userId,
    metadata: { attendance_slot_id: slotId, review_cycle: prepared.cycle, idempotency_key: idempotencyKey, template_version: prepared.correction ? 2 : 1, manual: true },
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
  let finalState = rechecked;
  let deliveryEmail = rechecked.email;
  let correctionAccessId: string | null = null;
  let correctionAccessExpiresAt: string | null = null;
  if (rechecked.correction) {
    const access = createAttendanceCorrectionAccess();
    const { error: revokeError } = await rechecked.admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("organisation_id", rechecked.session.organisation_id).eq("slot_id", slotId).eq("enrolment_id", enrolmentId).eq("status", "active");
    if (revokeError) {
      await rechecked.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: revokeError.message }).eq("id", communicationId).eq("status", "queued");
      return NextResponse.json({ error: "Les anciens accès d’émargement n’ont pas pu être révoqués ; aucun email envoyé." }, { status: 503 });
    }
    const { data: createdAccess, error: accessError } = await rechecked.admin.from("daily_attendance_access_tokens").insert({
      organisation_id: rechecked.session.organisation_id,
      session_id: sessionId,
      slot_id: slotId,
      enrolment_id: enrolmentId,
      token_hash: access.tokenHash,
      access_type: "individual",
      channel: "link",
      status: "active",
      expires_at: access.expiresAt,
      created_by: auth.userId,
    }).select("id").single();
    const directUrl = buildDirectAttendanceCorrectionUrl(getVitrineBaseUrl(), access.token);
    deliveryEmail = directUrl ? buildAttendanceRegularizationEmail({ learnerName: rechecked.learnerName, slotLabel: rechecked.slotLabel, url: directUrl, expiresAt: access.expiresAt, correction: rechecked.correction }) : null;
    if (accessError || !createdAccess || !deliveryEmail) {
      if (createdAccess) await rechecked.admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", createdAccess.id).eq("status", "active");
      await rechecked.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: accessError?.message ?? "Lien de correction impossible à créer." }).eq("id", communicationId).eq("status", "queued");
      return NextResponse.json({ error: "Le lien individuel de correction n’a pas pu être créé ; aucun email envoyé." }, { status: 503 });
    }
    correctionAccessId = createdAccess.id;
    correctionAccessExpiresAt = access.expiresAt;
    const finalCheck = await prepareAttendanceRegularizationReminder({ agentEmail: auth.email, sessionId, enrolmentId, slotId, recipientEmail });
    if (!finalCheck.ok || finalCheck.cycle !== rechecked.cycle || finalCheck.canonicalEmail !== rechecked.canonicalEmail || finalCheck.correction?.version !== rechecked.correction.version || finalCheck.correction?.reason !== rechecked.correction.reason) {
      const reason = !finalCheck.ok ? finalCheck.error : "Le cycle ou le destinataire a changé avant l’envoi.";
      await Promise.all([
        rechecked.admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", createdAccess.id).eq("status", "active"),
        rechecked.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId).eq("status", "queued"),
      ]);
      return NextResponse.json({ error: `${reason} Aucun email envoyé.` }, { status: 409 });
    }
    finalState = finalCheck;
  }
  if (!deliveryEmail) {
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "Modèle d’email indisponible." }).eq("id", communicationId).eq("status", "queued");
    return NextResponse.json({ error: "Le modèle d’email est indisponible ; aucun email envoyé." }, { status: 503 });
  }
  const revokeCorrectionAccess = async () => {
    if (correctionAccessId) await finalState.admin.from("daily_attendance_access_tokens").update({ status: "revoked" }).eq("id", correctionAccessId).eq("status", "active");
  };
  const { data: refreshedEvidence, error: refreshError } = await finalState.admin.from("daily_communications").update({
    recipient_name: finalState.learnerName,
    subject: deliveryEmail.subject,
    text_body: deliveryEmail.body,
    html_body: emailHtml(deliveryEmail.body),
    metadata: {
      attendance_slot_id: slotId,
      review_cycle: finalState.cycle,
      idempotency_key: idempotencyKey,
      template_version: finalState.correction ? 2 : 1,
      manual: true,
      ...(finalState.correction ? { review_version: String(finalState.correction.version), correction_reason: finalState.correction.reason, attendance_access_token_id: correctionAccessId, token_expires_at: correctionAccessExpiresAt } : {}),
    },
  }).eq("id", communicationId).eq("status", "queued").select("id").maybeSingle();
  if (refreshError || !refreshedEvidence) {
    await revokeCorrectionAccess();
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: "La preuve exacte n’a pas pu être rafraîchie avant transport." }).eq("id", communicationId).eq("status", "queued");
    return NextResponse.json({ error: "La preuve exacte n’a pas pu être rafraîchie ; aucun email envoyé." }, { status: 503 });
  }

  let delivery: Awaited<ReturnType<typeof sendClientEmailWithSilence>>;
  try {
    delivery = await sendClientEmailWithSilence({ supabase: finalState.admin, organisationId: finalState.session.organisation_id, email: finalState.canonicalEmail, to: finalState.canonicalEmail, subject: deliveryEmail.subject, html: emailHtml(deliveryEmail.body), text: deliveryEmail.body });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Échec du transport email.";
    await revokeCorrectionAccess();
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId);
    return NextResponse.json({ error: reason }, { status: 502 });
  }
  if (!delivery.sent) {
    const reason = delivery.error ?? "Email non envoyé.";
    await revokeCorrectionAccess();
    await prepared.admin.from("daily_communications").update({ status: "failed", failed_at: new Date().toISOString(), failure_reason: reason }).eq("id", communicationId);
    return NextResponse.json({ error: reason, paused: delivery.paused }, { status: delivery.paused ? 409 : 502 });
  }
  const providerMessageId = "resendId" in delivery ? delivery.resendId ?? null : null;
  const { data: finalized, error: finalError } = await prepared.admin.from("daily_communications").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: providerMessageId, failed_at: null, failure_reason: null }).eq("id", communicationId).eq("status", "queued").select("id").maybeSingle();
  if (finalError || !finalized) return NextResponse.json({ error: "Email envoyé, mais la finalisation de la preuve a échoué. Ne pas renvoyer avant vérification manuelle.", communicationId }, { status: 503 });
  return NextResponse.json({ ok: true, sent: true, deduplicated: false, communicationId });
}
