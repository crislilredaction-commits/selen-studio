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

function plannedHour(audience: ReminderAudience) {
  return audience === "client" ? "J-1 09:00 Europe/Paris" : "J-1 20:00 Europe/Paris";
}

function maskEmail(value?: string | null) {
  if (!value) return null;
  const [local, domain] = value.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function lilRecipientSource(audience: ReminderAudience) {
  if (audience !== "lil") return null;
  return process.env.LIL_REMINDER_EMAIL?.trim() ? "env" : "fallback";
}

function logReminderEvent(event: {
  auditId: string;
  audience: ReminderAudience;
  recipientMasked?: string | null;
  recipientSource?: "env" | "fallback" | null;
  plannedFor: string;
  status: "sent" | "failed";
  resendId?: string | null;
  statusPersisted?: boolean;
  error?: string | null;
}) {
  console.info("external_audit_reminder_manual", event);
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
    const email = await (async () => {
      try {
        return reminderAudience === "client"
          ? await sendExternalAuditClientReminder(typedAudit)
          : await sendExternalAuditLilReminder(typedAudit);
      } catch (error) {
        return {
          sent: false,
          error: error instanceof Error ? error.message : "Erreur Resend inconnue.",
        };
      }
    })();
    const recipient = "to" in email && typeof email.to === "string" ? email.to : null;
    const resendId =
      "resendId" in email && typeof email.resendId === "string" ? email.resendId : null;
    logReminderEvent({
      auditId: typedAudit.id,
      audience: reminderAudience,
      recipientMasked: maskEmail(recipient),
      recipientSource: lilRecipientSource(reminderAudience),
      plannedFor: plannedHour(reminderAudience),
      status: email.sent ? "sent" : "failed",
      resendId,
      error: email.error ?? null,
    });
    let statusUpdate = { persisted: false, error: null as string | null };
    let warning: string | null = null;
    if (email.sent) {
      const now = new Date().toISOString();
      const metadata = metadataOf(typedAudit);
      const history = asHistory(metadata.reminder_history);
      const { error: updateError } = await admin
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
                recipient,
                planned_for: plannedHour(reminderAudience),
                sent_at: now,
                sent_by: auth.email,
              },
            ],
          },
        })
        .eq("id", id);
      statusUpdate = {
        persisted: !updateError,
        error: updateError?.message ?? null,
      };
      warning = updateError ? "email_sent_but_status_update_failed" : null;

      if (updateError) {
        console.error("external_audit_reminder_manual_status_update_failed", {
          auditId: typedAudit.id,
          audience: reminderAudience,
          recipientMasked: maskEmail(recipient),
          recipientSource: lilRecipientSource(reminderAudience),
          resendId,
          emailSent: true,
          error: updateError.message,
        });
      }
    }

    logReminderEvent({
      auditId: typedAudit.id,
      audience: reminderAudience,
      recipientMasked: maskEmail(recipient),
      recipientSource: lilRecipientSource(reminderAudience),
      plannedFor: plannedHour(reminderAudience),
      status: email.sent ? "sent" : "failed",
      resendId,
      statusPersisted: statusUpdate.persisted,
      error: warning ?? email.error ?? statusUpdate.error,
    });

    return NextResponse.json({ ok: true, email, statusUpdate, warning });
  } catch (error) {
    console.error("Rappel audit externe echoue.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
