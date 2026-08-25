import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export async function GET(req: Request) {
  try {
    const auth = await requireSupportAgent();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const dossierId = searchParams.get("dossierId");

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dossier_program_versions")
      .select("*")
      .eq("dossier_id", dossierId)
      .eq("version_type", "client_sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ version: data ?? null });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
