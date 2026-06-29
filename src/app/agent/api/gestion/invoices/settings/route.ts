import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { eurosToCents } from "@/lib/server/lilInvoices";

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const recoveryFeeCents =
      eurosToCents(String(body.recoveryFee ?? "")) ??
      Number(body.recoveryFeeCents ?? 4000);

    const payload = {
      id: true,
      business_name: String(body.businessName ?? "").trim() || "Pascale Barthaux",
      activity: String(body.activity ?? "").trim() || "Auditrice Qualiopi",
      address: String(body.address ?? "").trim() || null,
      siren_siret: String(body.sirenSiret ?? "").trim() || null,
      rcs_rm_exemption: String(body.rcsRmExemption ?? "").trim() || null,
      phone: String(body.phone ?? "").trim() || null,
      email:
        String(body.email ?? "").trim().toLowerCase() || "hello@selen-editions.fr",
      paypal_email: String(body.paypalEmail ?? "").trim().toLowerCase() || null,
      iban: String(body.iban ?? "").trim() || null,
      bic: String(body.bic ?? "").trim() || null,
      vat_status:
        String(body.vatStatus ?? "").trim() ||
        "TVA non applicable, art. 293 B du CGI",
      late_penalty_rate:
        String(body.latePenaltyRate ?? "").trim() || "Taux legal en vigueur",
      recovery_fee_cents: Math.max(0, Math.round(recoveryFeeCents)),
      payment_terms:
        String(body.paymentTerms ?? "").trim() ||
        "Paiement a reception de facture",
      metadata: { updated_by: auth.email, updated_at: new Date().toISOString() },
    };

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("lil_invoice_settings")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    console.error("Sauvegarde parametres facture Lil echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
