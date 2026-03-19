import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquante.");
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export async function POST(req: Request) {
  try {
    const supabase = getAdminSupabase();
    const { messageId, action } = await req.json();

    if (!messageId || !action) {
      return NextResponse.json(
        { error: "messageId ou action manquant." },
        { status: 400 },
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
