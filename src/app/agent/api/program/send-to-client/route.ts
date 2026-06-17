import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifyClientVisibleDocuments } from "@/lib/server/notifyClientVisibleDocuments";

function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

type OrganisationRow = {
  id: string;
  name: string | null;
  email: string | null;
  representant_prenom?: string | null;
  representant_nom?: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    console.log("SEND TO CLIENT BODY =", body);

    const {
      dossierId,
      sourceAnalysisId = null,
      title = null,
      targetAudience = null,
      overallObjective = null,
      recommendedPositioning = null,
      justification = null,
      agentComment = null,
      vigilancePoints = [],
      modules = [],
    } = body ?? {};

    console.log("SEND TO CLIENT dossierId =", dossierId);

    if (!dossierId || typeof dossierId !== "string") {
      return NextResponse.json(
        { error: "dossierId manquant ou invalide." },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select(
        `
      id,
      title,
      status,
      organisation_id,
      organisations:organisation_id (
        id,
        name,
        email
      )
    `,
      )
      .eq("id", dossierId)
      .maybeSingle();

    console.log("SEND TO CLIENT dossier query result =", {
      dossierId,
      dossier,
      dossierError,
    });

    if (dossierError) {
      return NextResponse.json(
        { error: `Erreur dossier query: ${dossierError.message}` },
        { status: 500 },
      );
    }

    if (!dossier) {
      return NextResponse.json(
        { error: `Aucun dossier trouvé pour id ${dossierId}` },
        { status: 404 },
      );
    }

    const organisationRaw = Array.isArray(dossier.organisations)
      ? dossier.organisations[0]
      : dossier.organisations;

    const organisation = (organisationRaw ?? null) as OrganisationRow | null;

    const payload = {
      dossier_id: dossierId,
      source_analysis_id: sourceAnalysisId,
      version_type: "client_sent",
      status: "sent",
      title,
      target_audience: targetAudience,
      overall_objective: overallObjective,
      recommended_positioning: recommendedPositioning,
      justification,
      agent_comment: agentComment,
      vigilance_points: Array.isArray(vigilancePoints) ? vigilancePoints : [],
      modules: Array.isArray(modules) ? modules : [],
    };

    console.log("SEND TO CLIENT version payload =", payload);

    const { data: version, error: versionError } = await supabase
      .from("dossier_program_versions")
      .insert(payload)
      .select("*")
      .single();

    if (versionError) {
      return NextResponse.json(
        { error: `Erreur insertion version: ${versionError.message}` },
        { status: 500 },
      );
    }

    const { error: dossierUpdateError } = await supabase
      .from("dossiers")
      .update({
        status: "under_review",
      })
      .eq("id", dossierId);

    if (dossierUpdateError) {
      return NextResponse.json(
        { error: `Erreur update dossier: ${dossierUpdateError.message}` },
        { status: 500 },
      );
    }

    const emailNotification = await notifyClientVisibleDocuments({
      dossierId,
      dossierType: "nda",
      organisation,
      subject: "Votre proposition de programme est disponible",
      message:
        "Votre conseiller a préparé une proposition de programme de formation pour votre dossier. Vous pouvez la consulter, la valider ou demander une modification depuis votre espace client.",
    });

    return NextResponse.json({
      success: true,
      version,
      emailed: emailNotification.sent,
    });
  } catch (error) {
    console.error("SEND TO CLIENT fatal error =", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
