import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();

    const body = await req.json();
    const { dossierId, ...rawValues } = body;

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, organisation_id, type")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError) {
      return NextResponse.json({ error: dossierError.message }, { status: 500 });
    }

    if (!dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const payload = {
      dossier_id: dossierId,
      organisation_id: dossier.organisation_id ?? null,
      representant_prenom: rawValues.representant_prenom ?? null,
      representant_nom: rawValues.representant_nom ?? null,
      formateur_nom: rawValues.formateur_nom ?? null,
      formateur_prenom: rawValues.formateur_prenom ?? null,
      formateur_email: rawValues.formateur_email ?? null,
      intitule_formation: rawValues.intitule_formation ?? null,
      duree_formation: rawValues.duree_formation ?? null,
      tarif_formation: rawValues.tarif_formation ?? null,
      modalite: rawValues.modalite ?? null,
      nb_formateurs:
        typeof rawValues.nb_formateurs === "number"
          ? rawValues.nb_formateurs
          : rawValues.nb_formateurs
            ? Number(rawValues.nb_formateurs)
            : null,
      ville: rawValues.ville ?? null,
      code_postal: rawValues.code_postal ?? null,
      region: rawValues.region ?? null,
      siret: rawValues.siret ?? null,
    };

    const { error } = await supabase
      .from("nda_variables")
      .upsert(payload, { onConflict: "dossier_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
