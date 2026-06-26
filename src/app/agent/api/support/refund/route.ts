import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  requireLilOwner,
  requireSupportAgent,
} from "@/app/agent/api/support/_utils";

const REFUND_STATUSES = new Set([
  "to_process",
  "processed",
  "refused",
  "cancelled",
]);

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "create");
    const admin = createSupabaseAdminClient();

    if (action === "create") {
      const ticketId = String(body.ticketId ?? "").trim() || null;
      const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
      const amountCents =
        body.amountCents === null || body.amountCents === undefined
          ? null
          : Number(body.amountCents);
      const reason = String(body.reason ?? "").trim();
      const stripePaymentIntentId =
        String(body.stripePaymentIntentId ?? "").trim() || null;

      if (!clientEmail || !clientEmail.includes("@")) {
        return NextResponse.json({ error: "Email client invalide." }, { status: 400 });
      }
      if (!reason) {
        return NextResponse.json({ error: "Motif requis." }, { status: 400 });
      }
      if (amountCents !== null && amountCents < 1) {
        return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
      }

      const { data, error } = await admin
        .from("support_refund_requests")
        .insert({
          ticket_id: ticketId,
          client_email: clientEmail,
          amount_cents: amountCents,
          currency: "eur",
          reason,
          status: "to_process",
          stripe_payment_intent_id: stripePaymentIntentId,
          created_by_agent_email: auth.email,
          metadata: { source: "studio_support" },
        })
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, refund: data });
    }

    const adminAuth = await requireLilOwner();
    if (!adminAuth.ok) {
      return NextResponse.json(
        { error: adminAuth.error },
        { status: adminAuth.status },
      );
    }

    const refundId = String(body.refundId ?? "").trim();
    const status = String(body.status ?? "").trim();
    const stripeRefundId = String(body.stripeRefundId ?? "").trim() || null;

    if (!refundId) {
      return NextResponse.json({ error: "refundId requis." }, { status: 400 });
    }
    if (!REFUND_STATUSES.has(status)) {
      return NextResponse.json({ error: "Statut remboursement invalide." }, { status: 400 });
    }

    const payload: Record<string, string | null> = { status };
    if (status === "processed") {
      payload.processed_by_agent_email = adminAuth.email;
      payload.processed_at = new Date().toISOString();
      payload.stripe_refund_id = stripeRefundId;
    }

    const { data, error } = await admin
      .from("support_refund_requests")
      .update(payload)
      .eq("id", refundId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, refund: data });
  } catch (error) {
    console.error("Action remboursement support echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
