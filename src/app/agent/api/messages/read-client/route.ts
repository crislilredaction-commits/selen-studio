import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { dossierId } = await req.json();

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("messages")
      .update({
        read_by_client_at: new Date().toISOString(),
      })
      .eq("dossier_id", dossierId)
      .eq("sender_type", "agent")
      .is("read_by_client_at", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
