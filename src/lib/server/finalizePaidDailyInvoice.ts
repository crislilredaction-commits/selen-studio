import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import {
  generateLilInvoicePdfBuffer,
  getLilInvoiceSettings,
  invoiceStorageProvider,
  type LilInvoiceRow,
  type LilInvoiceSettings,
} from "@/lib/server/lilInvoices";

/**
 * Retryable PDF finalization for an ALREADY issued canonical Daily invoice.
 * Does not allocate numbers, create invoices, send emails or change payment status.
 * Only invoke after the atomic issuance RPC has been validated and enabled.
 */
export async function finalizePaidDailyInvoicePdf(invoiceId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoiceId)) {
    throw new Error("Invalid Daily invoice identifier.");
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("lil_invoices")
    .select("*").eq("id", invoiceId).single();
  if (error || !data) throw new Error(error?.message || "Daily invoice not found.");
  const invoice = data as LilInvoiceRow;
  if (invoice.invoice_type !== "daily_subscription" || invoice.status !== "paid" ||
      !invoice.invoice_number || !invoice.sequence_number) {
    throw new Error("Invoice is not a paid numbered Daily invoice.");
  }
  if (invoice.pdf_path && invoice.pdf_bucket) {
    return { invoice, alreadyStored: true };
  }
  const snapshot = invoice.metadata?.issuer_settings;
  const settings = snapshot && typeof snapshot === "object"
    ? snapshot as LilInvoiceSettings : await getLilInvoiceSettings();
  const pdfBuffer = generateLilInvoicePdfBuffer({ invoice, settings });
  const storage = await invoiceStorageProvider.storePdf({ invoice, pdfBuffer });
  const { data: updated, error: updateError } = await admin.from("lil_invoices")
    .update({
      pdf_bucket: storage.bucket,
      pdf_path: storage.path,
      pdf_url: storage.publicUrl,
    })
    .eq("id", invoice.id)
    .eq("invoice_type", "daily_subscription")
    .eq("status", "paid")
    .is("pdf_path", null)
    .select("*").maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (updated) return { invoice: updated as LilInvoiceRow, alreadyStored: false };
  const { data: concurrent, error: concurrentError } = await admin.from("lil_invoices")
    .select("*").eq("id", invoice.id).single();
  if (concurrentError || !concurrent?.pdf_path) {
    throw new Error("Daily PDF storage needs reconciliation.");
  }
  return { invoice: concurrent as LilInvoiceRow, alreadyStored: true };
}
