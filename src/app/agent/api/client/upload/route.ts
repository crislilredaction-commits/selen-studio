import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAgentNotification } from "@/lib/server/notifications";

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

    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const dossierId = formData.get("dossierId") as string | null;
    const documentType = formData.get("documentType") as string | null;

    if (!file || !dossierId || !documentType) {
      return NextResponse.json(
        { error: "file, dossierId ou documentType manquant." },
        { status: 400 },
      );
    }

    const { data: dossier, error: dossierError } = await supabase
      .from("dossiers")
      .select("id, organisation_id")
      .eq("id", dossierId)
      .maybeSingle();

    if (dossierError || !dossier) {
      return NextResponse.json(
        { error: "Dossier introuvable." },
        { status: 404 },
      );
    }

    const organisationId = dossier.organisation_id;
    const filePath = `${organisationId}/${dossierId}/${Date.now()}-${file.name}`;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(filePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage: ${uploadError.message}` },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase.from("documents").insert({
      name: file.name,
      document_type: documentType,
      status: "uploaded",
      source: "client_upload",
      storage_path: filePath,
      organisation_id: organisationId,
      dossier_id: dossierId,
      scope: "dossier",
    });

    if (insertError) {
      return NextResponse.json(
        { error: `Database: ${insertError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
