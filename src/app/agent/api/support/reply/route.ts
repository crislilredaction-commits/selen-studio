import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { ticketId, message } = await req.json();
    const cleanTicketId = String(ticketId ?? "").trim();
    const cleanMessage = String(message ?? "").trim();

    if (!cleanTicketId || !cleanMessage) {
      return NextResponse.json(
        { error: "ticketId et message sont requis." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .select("id, subject, client_email, client_name, assigned_agent_email")
      .eq("id", cleanTicketId)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }
    if (!ticket) {
      return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: messageError } = await admin.from("support_messages").insert({
      ticket_id: cleanTicketId,
      sender_type: "agent",
      sender_email: auth.email,
      message: cleanMessage,
      created_at: now,
    });

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    const updatePayload: Record<string, string> = {
      status: "waiting_client",
      last_message_at: now,
      updated_at: now,
    };

    if (!ticket.assigned_agent_email) {
      updatePayload.assigned_agent_email = auth.email;
    }

    const { error: updateError } = await admin
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", cleanTicketId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const rendered = renderSelenEmailFromText({
      title: `Reponse de Selen - ${ticket.subject}`,
      bodyText: [
        "Bonjour,",
        cleanMessage,
        "Vous pouvez repondre depuis votre espace client ou reprendre contact avec Selen.",
      ].join("\n\n"),
    });

    const emailResult = await sendSelenEmail({
      to: ticket.client_email,
      subject: `Reponse de Selen - ${ticket.subject}`,
      html: rendered.html,
      text: rendered.text,
    });

    return NextResponse.json({ ok: true, email: emailResult });
  } catch (error) {
    console.error("Reponse support echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
