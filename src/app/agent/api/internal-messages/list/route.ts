import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function GET() {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase
      .from("internal_messages")
      .select(
        "id, content, dossier_id, created_at, author_name, pinned, pinned_at",
      )
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue",
      },
      { status: 500 },
    );
  }
}
