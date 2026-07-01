import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { invoiceTotals, type LilInvoiceLine } from "@/lib/server/lilInvoices";
import type { ExternalAuditRow } from "@/lib/server/externalAudits";

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const next = new Date(Date.UTC(year, monthNumber, 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: next.toISOString().slice(0, 10),
  };
}

function metadataOf(audit: ExternalAuditRow) {
  return audit.metadata && typeof audit.metadata === "object" ? audit.metadata : {};
}

function isArchived(audit: ExternalAuditRow) {
  const metadata = metadataOf(audit);
  return metadata.archived === true || metadata.archived === "true";
}

function centsValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function auditReference(audit: ExternalAuditRow) {
  const metadata = metadataOf(audit);
  const value = metadata.audit_reference;
  return typeof value === "string" && value.trim() ? value.trim() : audit.id.slice(0, 8);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function linesFromAudit(audit: ExternalAuditRow) {
  const metadata = metadataOf(audit);
  const reference = auditReference(audit);
  const date = formatDate(audit.audit_date);
  const amount = centsValue(metadata.audit_amount_cents);
  const travel =
    centsValue(metadata.travel_expense_cents) || centsValue(metadata.travel_expenses_cents);
  const lines: LilInvoiceLine[] = [
    {
      label: `Audit ICPF - ${date} - Ref. ${reference}`,
      details: audit.of_name,
      quantity: 1,
      unitAmountCents: amount,
      totalAmountCents: amount,
    },
  ];

  if (travel > 0) {
    lines.push({
      label: `Frais de deplacement - ${date} - Ref. ${reference}`,
      details: audit.of_name,
      quantity: 1,
      unitAmountCents: travel,
      totalAmountCents: travel,
    });
  }

  return lines;
}

async function linkedAuditIds() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lil_invoices")
    .select("linked_audit_ids")
    .neq("status", "cancelled")
    .limit(2000);
  if (error) throw new Error(error.message);
  return new Set(
    (data ?? []).flatMap((invoice) =>
      Array.isArray(invoice.linked_audit_ids)
        ? invoice.linked_audit_ids.map((id) => String(id))
        : [],
    ),
  );
}

async function loadEligibleAudits(month: string) {
  const range = monthRange(month);
  if (!range) throw new Error("Mois invalide.");

  const admin = createSupabaseAdminClient();
  const [linkedIds, auditsResult] = await Promise.all([
    linkedAuditIds(),
    admin
      .from("external_audits")
      .select("*")
      .eq("status", "to_invoice")
      .ilike("certifier", "%ICPF%")
      .gte("audit_date", range.start)
      .lt("audit_date", range.end)
      .order("audit_date", { ascending: true })
      .order("start_time", { ascending: true }),
  ]);

  if (auditsResult.error) throw new Error(auditsResult.error.message);
  return ((auditsResult.data ?? []) as ExternalAuditRow[]).filter(
    (audit) => !isArchived(audit) && !linkedIds.has(audit.id),
  );
}

function previewPayload(month: string, audits: ExternalAuditRow[]) {
  const lines = audits.flatMap(linesFromAudit);
  const totals = invoiceTotals(lines);
  return {
    month,
    auditCount: audits.length,
    audits: audits.map((audit) => ({
      id: audit.id,
      ofName: audit.of_name,
      auditDate: audit.audit_date,
      reference: auditReference(audit),
      amountCents: centsValue(metadataOf(audit).audit_amount_cents),
      travelExpenseCents:
        centsValue(metadataOf(audit).travel_expense_cents) ||
        centsValue(metadataOf(audit).travel_expenses_cents),
    })),
    lines: totals.lines,
    subtotalCents: totals.subtotalCents,
    totalCents: totals.totalCents,
  };
}

export async function GET(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const month = new URL(req.url).searchParams.get("month") ?? "";
    const audits = await loadEligibleAudits(month);
    return NextResponse.json({ ok: true, ...previewPayload(month, audits) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const month = String(body.month ?? "").trim();
    const audits = await loadEligibleAudits(month);
    if (audits.length === 0) {
      return NextResponse.json(
        { error: "Aucun audit ICPF a facturer pour ce mois." },
        { status: 400 },
      );
    }

    const lines = audits.flatMap(linesFromAudit);
    const totals = invoiceTotals(lines);
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("lil_invoices")
      .insert({
        invoice_date: new Date().toISOString().slice(0, 10),
        recipient_name: "ICPF",
        invoice_type: "icpf_monthly",
        status: "draft",
        currency: "eur",
        subtotal_cents: totals.subtotalCents,
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
        lines: totals.lines,
        linked_audit_ids: audits.map((audit) => audit.id),
        created_by_email: auth.email,
        updated_by_email: auth.email,
        metadata: {
          temporary_generator: true,
          icpf_invoice_month: month,
          generated_from: "icpf_monthly",
        },
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, invoice: data, ...previewPayload(month, audits) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 400 },
    );
  }
}
