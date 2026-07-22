import { NextResponse } from "next/server";
import { requireStudioAgent } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const auth = await requireStudioAgent();
    if (!auth.ok) return auth.response;

    const supabase = createSupabaseAdminClient();
    const { messageId, action } = await req.json();

    if (!messageId || !action) {
      return NextResponse.json(
        { error: "messageId ou action manquant." },
        { status: 400 },
      );
    }

    const { data: message, error: messageError } = await supabase
      .from("internal_messages")
      .select("id")
      .eq("id", messageId)
      .maybeSingle();

    if (messageError) {
      return NextResponse.json({ error: messageError.message }, { status: 500 });
    }

    if (!message) {
      return NextResponse.json(
        { error: "Message introuvable." },
        { status: 404 },
      );
    }

    if (action === "pin") {
      const { error } = await supabase
        .from("internal_messages")
        .update({
          pinned: true,
          pinned_at: new Date().toISOString(),
        })
        .eq("id", messageId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (action === "unpin") {
      const { error } = await supabase
        .from("internal_messages")
        .update({
          pinned: false,
          pinned_at: null,
        })
        .eq("id", messageId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
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
