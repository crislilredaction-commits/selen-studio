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
        { error: "SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local." },
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

    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const rawDossierId = formData.get("dossier_id");
    const rawOrganisationId = formData.get("organisation_id");
    const rawDocumentType = formData.get("document_type");

    const dossier_id =
      typeof rawDossierId === "string" && rawDossierId.trim() !== ""
        ? rawDossierId
        : null;

    const organisation_id =
      typeof rawOrganisationId === "string" && rawOrganisationId.trim() !== ""
        ? rawOrganisationId
        : null;

    const document_type =
      typeof rawDocumentType === "string" && rawDocumentType.trim() !== ""
        ? rawDocumentType
        : "document_libre";

    if (!file || !organisation_id) {
      return NextResponse.json(
        { error: "Fichier ou organisation manquants." },
        { status: 400 },
      );
    }

    const filePath = `${organisation_id}/${dossier_id ?? "global"}/${Date.now()}-${file.name}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("STORAGE ERROR:", uploadError);
      return NextResponse.json(
        { error: `Storage: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { error: dbError } = await supabase.from("documents").insert({
      name: file.name,
      document_type,
      status: "uploaded",
      source: "agent_upload",
      storage_path: filePath,
      organisation_id,
      dossier_id,
      scope: dossier_id ? "dossier" : "client",
    });

    if (dbError) {
      console.error("DB ERROR:", dbError);
      return NextResponse.json(
        { error: `Database: ${dbError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("UPLOAD ROUTE FATAL:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
