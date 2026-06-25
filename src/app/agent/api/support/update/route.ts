import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  isActiveSupportAgentEmail,
  requireSupportAgent,
} from "@/app/agent/api/support/_utils";

const CATEGORIES = new Set([
  "question",
  "reclamation",
  "paiement",
  "acces",
  "bug",
  "audit",
  "nda",
  "autre",
]);
const STATUSES = new Set([
  "open",
  "waiting_agent",
  "waiting_client",
  "resolved",
  "closed",
]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const RESOLUTIONS = new Set([
  "",
  "resolved",
  "access_resent",
  "commercial_gesture",
  "refund",
  "duplicate",
  "other",
]);

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const ticketId = String(body.ticketId ?? "").trim();
    const category = String(body.category ?? "").trim();
    const status = String(body.status ?? "").trim();
    const priority = String(body.priority ?? "").trim();
    const resolutionType = String(body.resolutionType ?? "").trim();
    const hasAssignedAgentEmail = Object.prototype.hasOwnProperty.call(
      body,
      "assignedAgentEmail",
    );
    const assignedAgentEmail = String(body.assignedAgentEmail ?? "")
      .trim()
      .toLowerCase();

    if (!ticketId) {
      return NextResponse.json({ error: "ticketId requis." }, { status: 400 });
    }
    if (
      !CATEGORIES.has(category) ||
      !STATUSES.has(status) ||
      !PRIORITIES.has(priority) ||
      !RESOLUTIONS.has(resolutionType)
    ) {
      return NextResponse.json(
        { error: "Qualification support invalide." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const agentCheck = await isActiveSupportAgentEmail(admin, assignedAgentEmail);
    if (!agentCheck.ok) {
      return NextResponse.json(
        { error: agentCheck.error ?? "Agent traitant invalide." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: existingTicket, error: ticketError } = await admin
      .from("support_tickets")
      .select("closed_at, assigned_agent_email")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ error: ticketError.message }, { status: 500 });
    }
    if (!existingTicket) {
      return NextResponse.json({ error: "Ticket introuvable." }, { status: 404 });
    }

    const updatePayload: Record<string, string | null> = {
      category,
      status,
      priority,
      resolution_type: resolutionType || null,
      updated_at: now,
    };

    if (hasAssignedAgentEmail) {
      updatePayload.assigned_agent_email = assignedAgentEmail || null;
    }

    if (
      (status === "closed" || status === "resolved") &&
      !existingTicket.closed_at
    ) {
      updatePayload.closed_at = now;
    }

    if (
      (status === "closed" || status === "resolved") &&
      !assignedAgentEmail &&
      !existingTicket.assigned_agent_email
    ) {
      updatePayload.assigned_agent_email = auth.email;
    }

    const { error } = await admin
      .from("support_tickets")
      .update(updatePayload)
      .eq("id", ticketId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Mise a jour support echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
