import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { verifyDailyStripePayment } from "@/lib/server/verifyDailyStripePayment";

/**
 * Read-only reconciliation of an independently verified Stripe payment.
 * No fiscal invoice is created: Stripe may already have issued one.
 */
export async function reconcileDailyStripeInvoice(stripeInvoiceId: string) {
  const payment = await verifyDailyStripePayment(stripeInvoiceId);
  const admin = createSupabaseAdminClient();
  const { data: links, error: linksError } = await admin
    .from("lil_daily_invoice_links")
    .select("stripe_invoice_id,stripe_subscription_id,period_start,period_end_exclusive,lil_invoice_id,payment_status,email_status")
    .eq("stripe_subscription_id", payment.stripeSubscriptionId)
    .lt("period_start", payment.billingPeriodEndExclusive)
    .gt("period_end_exclusive", payment.billingPeriodStart)
    .limit(10);
  if (linksError) throw new Error(linksError.message);

  const exactLink = (links ?? []).find((link) =>
    link.stripe_invoice_id === payment.stripeInvoiceId &&
    Date.parse(link.period_start) === Date.parse(payment.billingPeriodStart) &&
    Date.parse(link.period_end_exclusive) === Date.parse(payment.billingPeriodEndExclusive)
  );
  const conflictingLinks = (links ?? []).filter((link) =>
    link !== exactLink
  );

  const { data: existingInvoice, error: invoiceError } = await admin
    .from("lil_invoices")
    .select("id,invoice_number,invoice_type,status,total_cents,currency,pdf_path")
    .eq("id", exactLink?.lil_invoice_id ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  if (invoiceError) throw new Error(invoiceError.message);

  return {
    stripeInvoiceId: payment.stripeInvoiceId,
    stripeInvoiceNumber: payment.stripeInvoiceNumber,
    stripeInvoicePdfUrl: payment.stripeInvoicePdfUrl,
    stripeSubscriptionId: payment.stripeSubscriptionId,
    stripeCustomerId: payment.stripeCustomerId,
    amountPaidCents: payment.amountPaidCents,
    currency: payment.currency,
    billingPeriodStart: payment.billingPeriodStart,
    billingPeriodEndExclusive: payment.billingPeriodEndExclusive,
    existingLilInvoice: existingInvoice ?? null,
    linked: Boolean(exactLink),
    conflictingPeriods: conflictingLinks.length,
    status: conflictingLinks.length ? "needs_reconciliation" :
      exactLink && existingInvoice ? "already_linked" :
      exactLink ? "broken_link" : "unlinked",
  };
}
