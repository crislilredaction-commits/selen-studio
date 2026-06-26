import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  renderSelenEmailFromText,
  sendSelenEmail,
} from "@/lib/server/selenEmailLayout";
import {
  auditStart,
  googleMapsUrl,
  type ExternalAuditRow,
} from "@/lib/server/externalAudits";
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
  const to = process.env.LIL_NOTIFICATION_EMAIL || "hello@selen-editions.fr";

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
    const maps = googleMapsUrl(audit.address);
    const notes =
      audit.metadata && typeof audit.metadata.notes === "string"
        ? audit.metadata.notes
        : "";
    const bodyText = [
      `Audit externe demain : ${audit.of_name}`,
      `Contact : ${audit.contact_name || "-"}`,
      `Email : ${audit.contact_email || "-"}`,
      `Telephone : ${audit.contact_phone || "-"}`,
      `Adresse : ${audit.address || "-"}`,
      maps ? `Google Maps : ${maps}` : "",
      `Type d'audit : ${audit.audit_type}`,
      `Certificateur : ${audit.certifier || "-"}`,
      `Date : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(
        auditStart(audit),
      )}`,
      `Horaire : ${audit.start_time.slice(0, 5)}${
        audit.end_time ? ` - ${audit.end_time.slice(0, 5)}` : ""
      }`,
      notes ? `Notes : ${notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const rendered = renderSelenEmailFromText({
      title: `Rappel audit externe - ${audit.of_name}`,
      bodyText,
    });

    const email = await sendSelenEmail({
      to,
      subject: `Rappel audit externe - ${audit.of_name}`,
      html: rendered.html,
      text: rendered.text,
    });

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
