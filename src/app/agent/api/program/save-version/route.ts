import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(
        { error: "NEXT_PUBLIC_SUPABASE_URL manquante." },
        { status: 500 },
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY manquante." },
        { status: 500 },
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );

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

    const payload = {
      dossier_id: dossierId,
      source_analysis_id: sourceAnalysisId,
      version_type: "agent_draft",
      status: "draft",
      title,
      target_audience: targetAudience,
      overall_objective: overallObjective,
      recommended_positioning: recommendedPositioning,
      justification,
      agent_comment: agentComment,
      vigilance_points: vigilancePoints,
      modules,
    };

    const { data, error } = await supabase
      .from("dossier_program_versions")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, version: data });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
