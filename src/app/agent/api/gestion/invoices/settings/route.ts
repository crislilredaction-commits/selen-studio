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
      legal_form:
        String(body.legalForm ?? "").trim() || "Entreprise Individuelle (EI)",
      activity: String(body.activity ?? "").trim() || "Auditrice Qualiopi",
      address: String(body.address ?? "").trim() || "2 Voie de Troyes",
      postal_code: String(body.postalCode ?? "").trim() || "10700",
      city: String(body.city ?? "").trim() || "Torcy-le-Petit",
      siren_siret: String(body.sirenSiret ?? "").trim() || "81772377800038",
      rcs_rm_exemption: String(body.rcsRmExemption ?? "").trim() || null,
      phone: String(body.phone ?? "").trim() || null,
      email:
        String(body.email ?? "").trim().toLowerCase() || "hello@selen-editions.fr",
      paypal_email: String(body.paypalEmail ?? "").trim().toLowerCase() || null,
      iban:
        String(body.iban ?? "").trim() ||
        "FR76 4061 8805 1100 0405 1327 975",
      bic: String(body.bic ?? "").trim() || null,
      vat_status:
        String(body.vatStatus ?? "").trim() ||
        "TVA non applicable, art. 293 B du CGI.",
      late_penalty_rate:
        String(body.latePenaltyRate ?? "").trim() || "Taux legal en vigueur",
      recovery_fee_cents: Math.max(0, Math.round(recoveryFeeCents)),
      payment_terms:
        String(body.paymentTerms ?? "").trim() ||
        "Paiement a reception de facture",
      legal_mentions:
        String(body.legalMentions ?? "").trim() ||
        "Dispensé d'immatriculation au Registre du Commerce et des Sociétés (RCS) ainsi qu'au Registre National des Entreprises (RNE), conformément à l'article L.123-1-1 du Code de commerce.",
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
