import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { isStudioReminderVisible, resolveStudioReminderStaff } from "@/lib/server/studioClientFollowups";

export async function GET() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: "Accès agent requis." }, { status: 403 });

  const staff = await resolveStudioReminderStaff(auth.email);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("client_reminders").select("*").order("due_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reminders = (data ?? []).filter((row) => isStudioReminderVisible(row, staff));
  return NextResponse.json({ reminders });
}
