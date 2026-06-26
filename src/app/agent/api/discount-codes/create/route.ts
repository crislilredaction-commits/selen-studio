import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

function eurosToCents(value: unknown) {
  const amount = Number(String(value ?? "").replace(",", ".").trim());
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const code = String(body.code ?? "").trim().toUpperCase();
    const type = String(body.type ?? "newsletter_public").trim();
    const discountType = String(body.discountType ?? "percent").trim();
    const percentOff =
      body.percentOff === null || body.percentOff === undefined
        ? null
        : Number(body.percentOff);
    const amountOffCents = eurosToCents(body.amountOff);
    const expiresAt = String(body.expiresAt ?? "").trim() || null;
    const maxGlobalUses =
      body.maxGlobalUses === null || body.maxGlobalUses === undefined
        ? null
        : Number(body.maxGlobalUses);
    const maxUsesPerEmail =
      body.maxUsesPerEmail === null || body.maxUsesPerEmail === undefined
        ? 1
        : Number(body.maxUsesPerEmail);
    const offerSlug = String(body.offerSlug ?? "").trim() || null;
    const internalComment = String(body.internalComment ?? "").trim();

    if (type !== "newsletter_public") {
      return NextResponse.json(
        { error: "Cette route cree uniquement des codes newsletter." },
        { status: 400 },
      );
    }
    if (!code || code.length < 3) {
      return NextResponse.json({ error: "Code requis." }, { status: 400 });
    }
    if (!["percent", "amount"].includes(discountType)) {
      return NextResponse.json({ error: "Type de reduction invalide." }, { status: 400 });
    }
    if (discountType === "percent" && (!percentOff || percentOff < 1 || percentOff > 100)) {
      return NextResponse.json({ error: "Pourcentage invalide." }, { status: 400 });
    }
    if (discountType === "amount" && !amountOffCents) {
      return NextResponse.json({ error: "Montant invalide." }, { status: 400 });
    }
    if (maxGlobalUses !== null && (!Number.isFinite(maxGlobalUses) || maxGlobalUses < 1)) {
      return NextResponse.json({ error: "Max utilisations globales invalide." }, { status: 400 });
    }
    if (!Number.isFinite(maxUsesPerEmail) || maxUsesPerEmail < 1) {
      return NextResponse.json({ error: "Max utilisations par email invalide." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("discount_codes")
      .insert({
        code,
        type,
        client_email: null,
        ticket_id: null,
        discount_type: discountType,
        percent_off: discountType === "percent" ? percentOff : null,
        amount_off_cents: discountType === "amount" ? amountOffCents : null,
        discount_percent: discountType === "percent" ? percentOff : null,
        discount_amount: discountType === "amount" ? amountOffCents : null,
        currency: "eur",
        status: "active",
        expires_at: expiresAt,
        offer_slug: offerSlug,
        max_global_uses: maxGlobalUses,
        max_uses_per_email: maxUsesPerEmail,
        created_by_agent_email: auth.email,
        metadata: {
          source: "studio_newsletter",
          internal_comment: internalComment,
        },
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, code: data });
  } catch (error) {
    console.error("Creation code newsletter echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
