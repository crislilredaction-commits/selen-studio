import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAgentNotification } from "@/lib/server/notifications";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const {
      dossierId,
      organisation_name,
      organisation_email,
      organisation_phone,
      representant_prenom,
      representant_nom,
      formateur_prenom,
      formateur_nom,
      formateur_email,
      formation_intitule,
      formation_duree,
      formation_tarif,
      formation_modalite,
    } = body;

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, organisation_id, status")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    if (!dossier.organisation_id) {
      return NextResponse.json(
        { error: "Aucune organisation liée à ce dossier." },
        { status: 400 },
      );
    }

    // 1) Mise à jour organisation : uniquement les vraies colonnes organisation
    const { error: organisationError } = await supabase
      .from("organisations")
      .update({
        name: organisation_name || null,
        email: organisation_email || null,
        phone: organisation_phone || null,
      })
      .eq("id", dossier.organisation_id);

    if (organisationError) {
      return NextResponse.json(
        { error: organisationError.message },
        { status: 500 },
      );
    }

    // 2) Variables métier réutilisables
    const ndaPayload = {
      dossier_id: dossierId,
      organisation_id: dossier.organisation_id,

      representant_prenom: representant_prenom || null,
      representant_nom: representant_nom || null,

      formateur_prenom: formateur_prenom || null,
      formateur_nom: formateur_nom || null,
      formateur_email: formateur_email || null,

      intitule_formation: formation_intitule || null,
      duree_formation: formation_duree || null,
      tarif_formation: formation_tarif || null,
      modalite: formation_modalite || null,

      nb_formateurs: 1,
    };

    const { error: ndaError } = await supabase
      .from("nda_variables")
      .upsert(ndaPayload, { onConflict: "dossier_id" });

    if (ndaError) {
      return NextResponse.json({ error: ndaError.message }, { status: 500 });
    }

    // 3) Avancement du dossier
    if (dossier.status === "draft" || dossier.status === "waiting_client") {
      const { error: statusError } = await supabase
        .from("dossiers")
        .update({ status: "collecting_documents" })
        .eq("id", dossierId);

      if (statusError) {
        return NextResponse.json(
          { error: statusError.message },
          { status: 500 },
        );
      }
    }

    // 4) Notification agent
    await createAgentNotification({
      supabase,
      dossierId,
      type: "client_uploaded_essential_documents",
      title: "Documents essentiels reçus",
      content:
        "Le client a complété l’étape 1 et transmis ses documents essentiels.",
    });

    return NextResponse.json({
      success: true,
      organisationId: dossier.organisation_id,
      dossierId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
