import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";
import {
  sendExternalAuditClientReminder,
  sendExternalAuditLilReminder,
} from "@/lib/server/externalAuditEmails";
import { requireLilOwner } from "@/app/agent/api/support/_utils";

type ReminderAudience = "client" | "lil";

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
  };
}

function parisDateOffset(days: number) {
  const parts = parisParts(new Date());
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return date.toISOString().slice(0, 10);
}

function inferAudience(req: Request): ReminderAudience | null {
  const explicit = new URL(req.url).searchParams.get("audience");
  if (explicit === "client" || explicit === "lil") return explicit;
  const hour = parisParts(new Date()).hour;
  if (hour === 9) return "client";
  if (hour === 20) return "lil";
  return null;
}

function metadataOf(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object"
    ? { ...audit.metadata }
    : {};
}

function asHistory(value: unknown) {
  return Array.isArray(value) ? value.slice(-49) : [];
}

function alreadySent(audit: ExternalAuditRow, audience: ReminderAudience) {
  const metadata = metadataOf(audit);
  if (audience === "client") {
    return Boolean(audit.client_reminder_sent_at || metadata.client_reminder_sent_at);
  }
  return Boolean(
    audit.lil_reminder_sent_at ||
      audit.reminder_email_sent_at ||
      metadata.lil_reminder_sent_at,
  );
}

async function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get("authorization") ?? "";
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, email: "vercel-cron" };
  }

  const auth = await requireLilOwner();
  if (auth.ok) return { ok: true, email: auth.email };
  return { ok: false, error: auth.error, status: auth.status };
}

export async function POST(req: Request) {
  const auth = await authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const audience = inferAudience(req);
  if (!audience) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Aucun rappel audit externe prevu a cette heure Europe/Paris.",
    });
  }

  const admin = createSupabaseAdminClient();
  const date = parisDateOffset(1);

  const { data, error } = await admin
    .from("external_audits")
    .select("*")
    .eq("audit_date", date)
    .in("status", ["planned", "confirmed"])
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];
  for (const audit of (data ?? []) as ExternalAuditRow[]) {
    if (alreadySent(audit, audience)) {
      results.push({ id: audit.id, skipped: true, reason: "already_sent" });
      continue;
    }

    const email =
      audience === "client"
        ? await sendExternalAuditClientReminder(audit)
        : await sendExternalAuditLilReminder(audit);

    const now = new Date().toISOString();
    const metadata = metadataOf(audit);
    const history = asHistory(metadata.reminder_history);
    const status = email.sent ? "sent" : "failed";

    await admin
      .from("external_audits")
      .update({
        reminder_email_sent_at:
          audience === "lil" && email.sent ? now : audit.reminder_email_sent_at,
        client_reminder_sent_at:
          audience === "client" && email.sent ? now : audit.client_reminder_sent_at,
        lil_reminder_sent_at:
          audience === "lil" && email.sent ? now : audit.lil_reminder_sent_at,
        metadata: {
          ...metadata,
          [`${audience}_reminder_sent_at`]: email.sent
            ? now
            : metadata[`${audience}_reminder_sent_at`],
          [`${audience}_reminder_method`]: "auto",
          [`${audience}_reminder_status`]: status,
          [`${audience}_reminder_error`]: email.sent ? null : email.error,
          reminder_history: [
            ...history,
            {
              audience,
              method: "auto",
              status,
              sent_at: email.sent ? now : null,
              attempted_at: now,
              error: email.error ?? null,
            },
          ],
        },
      })
      .eq("id", audit.id);

    results.push({ id: audit.id, email });
  }

  return NextResponse.json({ ok: true, audience, date, count: results.length, results });
}

export async function GET(req: Request) {
  return POST(req);
}
