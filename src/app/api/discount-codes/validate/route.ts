import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();

    if (!code) {
      return NextResponse.json({ valid: false, error: "Code requis." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("discount_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ valid: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ valid: false, error: "Code introuvable." });
    }
    if (data.status !== "active") {
      return NextResponse.json({ valid: false, error: "Code inactif." });
    }
    if (data.used_at) {
      return NextResponse.json({ valid: false, error: "Code deja utilise." });
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ valid: false, error: "Code expire." });
    }
    if (clientEmail && data.client_email.toLowerCase() !== clientEmail) {
      return NextResponse.json({
        valid: false,
        error: "Code reserve a un autre client.",
      });
    }

    return NextResponse.json({
      valid: true,
      code: data.code,
      discountType: data.discount_type,
      percentOff: data.percent_off,
      amountOffCents: data.amount_off_cents,
      currency: data.currency,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error("Validation code reduction echouee.", error);
    return NextResponse.json(
      { valid: false, error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
