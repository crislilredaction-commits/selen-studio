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

    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json(
        { error: "documentId manquant." },
        { status: 400 },
      );
    }

    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .maybeSingle();

    if (fetchError || !doc) {
      return NextResponse.json(
        { error: "Document introuvable." },
        { status: 404 },
      );
    }

    if (doc.storage_path) {
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.storage_path]);

      if (storageError) {
        return NextResponse.json(
          { error: `Storage: ${storageError.message}` },
          { status: 500 },
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("documents")
      .delete()
      .eq("id", documentId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Database: ${deleteError.message}` },
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
