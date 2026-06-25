import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

function generateCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let index = 0; index < 6; index += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SELEN-${suffix}`;
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const ticketId = String(body.ticketId ?? "").trim() || null;
    const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
    const discountType = String(body.discountType ?? "percent").trim();
    const percentOff =
      body.percentOff === null || body.percentOff === undefined
        ? null
        : Number(body.percentOff);
    const amountOffCents =
      body.amountOffCents === null || body.amountOffCents === undefined
        ? null
        : Number(body.amountOffCents);
    const expiresAt = String(body.expiresAt ?? "").trim() || null;

    if (!clientEmail || !clientEmail.includes("@")) {
      return NextResponse.json({ error: "Email client invalide." }, { status: 400 });
    }
    if (!["percent", "amount"].includes(discountType)) {
      return NextResponse.json({ error: "Type de reduction invalide." }, { status: 400 });
    }
    if (discountType === "percent" && (!percentOff || percentOff < 1 || percentOff > 100)) {
      return NextResponse.json({ error: "Pourcentage invalide." }, { status: 400 });
    }
    if (discountType === "amount" && (!amountOffCents || amountOffCents < 1)) {
      return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    let lastError = "";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateCode();
      const { data, error } = await admin
        .from("discount_codes")
        .insert({
          code,
          client_email: clientEmail,
          ticket_id: ticketId,
          discount_type: discountType,
          percent_off: discountType === "percent" ? percentOff : null,
          amount_off_cents: discountType === "amount" ? amountOffCents : null,
          currency: "eur",
          status: "active",
          expires_at: expiresAt,
          created_by_agent_email: auth.email,
          metadata: { source: "studio_support" },
        })
        .select("*")
        .single();

      if (!error) {
        return NextResponse.json({ ok: true, code, discount: data });
      }

      lastError = error.message;
      if (!error.message.toLowerCase().includes("duplicate")) break;
    }

    return NextResponse.json({ error: lastError }, { status: 500 });
  } catch (error) {
    console.error("Creation code reduction echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
