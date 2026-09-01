import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

const CATEGORIES = new Set([
  "question",
  "reclamation",
  "paiement",
  "acces",
  "bug",
  "audit",
  "nda",
  "daily",
  "autre",
]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json().catch(() => null);
    const clientName = clean(body?.clientName);
    const clientEmail = clean(body?.clientEmail).toLowerCase();
    const subject = clean(body?.subject);
    const message = clean(body?.message);
    const category = clean(body?.category) || "question";
    const priority = clean(body?.priority) || "normal";

    if (!isValidEmail(clientEmail)) {
      return NextResponse.json({ error: "Adresse email client invalide." }, { status: 400 });
    }
    if (!subject || !message) {
      return NextResponse.json({ error: "Sujet et message sont obligatoires." }, { status: 400 });
    }
    if (!CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
    }
    if (!PRIORITIES.has(priority)) {
      return NextResponse.json({ error: "Priorité invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const metadata = {
      source: "studio_manual_ticket",
      created_by_agent_email: auth.email,
    };

    const { data: ticket, error: ticketError } = await admin
      .from("support_tickets")
      .insert({
        client_email: clientEmail,
        client_name: clientName || null,
        subject,
        category,
        status: "open",
        priority,
        assigned_agent_email: auth.email,
        last_message_at: now,
        metadata,
      })
      .select("id")
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json(
        { error: ticketError?.message ?? "Ticket support non créé." },
        { status: 500 },
      );
    }

    const { error: messageError } = await admin.from("support_messages").insert({
      ticket_id: ticket.id,
      sender_type: "client",
      sender_email: clientEmail,
      message,
      metadata: {
        ...metadata,
        captured_by_agent: true,
        client_name: clientName || null,
      },
    });

    if (messageError) {
      await admin.from("support_tickets").delete().eq("id", ticket.id);
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, ticketId: ticket.id });
  } catch (error) {
    console.error("Création manuelle ticket support échouée.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
