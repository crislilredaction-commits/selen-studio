import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getVitrineClientUrl } from "@/lib/vitrineLinks";

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

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY manquante.");
  }

  return new Resend(process.env.RESEND_API_KEY);
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
    const clientEmail = organisation?.email ?? null;

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

    if (clientEmail) {
      const resend = getResendClient();
      const clientUrl = getVitrineClientUrl("nda", dossierId);

      const recipientName = organisation?.name || "bonjour";

      const emailResult = await resend.emails.send({
        from: "Selen ✨ <hello@selen-editions.fr>",
        to: clientEmail,
        subject: "Votre proposition de programme est disponible ✨",
        html: `
          <p>Bonjour ${recipientName},</p>

          <p>
            Votre conseiller a préparé une <strong>proposition de programme de formation</strong>
            pour votre dossier.
          </p>

          <p>
            Cette proposition a été pensée pour renforcer la cohérence du programme
            avec le profil du formateur et optimiser les chances d’acceptation du dossier.
          </p>

          <p>Vous pouvez maintenant :</p>

          <ul>
            <li>consulter la proposition,</li>
            <li>la commenter,</li>
            <li>la valider,</li>
            <li>ou demander une modification si besoin.</li>
          </ul>

          <p>
            <a href="${clientUrl}" style="display:inline-block;padding:10px 16px;background:#4b2e1e;color:#ffffff;text-decoration:none;border-radius:6px;">
              Accéder à mon dossier
            </a>
          </p>

          <p>
            À très vite,<br />
            L’équipe Selen
          </p>
        `,
      });

      console.log("SEND TO CLIENT email result =", emailResult);
    }

    return NextResponse.json({
      success: true,
      version,
      emailed: Boolean(clientEmail),
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
