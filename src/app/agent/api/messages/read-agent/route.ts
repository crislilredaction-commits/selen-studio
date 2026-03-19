import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { dossierId } = await req.json();

  await supabase
    .from("messages")
    .update({ read_by_agent_at: new Date().toISOString() })
    .eq("dossier_id", dossierId)
    .eq("sender_type", "client")
    .is("read_by_agent_at", null);

  return NextResponse.json({ success: true });
}
