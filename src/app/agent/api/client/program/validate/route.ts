import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { proposalId, dossierId } = body;

    if (!proposalId || !dossierId) {
      return NextResponse.json(
        { error: "proposalId ou dossierId manquant" },
        { status: 400 },
      );
    }

    // 1️⃣ Update proposal
    const { error: proposalError } = await supabase
      .from("program_proposals")
      .update({
        status: "validated",
        validated_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    if (proposalError) {
      throw proposalError;
    }

    // 2️⃣ Update step dossier
    const { error: dossierError } = await supabase
      .from("dossiers")
      .update({
        step: 2,
      })
      .eq("id", dossierId);

    if (dossierError) {
      throw dossierError;
    }

    // 3️⃣ Message auto agent
    await supabase.from("messages").insert({
      dossier_id: dossierId,
      sender_type: "client",
      content: "✅ Programme validé par le client",
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "Erreur validation programme" },
      { status: 500 },
    );
  }
}
