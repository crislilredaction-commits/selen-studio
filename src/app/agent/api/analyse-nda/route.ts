import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function extractPostalCodeAndCity(address?: string | null) {
  if (!address) {
    return { code_postal: "", ville: "" };
  }

  const cpMatch = address.match(/\b\d{5}\b/);
  const code_postal = cpMatch?.[0] ?? "";

  if (!code_postal) {
    return { code_postal: "", ville: "" };
  }

  const afterPostal = address.split(code_postal)[1] ?? "";
  const ville = afterPostal.replace(/^[\s,\-]+/, "").trim();

  return {
    code_postal,
    ville,
  };
}

function getRegionFromPostalCode(codePostal?: string | null) {
  if (!codePostal || codePostal.length < 2) return "";

  const dept = codePostal.slice(0, 2);

  const regionMap: Record<string, string> = {
    "01": "Auvergne-Rhône-Alpes",
    "02": "Hauts-de-France",
    "03": "Auvergne-Rhône-Alpes",
    "04": "Provence-Alpes-Côte d’Azur",
    "05": "Provence-Alpes-Côte d’Azur",
    "06": "Provence-Alpes-Côte d’Azur",
    "07": "Auvergne-Rhône-Alpes",
    "08": "Grand Est",
    "09": "Occitanie",
    "10": "Grand Est",
    "11": "Occitanie",
    "12": "Occitanie",
    "13": "Provence-Alpes-Côte d’Azur",
    "14": "Normandie",
    "15": "Auvergne-Rhône-Alpes",
    "16": "Nouvelle-Aquitaine",
    "17": "Nouvelle-Aquitaine",
    "18": "Centre-Val de Loire",
    "19": "Nouvelle-Aquitaine",
    "21": "Bourgogne-Franche-Comté",
    "22": "Bretagne",
    "23": "Nouvelle-Aquitaine",
    "24": "Nouvelle-Aquitaine",
    "25": "Bourgogne-Franche-Comté",
    "26": "Auvergne-Rhône-Alpes",
    "27": "Normandie",
    "28": "Centre-Val de Loire",
    "29": "Bretagne",
    "30": "Occitanie",
    "31": "Occitanie",
    "32": "Occitanie",
    "33": "Nouvelle-Aquitaine",
    "34": "Occitanie",
    "35": "Bretagne",
    "36": "Centre-Val de Loire",
    "37": "Centre-Val de Loire",
    "38": "Auvergne-Rhône-Alpes",
    "39": "Bourgogne-Franche-Comté",
    "40": "Nouvelle-Aquitaine",
    "41": "Centre-Val de Loire",
    "42": "Auvergne-Rhône-Alpes",
    "43": "Auvergne-Rhône-Alpes",
    "44": "Pays de la Loire",
    "45": "Centre-Val de Loire",
    "46": "Occitanie",
    "47": "Nouvelle-Aquitaine",
    "48": "Occitanie",
    "49": "Pays de la Loire",
    "50": "Normandie",
    "51": "Grand Est",
    "52": "Grand Est",
    "53": "Pays de la Loire",
    "54": "Grand Est",
    "55": "Grand Est",
    "56": "Bretagne",
    "57": "Grand Est",
    "58": "Bourgogne-Franche-Comté",
    "59": "Hauts-de-France",
    "60": "Hauts-de-France",
    "61": "Normandie",
    "62": "Hauts-de-France",
    "63": "Auvergne-Rhône-Alpes",
    "64": "Nouvelle-Aquitaine",
    "65": "Occitanie",
    "66": "Occitanie",
    "67": "Grand Est",
    "68": "Grand Est",
    "69": "Auvergne-Rhône-Alpes",
    "70": "Bourgogne-Franche-Comté",
    "71": "Bourgogne-Franche-Comté",
    "72": "Pays de la Loire",
    "73": "Auvergne-Rhône-Alpes",
    "74": "Auvergne-Rhône-Alpes",
    "75": "Île-de-France",
    "76": "Normandie",
    "77": "Île-de-France",
    "78": "Île-de-France",
    "79": "Nouvelle-Aquitaine",
    "80": "Hauts-de-France",
    "81": "Occitanie",
    "82": "Occitanie",
    "83": "Provence-Alpes-Côte d’Azur",
    "84": "Provence-Alpes-Côte d’Azur",
    "85": "Pays de la Loire",
    "86": "Nouvelle-Aquitaine",
    "87": "Nouvelle-Aquitaine",
    "88": "Grand Est",
    "89": "Bourgogne-Franche-Comté",
    "90": "Bourgogne-Franche-Comté",
    "91": "Île-de-France",
    "92": "Île-de-France",
    "93": "Île-de-France",
    "94": "Île-de-France",
    "95": "Île-de-France",
  };

  return regionMap[dept] ?? "";
}

function cleanProgramTitle(filename?: string | null) {
  if (!filename) return "";

  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const dossierId = formData.get("dossier_id") as string;

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossier_id manquant" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select(
        `
        id,
        title,
        organisation_id,
        organisations:organisation_id (
          id,
          name,
          siret,
          address
        )
      `,
      )
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const organisation = Array.isArray(dossier.organisations)
      ? dossier.organisations[0]
      : dossier.organisations;

    const { data: docs, error: docsError } = await supabase
      .from("documents")
      .select("id, name, document_type")
      .or(
        `dossier_id.eq.${dossierId},and(organisation_id.eq.${dossier.organisation_id},dossier_id.is.null)`,
      );

    if (docsError) {
      return NextResponse.json({ error: docsError.message }, { status: 500 });
    }

    const receivedKeys = (docs ?? []).map((d) => d.document_type);

    const hasCv = receivedKeys.includes("cv_formateur");
    const hasProgramme = receivedKeys.includes("programme_formation");
    const hasInseeOrKbis =
      receivedKeys.includes("avis_insee") || receivedKeys.includes("kbis");

    if (!hasCv || !hasProgramme || !hasInseeOrKbis) {
      return NextResponse.json(
        { error: "Documents insuffisants pour lancer l’analyse." },
        { status: 400 },
      );
    }

    const programmeDoc = (docs ?? []).find(
      (d) => d.document_type === "programme_formation",
    );

    const extractedAddress = extractPostalCodeAndCity(organisation?.address);
    const region = getRegionFromPostalCode(extractedAddress.code_postal);

    const intitule =
      cleanProgramTitle(programmeDoc?.name) ||
      dossier.title ||
      "Programme de formation";

    const payload = {
      siret: organisation?.siret ?? null,
      code_postal: extractedAddress.code_postal || null,
      ville: extractedAddress.ville || null,
      region: region || null,
      intitule_formation: intitule,
      modalite: "presentiel",
      nb_formateurs: 1,
    };

    console.log("Analyse NDA payload:", payload);

    const { error: ndaError } = await supabase
      .from("nda_variables")
      .update(payload)
      .eq("dossier_id", dossierId);

    if (ndaError) {
      return NextResponse.json({ error: ndaError.message }, { status: 500 });
    }

    return NextResponse.redirect(
      new URL(`/agent/dossiers/${dossierId}`, req.url),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
