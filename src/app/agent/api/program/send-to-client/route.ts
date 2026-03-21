import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

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

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY manquante.");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

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

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
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
          email,
          representant_prenom,
          representant_nom
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

    const organisationRaw = Array.isArray(dossier.organisations)
      ? dossier.organisations[0]
      : dossier.organisations;

    const organisation = organisationRaw ?? null;
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

    const { data: version, error: versionError } = await supabase
      .from("dossier_program_versions")
      .insert(payload)
      .select("*")
      .single();

    if (versionError) {
      return NextResponse.json(
        { error: versionError.message },
        { status: 500 },
      );
    }

    const { error: dossierUpdateError } = await supabase
      .from("dossiers")
      .update({
        status: "program_sent_to_client",
      })
      .eq("id", dossierId);

    if (dossierUpdateError) {
      return NextResponse.json(
        { error: dossierUpdateError.message },
        { status: 500 },
      );
    }

    if (clientEmail) {
      const resend = getResendClient();
      const clientUrl = `${getAppUrl()}/client/dossier/${dossierId}`;

      const recipientName =
        organisation?.representant_prenom ||
        organisation?.representant_nom ||
        organisation?.name ||
        "bonjour";

      await resend.emails.send({
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

          <p>
            Vous pouvez maintenant :
          </p>

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
    }

    return NextResponse.json({
      success: true,
      version,
      emailed: Boolean(clientEmail),
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
