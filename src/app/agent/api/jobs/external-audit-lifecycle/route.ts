import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

const TO_INVOICE_STATUSES = ["planned", "confirmed", "completed"];

function parisParts(date: Date) {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

function parisDate() {
  const parts = parisParts(new Date());
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    .toISOString()
    .slice(0, 10);
}

function isArchived(audit: ExternalAuditRow) {
  const metadata = audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
  return metadata.archived === true || metadata.archived === "true";
}

function metadataOf(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object"
    ? { ...audit.metadata }
    : {};
}

function shouldRun(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  if (force) return { ok: true, plannedFor: "force" };

  const parts = parisParts(new Date());
  const due = parts.hour === 17 && parts.minute >= 30;
  return {
    ok: due,
    plannedFor: "17:30 Europe/Paris",
  };
}

async function authorize(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authHeader = req.headers.get("authorization") ?? "";

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, email: "cron-secret" };
  }

  const userAgent = req.headers.get("user-agent") ?? "";
  if (userAgent.includes("vercel-cron")) {
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

  const run = shouldRun(req);
  if (!run.ok) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Aucun passage audit externe a facturer prevu a cette heure Europe/Paris.",
      plannedFor: run.plannedFor,
    });
  }

  const admin = createSupabaseAdminClient();
  const today = parisDate();
  const { data, error } = await admin
    .from("external_audits")
    .select("*")
    .eq("audit_date", today)
    .in("status", TO_INVOICE_STATUSES)
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = new Date().toISOString();
  const results = [];

  for (const audit of (data ?? []) as ExternalAuditRow[]) {
    if (isArchived(audit)) {
      results.push({ id: audit.id, skipped: true, reason: "archived" });
      continue;
    }

    const metadata = metadataOf(audit);
    const update = {
      status: "to_invoice",
      metadata: {
        ...metadata,
        lifecycle_to_invoice_at: metadata.lifecycle_to_invoice_at || now,
        lifecycle_to_invoice_method: "auto",
        lifecycle_to_invoice_by: auth.email,
      },
    };

    const { error: updateError } = await admin
      .from("external_audits")
      .update(update)
      .eq("id", audit.id)
      .in("status", TO_INVOICE_STATUSES);

    const status = updateError ? "failed" : "updated";
    console.info("external_audit_lifecycle", {
      auditId: audit.id,
      task: "to_invoice",
      fromStatus: audit.status,
      toStatus: "to_invoice",
      plannedFor: run.plannedFor,
      auditDate: today,
      status,
      error: updateError?.message ?? null,
    });

    results.push({
      id: audit.id,
      fromStatus: audit.status,
      toStatus: "to_invoice",
      status,
      error: updateError?.message ?? null,
    });
  }

  return NextResponse.json({
    ok: true,
    task: "to_invoice",
    date: today,
    count: results.length,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
