import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ActionType = "pin" | "unpin" | "dismiss" | "mark_read" | "restore";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const body = await req.json();

    const { messageId, action } = body as {
      messageId?: string;
      action?: ActionType;
    };

    if (!messageId || !action) {
      return NextResponse.json(
        { error: "messageId ou action manquant." },
        { status: 400 },
      );
    }

    let updatePayload: Record<string, unknown> = {};

    switch (action) {
      case "pin":
        updatePayload = { pinned_by_agent: true };
        break;

      case "unpin":
        updatePayload = { pinned_by_agent: false };
        break;

      case "dismiss":
        updatePayload = { dismissed_by_agent: true };
        break;

      case "restore":
        updatePayload = { dismissed_by_agent: false };
        break;

      case "mark_read":
        updatePayload = { read_by_agent_at: new Date().toISOString() };
        break;

      default:
        return NextResponse.json(
          { error: "Action invalide." },
          { status: 400 },
        );
    }

    const { error } = await supabase
      .from("messages")
      .update(updatePayload)
      .eq("id", messageId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
