import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import { sendExternalAuditReminder } from "@/lib/server/externalAuditEmails";
import { requireLilOwner } from "@/app/agent/api/support/_utils";

function tomorrowDate() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().slice(0, 10);
}

export async function POST() {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createSupabaseAdminClient();
  const date = tomorrowDate();

  const { data, error } = await admin
    .from("external_audits")
    .select("*")
    .eq("audit_date", date)
    .in("status", ["planned", "confirmed"])
    .is("reminder_email_sent_at", null)
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const audit of (data ?? []) as ExternalAuditRow[]) {
    const email = await sendExternalAuditReminder(audit);

    if (email.sent) {
      await admin
        .from("external_audits")
        .update({ reminder_email_sent_at: new Date().toISOString() })
        .eq("id", audit.id);
    }

    results.push({ id: audit.id, email });
  }

  return NextResponse.json({ ok: true, count: results.length, results });
}

export async function GET() {
  return POST();
}
