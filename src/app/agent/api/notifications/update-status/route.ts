import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ActionType = "pin" | "unpin" | "dismiss" | "read" | "restore";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { notificationId, action } = await req.json();

    if (!notificationId || !action) {
      return NextResponse.json(
        { error: "notificationId ou action manquant" },
        { status: 400 },
      );
    }

    let updatePayload: Record<string, unknown> = {};

    switch (action) {
      case "pin":
        updatePayload = { pinned: true };
        break;
      case "unpin":
        updatePayload = { pinned: false };
        break;
      case "dismiss":
        updatePayload = { dismissed_at: new Date().toISOString() };
        break;
      case "read":
        updatePayload = { read_at: new Date().toISOString() };
        break;
      case "restore":
        updatePayload = { dismissed_at: null };
        break;
      default:
        return NextResponse.json({ error: "Action invalide" }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .update(updatePayload)
      .eq("id", notificationId);

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
