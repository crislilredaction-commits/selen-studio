import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

function isExpired(expiresAt?: string | null) {
  return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const codeValue = String(body.code ?? "").trim().toUpperCase();
    const clientEmail = String(body.clientEmail ?? "").trim().toLowerCase();
    const offerSlug = String(body.offerSlug ?? "").trim();

    if (!codeValue || !clientEmail || !clientEmail.includes("@")) {
      return NextResponse.json(
        { error: "Code et email client valides requis." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: code, error: codeError } = await admin
      .from("discount_codes")
      .select("*")
      .eq("code", codeValue)
      .maybeSingle();

    if (codeError) {
      return NextResponse.json({ error: codeError.message }, { status: 500 });
    }
    if (!code || code.status !== "active") {
      return NextResponse.json({ error: "Code invalide." }, { status: 404 });
    }
    if (isExpired(code.expires_at)) {
      return NextResponse.json({ error: "Code expire." }, { status: 400 });
    }
    if (code.offer_slug && offerSlug && code.offer_slug !== offerSlug) {
      return NextResponse.json(
        { error: "Code non valable pour cette offre." },
        { status: 400 },
      );
    }

    if (code.type !== "newsletter_public") {
      if (code.client_email && code.client_email.toLowerCase() !== clientEmail) {
        return NextResponse.json(
          { error: "Code non valable pour cet email." },
          { status: 400 },
        );
      }
      if (code.used_at || code.status === "used") {
        return NextResponse.json({ error: "Code deja utilise." }, { status: 400 });
      }
    }

    const { count: globalCount, error: globalCountError } = await admin
      .from("discount_code_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_code_id", code.id);

    if (globalCountError) {
      return NextResponse.json({ error: globalCountError.message }, { status: 500 });
    }
    if (code.max_global_uses && (globalCount ?? 0) >= code.max_global_uses) {
      return NextResponse.json(
        { error: "Nombre maximal d'utilisations atteint." },
        { status: 400 },
      );
    }

    const { count: emailCount, error: emailCountError } = await admin
      .from("discount_code_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("discount_code_id", code.id)
      .eq("client_email", clientEmail);

    if (emailCountError) {
      return NextResponse.json({ error: emailCountError.message }, { status: 500 });
    }
    const maxPerEmail = code.max_uses_per_email ?? 1;
    if ((emailCount ?? 0) >= maxPerEmail) {
      return NextResponse.json(
        { error: "Code deja utilise par cet email." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { data: redemption, error: redemptionError } = await admin
      .from("discount_code_redemptions")
      .insert({
        discount_code_id: code.id,
        client_email: clientEmail,
        used_at: now,
        metadata: { offer_slug: offerSlug || null },
      })
      .select("*")
      .single();

    if (redemptionError) {
      return NextResponse.json({ error: redemptionError.message }, { status: 500 });
    }

    if (code.type !== "newsletter_public") {
      await admin
        .from("discount_codes")
        .update({
          status: "used",
          used_at: now,
          used_by_email: clientEmail,
        })
        .eq("id", code.id);
    } else if (
      code.max_global_uses &&
      (globalCount ?? 0) + 1 >= code.max_global_uses
    ) {
      await admin
        .from("discount_codes")
        .update({
          status: "used",
          used_at: now,
          metadata: {
            ...(code.metadata ?? {}),
            exhausted_at: now,
          },
        })
        .eq("id", code.id);
    }

    return NextResponse.json({
      ok: true,
      redemption,
      discount: {
        type: code.discount_type,
        percentOff: code.discount_percent ?? code.percent_off,
        amountOffCents: code.discount_amount ?? code.amount_off_cents,
        currency: code.currency ?? "eur",
      },
    });
  } catch (error) {
    console.error("Consommation code reduction echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
