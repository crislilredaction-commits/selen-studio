import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

type ActionType = "pin" | "unpin" | "dismiss" | "mark_read" | "restore";

const ALLOWED_ACTIONS: ActionType[] = [
  "pin",
  "unpin",
  "dismiss",
  "mark_read",
  "restore",
];

export async function POST(req: Request) {
  try {
    const auth = await requireSupportAgent();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => null);
    const messageId = String(body?.messageId ?? "").trim();
    const action = String(body?.action ?? "").trim() as ActionType;

    if (!messageId || !action) {
      return NextResponse.json(
        { error: "messageId ou action manquant." },
        { status: 400 },
      );
    }

    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: "Action invalide." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    let updatePayload: Record<string, unknown>;

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
    }

    const { data, error } = await supabase
      .from("messages")
      .update(updatePayload)
      .eq("id", messageId)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        { error: "Message introuvable ou inaccessible." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, messageId: data.id });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erreur inconnue.",
      },
      { status: 500 },
    );
  }
}
