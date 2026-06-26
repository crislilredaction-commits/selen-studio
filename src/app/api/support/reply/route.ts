import { NextResponse } from "next/server";
import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ticketId = String(body.ticketId ?? body.ticket ?? "").trim();
    const token = String(body.token ?? "").trim();
    const message = String(body.message ?? "").trim();
    const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();

    if (!ticketId || !token || !message) {
      return NextResponse.json(
        { error: "ticketId, token et message sont requis." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("id, client_email, status")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }
    if (!ticket) {
      return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    }
    if (["resolved", "closed", "cancelled"].includes(String(ticket.status))) {
      return NextResponse.json(
        { error: "Ce ticket est cloture." },
        { status: 400 },
      );
    }

    const { data: replyToken, error: tokenError } = await admin
      .from("support_reply_tokens")
      .select("id, ticket_id, expires_at, used_at, revoked_at")
      .eq("ticket_id", ticketId)
      .eq("token_hash", hashToken(token))
      .maybeSingle();

    if (tokenError) {
      return NextResponse.json({ error: tokenError.message }, { status: 500 });
    }
    if (!replyToken || replyToken.revoked_at) {
      return NextResponse.json({ error: "Lien de reponse invalide." }, { status: 403 });
    }
    if (new Date(replyToken.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Lien de reponse expire." }, { status: 403 });
    }

    const now = new Date().toISOString();
    const senderEmail = clientEmail || ticket.client_email || null;
    const { error: messageError } = await admin.from("support_messages").insert({
      ticket_id: ticketId,
      sender_type: "client",
      sender_email: senderEmail,
      message,
      created_at: now,
    });

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    const { error: updateError } = await admin
      .from("support_tickets")
      .update({
        status: "waiting_agent",
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", ticketId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await admin
      .from("support_reply_tokens")
      .update({
        used_at: now,
        metadata: {
          last_used_at: now,
          last_sender_email: senderEmail,
        },
      })
      .eq("id", replyToken.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reponse publique support echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
