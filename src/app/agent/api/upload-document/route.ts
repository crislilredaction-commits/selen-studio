import { NextResponse } from "next/server";
import { normalizeNdaDocumentType } from "@/lib/ndaDocumentTypes";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const REPLACEABLE_NDA_SIGNING_DOCUMENT_TYPES = new Set([
  "programme_formation",
  "convention_formation",
  "liste_formateurs",
]);

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const formData = await req.formData();
    const supabase = createSupabaseAdminClient();

    const file = formData.get("file") as File | null;
    const rawDossierId = formData.get("dossier_id");
    const rawOrganisationId = formData.get("organisation_id");
    const rawDocumentType = formData.get("document_type");

    const cleanDossierId =
      typeof rawDossierId === "string" ? rawDossierId.trim() : "";

    const dossier_id =
      cleanDossierId &&
      cleanDossierId !== "undefined" &&
      cleanDossierId !== "null"
        ? cleanDossierId
        : null;

    const organisation_id =
      typeof rawOrganisationId === "string" && rawOrganisationId.trim() !== ""
        ? rawOrganisationId.trim()
        : null;

    const document_type = normalizeNdaDocumentType(
      typeof rawDocumentType === "string" && rawDocumentType.trim() !== ""
        ? rawDocumentType.trim()
        : "document_libre",
    );

    if (!file || !organisation_id) {
      return NextResponse.json(
        { error: "Fichier ou organisation manquants." },
        { status: 400 },
      );
    }

    if (dossier_id) {
      const { data: dossier, error: dossierError } = await supabase
        .from("dossiers")
        .select("id, organisation_id")
        .eq("id", dossier_id)
        .maybeSingle();

      if (dossierError) {
        return NextResponse.json({ error: dossierError.message }, { status: 500 });
      }

      if (!dossier) {
        return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
      }

      if (dossier.organisation_id !== organisation_id) {
        return NextResponse.json(
          { error: "Dossier et organisation incoherents." },
          { status: 400 },
        );
      }
    } else {
      const { data: organisation, error: organisationError } = await supabase
        .from("organisations")
        .select("id")
        .eq("id", organisation_id)
        .maybeSingle();

      if (organisationError) {
        return NextResponse.json(
          { error: organisationError.message },
          { status: 500 },
        );
      }

      if (!organisation) {
        return NextResponse.json(
          { error: "Organisation introuvable." },
          { status: 404 },
        );
      }
    }

    const filePath = `${organisation_id}/${dossier_id ?? "global"}/${Date.now()}-${file.name}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    console.log("UPLOAD DOCUMENT:", {
      fileName: file.name,
      dossier_id,
      organisation_id,
      document_type,
      filePath,
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    console.log("UPLOAD RESULT:", {
      filePath,
      uploadData,
      uploadError: uploadError?.message ?? null,
    });

    const { data: testDownloadData, error: testDownloadError } =
      await supabase.storage.from("documents").download(filePath);

    console.log("UPLOAD READBACK TEST:", {
      filePath,
      readable: !!testDownloadData,
      error: testDownloadError?.message ?? null,
    });

    if (uploadError) {
      console.error("STORAGE ERROR:", uploadError);
      return NextResponse.json(
        { error: `Storage: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const isReplacementSigningDocument =
      Boolean(dossier_id) &&
      REPLACEABLE_NDA_SIGNING_DOCUMENT_TYPES.has(document_type);

    if (isReplacementSigningDocument) {
      const { error: supersedeError } = await supabase
        .from("documents")
        .update({
          review_status: "superseded",
          is_visible_to_client: false,
          requires_client_action: false,
        })
        .eq("dossier_id", dossier_id)
        .eq("document_type", document_type)
        .eq("document_role", "client_to_complete")
        .neq("review_status", "superseded");

      if (supersedeError) {
        console.error("SUPERSEDE ERROR:", supersedeError);
        return NextResponse.json(
          { error: `Database: ${supersedeError.message}` },
          { status: 500 },
        );
      }
    }

    const { error: dbError } = await supabase.from("documents").insert({
      name: file.name,
      document_type,
      status: "uploaded",
      source: "agent_upload",
      document_role: isReplacementSigningDocument
        ? "client_to_complete"
        : "agent_uploaded_document",
      review_status: "not_reviewed",
      is_visible_to_client: false,
      requires_client_action: false,
      storage_path: filePath,
      organisation_id,
      dossier_id,
      scope: dossier_id ? "dossier" : "client",
      metadata: {},
    });

    if (dbError) {
      console.error("DB ERROR:", dbError);
      return NextResponse.json(
        { error: `Database: ${dbError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, filePath });
  } catch (error) {
    console.error("UPLOAD ROUTE FATAL:", error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
