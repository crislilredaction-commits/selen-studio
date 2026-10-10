import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";

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
  const admin = createSupabaseAdminClient();
  const { data: organisation, error: organisationError } = await admin.from("organisations").select("id,name").eq("id", organisationId).maybeSingle();
  if (organisationError || !organisation) return NextResponse.json({ error: "Organisme introuvable." }, { status: 404 });
  const rendered = renderSelenEmailFromText({ title: subject, bodyText: message });
  const { data: entry, error: logError } = await admin.from("daily_communications").insert({
    organisation_id: organisation.id, communication_type: "studio_manual_email", channel: "email",
    recipient_email: to, subject, text_body: rendered.text, html_body: rendered.html,
    status: "queued", created_by: auth.userId,
    metadata: { source: "studio_global_composer", agent_email: auth.email }
  }).select("id").single();
  if (logError || !entry) return NextResponse.json({ error: "Envoi interrompu : impossible de créer la trace d'historique." }, { status: 500 });
  try {
    const result = await sendClientEmailWithSilence({ supabase: admin, organisationId: organisation.id, to, subject, html: rendered.html, text: rendered.text });
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
