import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAgentNotification } from "@/lib/server/notifications";

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

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();

    const {
      dossierId,
      decision,
      comment = null,
      uploadedDocumentName = null,
    } = body ?? {};

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    if (!decision || !["validated", "refused"].includes(decision)) {
      return NextResponse.json(
        { error: "decision invalide. Utiliser 'validated' ou 'refused'." },
        { status: 400 },
      );
    }

    const { data: latestVersion, error: versionError } = await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossierId)
      .eq("version_type", "client_sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (versionError) {
      return NextResponse.json(
        { error: versionError.message },
        { status: 500 },
      );
    }

    if (!latestVersion) {
      return NextResponse.json(
        { error: "Aucune proposition programme envoyée au client." },
        { status: 404 },
      );
    }

    const nextStatus =
      decision === "validated" ? "validated_by_client" : "refused_by_client";

    const { data: updatedVersion, error: updateError } = await supabase
      .from("dossier_program_versions")
      .update({
        status: nextStatus,
        client_decision: decision,
        client_comment: comment,
        client_decision_at: new Date().toISOString(),
      })
      .eq("id", latestVersion.id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const dossierStatus =
      decision === "validated" ? "in_progress" : "to_complete";

    const { error: dossierError } = await supabase
      .from("dossiers")
      .update({
        status: dossierStatus,
      })
      .eq("id", dossierId);

    if (dossierError) {
      return NextResponse.json(
        { error: dossierError.message },
        { status: 500 },
      );
    }

    await createAgentNotification({
      supabase,
      dossierId,
      type: decision === "validated" ? "program_validated" : "program_refused",
      title:
        decision === "validated"
          ? "Programme validé par le client"
          : "Programme refusé par le client",
      content:
        decision === "validated"
          ? "Le client a validé la proposition de programme."
          : `Le client a refusé la proposition de programme.${comment ? ` Commentaire : ${comment}` : ""}`,
    });

    return NextResponse.json({
      success: true,
      version: updatedVersion,
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
