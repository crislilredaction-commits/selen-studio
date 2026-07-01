import { NextResponse } from "next/server";
import { requireLilOwner } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  generateLilInvoicePdfBuffer,
  getLilInvoiceSettings,
  invoiceStorageProvider,
  invoiceTotals,
  reserveNextInvoiceNumber,
  sendLilInvoiceEmail,
  type LilInvoiceLine,
  type LilInvoiceRow,
  type LilInvoiceType,
} from "@/lib/server/lilInvoices";

const INVOICE_TYPES = new Set([
  "certifopac_single_audit",
  "icpf_monthly",
  "manual",
]);

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

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

async function archiveLinkedAudits(
  admin: SupabaseAdmin,
  invoice: LilInvoiceRow,
  archivedBy: string,
) {
  const auditIds = Array.isArray(invoice.linked_audit_ids)
    ? invoice.linked_audit_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (auditIds.length === 0) return [];

  const { data, error } = await admin
    .from("external_audits")
    .select("id,metadata")
    .in("id", auditIds);

  if (error) {
    console.error("Archivage audits factures echoue.", {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      error: error.message,
    });
    return auditIds.map((id) => ({ id, status: "failed", error: error.message }));
  }

  const now = new Date().toISOString();
  const results = [];
  for (const audit of data ?? []) {
    const metadata =
      audit.metadata && typeof audit.metadata === "object"
        ? (audit.metadata as Record<string, unknown>)
        : {};
    const { error: updateError } = await admin
      .from("external_audits")
      .update({
        metadata: {
          ...metadata,
          archived: true,
          archived_at: metadata.archived_at || now,
          archived_by: archivedBy,
          archived_reason: "invoice_generated",
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
      })
      .eq("id", audit.id);

    console.info("external_audit_archived_from_invoice", {
      auditId: audit.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: updateError ? "failed" : "archived",
      error: updateError?.message ?? null,
    });

    results.push({
      id: audit.id,
      status: updateError ? "failed" : "archived",
      error: updateError?.message ?? null,
    });
  }

  return results;
}

async function findLinkedAuditConflicts(
  admin: SupabaseAdmin,
  auditIds: string[],
  currentInvoiceId?: string,
) {
  if (auditIds.length === 0) return [];

  const { data, error } = await admin
    .from("lil_invoices")
    .select("id,invoice_number,linked_audit_ids")
    .neq("status", "cancelled")
    .limit(2000);

  if (error) throw new Error(error.message);
  const requested = new Set(auditIds);
  return (data ?? [])
    .filter((invoice) => invoice.id !== currentInvoiceId)
    .flatMap((invoice) =>
      Array.isArray(invoice.linked_audit_ids)
        ? invoice.linked_audit_ids
            .map((id) => String(id))
            .filter((id) => requested.has(id))
            .map((auditId) => ({
              auditId,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoice_number ?? "brouillon",
            }))
        : [],
    );
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
    if (!["cancel", "mark_paid", "send_email"].includes(action) && totals.lines.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins une ligne de facture." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const existing = id ? await loadInvoice(id) : null;
    const allowedLockedActions = new Set(["cancel", "mark_paid", "send_email"]);
    if (
      existing &&
      existing.status !== "draft" &&
      !allowedLockedActions.has(action)
    ) {
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

    if (action === "mark_paid") {
      if (!existing) {
        return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
      }
      if (existing.status === "cancelled") {
        return NextResponse.json(
          { error: "Une facture annulee ne peut pas etre marquee payee." },
          { status: 400 },
        );
      }
      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("lil_invoices")
        .update({
          status: "paid",
          paid_at: now,
          updated_by_email: auth.email,
          metadata: {
            ...(existing.metadata ?? {}),
            paid_by: auth.email,
            paid_at: now,
          },
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, invoice: data });
    }

    if (action === "send_email") {
      if (!existing) {
        return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
      }
      if (existing.status === "cancelled") {
        return NextResponse.json(
          { error: "Une facture annulee ne peut pas etre envoyee." },
          { status: 400 },
        );
      }
      if (!existing.pdf_url || !existing.invoice_number) {
        return NextResponse.json(
          { error: "Generez le PDF avant d'envoyer la facture." },
          { status: 400 },
        );
      }
      const settings = await getLilInvoiceSettings();
      const email = await (async () => {
        try {
          return await sendLilInvoiceEmail({ invoice: existing, settings });
        } catch (error) {
          return {
            sent: false,
            error: error instanceof Error ? error.message : "Erreur Resend inconnue.",
            to: existing.recipient_email || "",
          };
        }
      })();
      console.info("lil_invoice_email", {
        invoiceId: existing.id,
        invoiceNumber: existing.invoice_number,
        recipient: email.to,
        status: email.sent ? "sent" : "failed",
        error: email.error ?? null,
      });
      if (email.sent) {
        const now = new Date().toISOString();
        const { data, error } = await admin
          .from("lil_invoices")
          .update({
            status: existing.status === "paid" ? "paid" : "sent",
            sent_at: existing.sent_at || now,
            email_sent_at: now,
            updated_by_email: auth.email,
            metadata: {
              ...(existing.metadata ?? {}),
              invoice_email_to: email.to,
              invoice_email_sent_at: now,
              invoice_email_error: null,
            },
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const archivedAudits = await archiveLinkedAudits(
          admin,
          data as LilInvoiceRow,
          auth.email,
        );
        return NextResponse.json({ ok: true, invoice: data, email, archivedAudits });
      }

      await admin
        .from("lil_invoices")
        .update({
          metadata: {
            ...(existing.metadata ?? {}),
            invoice_email_to: email.to,
            invoice_email_error: email.error ?? "Erreur inconnue.",
            invoice_email_failed_at: new Date().toISOString(),
          },
        })
        .eq("id", existing.id);

      return NextResponse.json({ ok: true, invoice: existing, email });
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

    const linkedConflicts = await findLinkedAuditConflicts(
      admin,
      payload.linked_audit_ids,
      existing?.id,
    );
    if (linkedConflicts.length > 0) {
      return NextResponse.json(
        {
          error: "Un ou plusieurs audits sont deja lies a une autre facture.",
          conflicts: linkedConflicts,
        },
        { status: 400 },
      );
    }

    if (!payload.recipient_name || !payload.invoice_date) {
      return NextResponse.json(
        { error: "Destinataire et date de facture sont requis." },
        { status: 400 },
      );
    }

    if (action === "issue" && !payload.recipient_email) {
      return NextResponse.json(
        { error: "Email destinataire requis pour envoyer la facture." },
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
    const invoiceReadyToSend = {
      ...invoiceWithNumber,
      pdf_bucket: storage.bucket,
      pdf_path: storage.path,
      pdf_url: storage.publicUrl,
    };
    const email = await (async () => {
      try {
        return await sendLilInvoiceEmail({ invoice: invoiceReadyToSend, settings });
      } catch (error) {
        return {
          sent: false,
          error: error instanceof Error ? error.message : "Erreur Resend inconnue.",
          to: invoiceReadyToSend.recipient_email || "",
        };
      }
    })();
    const now = new Date().toISOString();
    console.info("lil_invoice_email", {
      invoiceId: savedInvoice.id,
      invoiceNumber: numbering.invoiceNumber,
      recipient: email.to,
      status: email.sent ? "sent" : "failed",
      error: email.error ?? null,
    });

    const { data: issued, error: issueError } = await admin
      .from("lil_invoices")
      .update({
        invoice_number: numbering.invoiceNumber,
        sequence_number: numbering.sequenceNumber,
        status: email.sent ? "sent" : "issued",
        issued_at: invoiceWithNumber.issued_at,
        sent_at: email.sent ? now : null,
        email_sent_at: email.sent ? now : null,
        pdf_bucket: storage.bucket,
        pdf_path: storage.path,
        pdf_url: storage.publicUrl,
        updated_by_email: auth.email,
        metadata: {
          ...(savedInvoice.metadata ?? {}),
          issued_by: auth.email,
          issued_at: invoiceWithNumber.issued_at,
          storage_provider: storage.provider,
          invoice_email_to: email.to,
          invoice_email_sent_at: email.sent ? now : null,
          invoice_email_error: email.sent ? null : email.error,
        },
      })
      .eq("id", savedInvoice.id)
      .eq("status", "draft")
      .select("*")
      .single();

    if (issueError) {
      return NextResponse.json({ error: issueError.message }, { status: 500 });
    }

    const archivedAudits = await archiveLinkedAudits(
      admin,
      issued as LilInvoiceRow,
      auth.email,
    );

    return NextResponse.json({ ok: true, invoice: issued, email, archivedAudits });
  } catch (error) {
    console.error("Action facture Lil echouee.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
