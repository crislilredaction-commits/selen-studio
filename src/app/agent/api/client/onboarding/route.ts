import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const body = await req.json();

  const {
    organisation_name,
    organisation_email,
    organisation_phone,
    siret,
    formateur_prenom,
    formateur_nom,
    formateur_email,
    formation_intitule,
    formation_duree,
    formation_tarif,
    formation_modalite,
  } = body;

  // 1️⃣ retrouver ou créer l’organisation
  let organisationId: string | null = null;

  const { data: existing } = await supabase
    .from("organisations")
    .select("id")
    .eq("siret", siret)
    .maybeSingle();

  if (existing) {
    organisationId = existing.id;
  } else {
    const { data: created } = await supabase
      .from("organisations")
      .insert({
        name: organisation_name,
        email: organisation_email,
        phone: organisation_phone,
        siret,
      })
      .select("id")
      .single();

    organisationId = created?.id ?? null;
  }

  if (!organisationId) {
    return NextResponse.json({ error: "organisation error" }, { status: 500 });
  }

  // 2️⃣ créer dossier NDA
  const { data: dossier } = await supabase
    .from("dossiers")
    .insert({
      organisation_id: organisationId,
      type: "nda",
      title: formation_intitule || "Dossier NDA",
      status: "waiting_client",
    })
    .select("id")
    .single();

  const dossierId = dossier?.id;

  // 3️⃣ stocker variables NDA
  await supabase.from("nda_variables").insert({
    dossier_id: dossierId,
    formateur_prenom,
    formateur_nom,
    formateur_email,
    intitule_formation: formation_intitule,
    duree_formation: formation_duree,
    tarif: formation_tarif,
    modalite: formation_modalite,
  });

  return NextResponse.json({
    success: true,
    organisationId,
    dossierId,
  });
}
