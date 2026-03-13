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
      .select("id, name, storage_path")
      .eq("id", documentId)
      .maybeSingle();

    if (fetchError || !doc || !doc.storage_path) {
      return NextResponse.json(
        { error: "Document introuvable." },
        { status: 404 },
      );
    }

    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60 * 10);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? "Impossible de générer le lien sécurisé." },
        { status: 500 },
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
