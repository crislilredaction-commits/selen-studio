import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import { sendExternalAuditConfirmation } from "@/lib/server/externalAuditEmails";

type Metadata = Record<string, unknown>;

function metadataOf(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object"
    ? { ...audit.metadata }
    : {};
}

function asHistory(value: unknown) {
  return Array.isArray(value) ? value.slice(-9) : [];
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const id = String(body.auditId ?? "").trim();
    const action = String(body.action ?? "send").trim();
    const subject = String(body.subject ?? "").trim();
    const bodyText = String(body.bodyText ?? "").trim();

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
    const metadata = metadataOf(typedAudit) as Metadata;

    if (action === "save_draft") {
      if (!subject || !bodyText) {
        return NextResponse.json(
          { error: "Objet et corps du mail requis." },
          { status: 400 },
        );
      }

      const { data, error: updateError } = await admin
        .from("external_audits")
        .update({
          metadata: {
            ...metadata,
            confirmation_email_draft_subject: subject,
            confirmation_email_draft_body: bodyText,
            confirmation_email_draft_updated_at: new Date().toISOString(),
            confirmation_email_draft_updated_by: auth.email,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, audit: data });
    }

    if (action === "reset_draft") {
      delete metadata.confirmation_email_draft_subject;
      delete metadata.confirmation_email_draft_body;
      delete metadata.confirmation_email_draft_updated_at;
      delete metadata.confirmation_email_draft_updated_by;
      metadata.confirmation_email_draft_reset_at = new Date().toISOString();
      metadata.confirmation_email_draft_reset_by = auth.email;

      const { data, error: updateError } = await admin
        .from("external_audits")
        .update({
          metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, audit: data });
    }

    const finalSubject =
      subject ||
      (typeof metadata.confirmation_email_draft_subject === "string"
        ? metadata.confirmation_email_draft_subject
        : "");
    const finalBodyText =
      bodyText ||
      (typeof metadata.confirmation_email_draft_body === "string"
        ? metadata.confirmation_email_draft_body
        : "");

    const emailResult = await sendExternalAuditConfirmation(typedAudit, {
      subject: finalSubject,
      bodyText: finalBodyText,
    });

    if (emailResult.sent) {
      const now = new Date().toISOString();
      const history = asHistory(metadata.confirmation_email_history);
      await admin
        .from("external_audits")
        .update({
          confirmation_email_sent_at: now,
          status: "confirmed",
          updated_at: now,
          metadata: {
            ...metadata,
            confirmation_email_draft_subject: finalSubject || undefined,
            confirmation_email_draft_body: finalBodyText || undefined,
            confirmation_email_last_subject: finalSubject,
            confirmation_email_last_body: finalBodyText,
            confirmation_email_last_sent_by: auth.email,
            confirmation_email_history: [
              ...history,
              {
                sent_at: now,
                sent_by: auth.email,
                subject: finalSubject,
                body: finalBodyText,
              },
            ],
          },
        })
        .eq("id", id);
    }

    return NextResponse.json({ ok: true, email: emailResult });
  } catch (error) {
    console.error("Email confirmation audit echoue.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
