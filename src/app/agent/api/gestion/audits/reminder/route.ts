import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import { sendExternalAuditReminder } from "@/lib/server/externalAuditEmails";

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { auditId } = await req.json();
    const id = String(auditId ?? "").trim();
    if (!id) {
      return NextResponse.json({ error: "auditId requis." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: audit, error } = await admin
      .from("external_audits")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!audit) {
      return NextResponse.json({ error: "Audit introuvable." }, { status: 404 });
    }

    const email = await sendExternalAuditReminder(audit as ExternalAuditRow);
    if (email.sent) {
      await admin
        .from("external_audits")
        .update({ reminder_email_sent_at: new Date().toISOString() })
        .eq("id", id);
    }

    return NextResponse.json({ ok: true, email });
  } catch (error) {
    console.error("Rappel audit externe echoue.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
