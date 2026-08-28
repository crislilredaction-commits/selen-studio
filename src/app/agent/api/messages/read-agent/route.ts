import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerLil } from "@/lib/ownerLil";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const email = userData.user?.email?.trim().toLowerCase();

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
    }

    if (!isOwnerLil(email)) {
      const auth = await requireSupportAgent();
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
    }

    const body = await req.json().catch(() => null);
    const dossierId = String(body?.dossierId ?? "").trim();

    if (!dossierId) {
      return NextResponse.json(
        { error: "dossierId manquant." },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("messages")
      .update({ read_by_agent_at: new Date().toISOString() })
      .eq("dossier_id", dossierId)
      .eq("sender_type", "client")
      .is("read_by_agent_at", null)
      .select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updatedCount: data?.length ?? 0,
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
