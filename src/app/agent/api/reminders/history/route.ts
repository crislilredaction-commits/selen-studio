import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isStudioReminderVisible, resolveStudioReminderStaff } from "@/lib/server/studioClientFollowups";

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: "Accès agent requis." }, { status: 403 });

  const reminderId = new URL(req.url).searchParams.get("reminderId")?.trim();
  if (!reminderId) return NextResponse.json({ error: "reminderId manquant." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: reminder, error: reminderError } = await admin.from("client_reminders").select("id,reminder_type,due_at,metadata").eq("id", reminderId).maybeSingle();
  if (reminderError) return NextResponse.json({ error: reminderError.message }, { status: 500 });
  if (!reminder) return NextResponse.json({ error: "Relance introuvable." }, { status: 404 });

  const staff = await resolveStudioReminderStaff(auth.email);
  if (!isStudioReminderVisible(reminder, staff)) return NextResponse.json({ error: "Relance non accessible." }, { status: 403 });

  const { data, error } = await admin.from("client_reminder_events").select("id,reminder_id,event_type,agent_email,subject,body_text,created_at").eq("reminder_id", reminderId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}
