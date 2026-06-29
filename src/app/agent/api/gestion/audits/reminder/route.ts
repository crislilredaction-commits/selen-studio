import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import {
  sendExternalAuditClientReminder,
  sendExternalAuditLilReminder,
} from "@/lib/server/externalAuditEmails";

type ReminderAudience = "client" | "lil";

function metadataOf(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object"
    ? { ...audit.metadata }
    : {};
}

function asHistory(value: unknown) {
  return Array.isArray(value) ? value.slice(-19) : [];
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { auditId, audience = "lil" } = await req.json();
    const id = String(auditId ?? "").trim();
    const reminderAudience: ReminderAudience =
      String(audience) === "client" ? "client" : "lil";
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

    const typedAudit = audit as ExternalAuditRow;
    const email =
      reminderAudience === "client"
        ? await sendExternalAuditClientReminder(typedAudit)
        : await sendExternalAuditLilReminder(typedAudit);
    if (email.sent) {
      const now = new Date().toISOString();
      const metadata = metadataOf(typedAudit);
      const history = asHistory(metadata.reminder_history);
      await admin
        .from("external_audits")
        .update({
          reminder_email_sent_at:
            reminderAudience === "lil" ? now : typedAudit.reminder_email_sent_at,
          client_reminder_sent_at:
            reminderAudience === "client" ? now : typedAudit.client_reminder_sent_at,
          lil_reminder_sent_at:
            reminderAudience === "lil" ? now : typedAudit.lil_reminder_sent_at,
          metadata: {
            ...metadata,
            [`${reminderAudience}_reminder_sent_at`]: now,
            [`${reminderAudience}_reminder_method`]: "manual",
            [`${reminderAudience}_reminder_status`]: "sent",
            reminder_history: [
              ...history,
              {
                audience: reminderAudience,
                method: "manual",
                status: "sent",
                sent_at: now,
                sent_by: auth.email,
              },
            ],
          },
        })
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
