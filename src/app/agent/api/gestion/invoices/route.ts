import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  generateLilInvoicePdfBuffer,
  getLilInvoiceSettings,
  invoiceStorageProvider,
  invoiceTotals,
  reserveNextInvoiceNumber,
  type LilInvoiceLine,
  type LilInvoiceRow,
  type LilInvoiceType,
} from "@/lib/server/lilInvoices";

const INVOICE_TYPES = new Set([
  "certifopac_single_audit",
  "icpf_monthly",
  "manual",
]);

function parseLines(value: unknown): LilInvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((line) => ({
    label: String(line?.label ?? "").trim(),
    details: String(line?.details ?? "").trim(),
    quantity: Number(line?.quantity ?? 1),
    unitAmountCents: Number(line?.unitAmountCents ?? 0),
    totalAmountCents: Number(line?.totalAmountCents ?? 0),
  }));
}

function parseAuditIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

async function loadInvoice(id: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("lil_invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as LilInvoiceRow | null;
}

export async function POST(req: Request) {
  const auth = await requireLilOwner();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? "save_draft");
    const id = String(body.id ?? "").trim();
    const invoiceType = String(body.invoiceType ?? "manual") as LilInvoiceType;
    if (!INVOICE_TYPES.has(invoiceType)) {
      return NextResponse.json({ error: "Type de facture invalide." }, { status: 400 });
    }

    const linesInput = parseLines(body.lines);
    const totals = invoiceTotals(linesInput);
    if (totals.lines.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins une ligne de facture." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const existing = id ? await loadInvoice(id) : null;
    if (existing && existing.status !== "draft" && action !== "cancel") {
      return NextResponse.json(
        { error: "Une facture emise ne peut plus etre modifiee." },
        { status: 400 },
      );
    }

    if (action === "cancel") {
      if (!existing) {
        return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
      }
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("lil_invoices")
        .update({
          status: "cancelled",
          cancelled_at: now,
          updated_by_email: auth.email,
          metadata: {
            ...(existing.metadata ?? {}),
            cancelled_by: auth.email,
            cancelled_at: now,
          },
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, invoice: data });
    }

    const payload = {
      invoice_date:
        String(body.invoiceDate ?? "").trim() || new Date().toISOString().slice(0, 10),
      recipient_name: String(body.recipientName ?? "").trim(),
      recipient_address: String(body.recipientAddress ?? "").trim() || null,
      recipient_email:
        String(body.recipientEmail ?? "").trim().toLowerCase() || null,
      invoice_type: invoiceType,
      currency: "eur",
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      lines: totals.lines,
      linked_audit_ids: parseAuditIds(body.linkedAuditIds),
      updated_by_email: auth.email,
      metadata: {
        ...(existing?.metadata ?? {}),
        notes: String(body.notes ?? "").trim(),
        temporary_generator: true,
        google_drive_target_folder:
          "1DawT2mz4m6pwRR3yvgWQVpJA5iU7R9Zi",
      },
    };

    if (!payload.recipient_name || !payload.invoice_date) {
      return NextResponse.json(
        { error: "Destinataire et date de facture sont requis." },
        { status: 400 },
      );
    }

    const query = existing
      ? admin
          .from("lil_invoices")
          .update(payload)
          .eq("id", existing.id)
          .select("*")
          .single()
      : admin
          .from("lil_invoices")
          .insert({
            ...payload,
            status: "draft",
            created_by_email: auth.email,
          })
          .select("*")
          .single();

    const { data: saved, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (action !== "issue") {
      return NextResponse.json({ ok: true, invoice: saved });
    }

    const savedInvoice = saved as LilInvoiceRow;
    const numbering = await reserveNextInvoiceNumber();
    const invoiceWithNumber = {
      ...savedInvoice,
      invoice_number: numbering.invoiceNumber,
      sequence_number: numbering.sequenceNumber,
      status: "issued" as const,
      issued_at: new Date().toISOString(),
    };
    const settings = await getLilInvoiceSettings();
    const pdfBuffer = generateLilInvoicePdfBuffer({
      invoice: invoiceWithNumber,
      settings,
    });
    const storage = await invoiceStorageProvider.storePdf({
      invoice: invoiceWithNumber,
      pdfBuffer,
    });

    const { data: issued, error: issueError } = await admin
      .from("lil_invoices")
      .update({
        invoice_number: numbering.invoiceNumber,
        sequence_number: numbering.sequenceNumber,
        status: "issued",
        issued_at: invoiceWithNumber.issued_at,
        pdf_bucket: storage.bucket,
        pdf_path: storage.path,
        pdf_url: storage.publicUrl,
        updated_by_email: auth.email,
        metadata: {
          ...(savedInvoice.metadata ?? {}),
          issued_by: auth.email,
          issued_at: invoiceWithNumber.issued_at,
          storage_provider: storage.provider,
        },
      })
      .eq("id", savedInvoice.id)
      .eq("status", "draft")
      .select("*")
      .single();

    if (issueError) {
      return NextResponse.json({ error: issueError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoice: issued });
  } catch (error) {
    console.error("Action facture Lil echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
