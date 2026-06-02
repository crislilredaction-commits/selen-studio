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

function sanitizeFileName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const formData = await req.formData();

    const dossierId = String(formData.get("dossierId") ?? "").trim();
    const programVersionId = String(
      formData.get("programVersionId") ?? "",
    ).trim();
    const decision = String(formData.get("decision") ?? "").trim() as
      | "validated"
      | "refused";
    const comment = String(formData.get("comment") ?? "").trim();
    const file = formData.get("file");

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    if (!programVersionId) {
      return NextResponse.json(
        { error: "programVersionId manquant." },
        { status: 400 },
      );
    }

    if (decision !== "validated" && decision !== "refused") {
      return NextResponse.json(
        { error: "Décision invalide." },
        { status: 400 },
      );
    }

    const hasFile = file instanceof File && file.size > 0;

    if (decision === "refused" && !comment && !hasFile) {
      return NextResponse.json(
        {
          error:
            "Merci d’indiquer un commentaire ou de joindre une version modifiée avant de refuser le programme.",
        },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, title, organisation_id")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const { data: version, error: versionError } = await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("id", programVersionId)
      .eq("dossier_id", dossierId)
      .maybeSingle();

    if (versionError || !version) {
      return NextResponse.json(
        { error: "Version programme introuvable." },
        { status: 404 },
      );
    }

    let uploadedStoragePath: string | null = null;
    let uploadedDocumentId: string | null = null;

    if (decision === "refused" && hasFile && file instanceof File) {
      const safeName = sanitizeFileName(file.name || "programme_client.docx");
      const storagePath = `program-versions/${dossierId}/${Date.now()}-${safeName}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          { error: `Upload impossible : ${uploadError.message}` },
          { status: 500 },
        );
      }

      uploadedStoragePath = storagePath;

      const { data: createdDocument, error: documentError } = await supabase
        .from("documents")
        .insert({
          dossier_id: dossierId,
          organisation_id: dossier.organisation_id,
          name: safeName,
          document_type: "programme_client_corrige",
          storage_path: storagePath,
          status: "uploaded",
          source: "client_upload",
        })
        .select("id")
        .single();

      if (documentError) {
        return NextResponse.json(
          { error: documentError.message },
          { status: 500 },
        );
      }

      uploadedDocumentId = createdDocument.id;
    }

    const clientDecisionStatus =
      decision === "validated" ? "validated_by_client" : "refused_by_client";

    const { error: updateVersionError } = await supabase
      .from("dossier_program_versions")
      .update({
        status: clientDecisionStatus,
        client_decision: decision,
        client_comment: comment || null,
        client_decision_at: new Date().toISOString(),
        client_uploaded_document_id: uploadedDocumentId,
      })
      .eq("id", programVersionId);

    if (updateVersionError) {
      return NextResponse.json(
        { error: updateVersionError.message },
        { status: 500 },
      );
    }

    if (decision === "validated") {
      const { error: dossierStatusError } = await supabase
        .from("dossiers")
        .update({
          status: "in_progress",
        })
        .eq("id", dossierId);

      if (dossierStatusError) {
        return NextResponse.json(
          { error: dossierStatusError.message },
          { status: 500 },
        );
      }

      await createAgentNotification({
        supabase,
        dossierId,
        type: "client_program_validated",
        title: "Programme validé par le client",
        content:
          "Le client a validé la proposition de programme. Le dossier peut avancer.",
      });

      await supabase.from("messages").insert({
        dossier_id: dossierId,
        sender_type: "client",
        content: comment
          ? `Le client a validé le programme proposé.\n\nCommentaire du client :\n${comment}`
          : "Le client a validé le programme proposé.",
        read_by_agent_at: null,
      });
    } else {
      await createAgentNotification({
        supabase,
        dossierId,
        type: "client_program_refused",
        title: "Programme refusé par le client",
        content: comment
          ? `Le client a refusé la proposition de programme. Commentaire : ${comment}`
          : uploadedDocumentId
            ? "Le client a refusé la proposition de programme et a transmis une version modifiée."
            : "Le client a refusé la proposition de programme.",
      });

      await supabase.from("messages").insert({
        dossier_id: dossierId,
        sender_type: "client",
        content: [
          "Refus du programme proposé.",
          comment ? `\nCommentaire du client :\n${comment}` : "",
          uploadedDocumentId
            ? "\nUne version modifiée du programme a été déposée par le client."
            : "",
        ].join(""),
        read_by_agent_at: null,
      });
    }

    return NextResponse.json({
      success: true,
      decision,
      uploadedStoragePath,
      uploadedDocumentId,
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
