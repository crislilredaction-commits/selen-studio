/**
 * Studio-side independent verification of Stripe payment.
 * Never trust the amount, subscription or customer identity supplied by Daily.
 * This module has no database writes and cannot issue a fiscal invoice.
 */
type StripeInvoiceRecord = {
  id?: string;
  status?: string;
  amount_remaining?: number;
  amount_paid?: number;
  total?: number;
  subtotal?: number;
  total_taxes?: Array<{ amount?: number }>;
  currency?: string;
  customer?: string | { id: string };
  invoice_pdf?: string | null;
  number?: string | null;
  lines?: { data?: Array<{ period?: { start?: number; end?: number }; proration?: boolean }> };
  parent?: {
    type?: string;
    subscription_details?: { subscription?: string | { id: string } };
  };
};
type StripeSubscriptionRecord = {
  id?: string;
  metadata?: Record<string, string>;
  customer?: string | { id: string };
};

export type VerifiedDailyPayment = {
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  amountPaidCents: number;
  currency: "eur";
  stripeInvoicePdfUrl: string | null;
  stripeInvoiceNumber: string | null;
  billingMonth: string;
};

export async function verifyDailyStripePayment(
  stripeInvoiceId: string,
  options: { secretKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<VerifiedDailyPayment> {
  if (!/^in_[A-Za-z0-9]+$/.test(stripeInvoiceId)) {
    throw new Error("Invalid Stripe invoice ID.");
  }
  const secret = options.secretKey ?? process.env.STRIPE_SECRET_KEY;
  if (!secret || !/^sk_(test|live)_/.test(secret)) {
    throw new Error("Studio Stripe secret not configured.");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  async function stripeGet<T>(path: string): Promise<T> {
    const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Stripe verification failed: HTTP ${response.status}`);
    return await response.json() as T;
  }
  const invoice = await stripeGet<StripeInvoiceRecord>(`invoices/${encodeURIComponent(stripeInvoiceId)}`);
  if (invoice.id !== stripeInvoiceId || invoice.status !== "paid" ||
      invoice.amount_remaining !== 0 || invoice.currency !== "eur" ||
      !Number.isSafeInteger(invoice.amount_paid) || (invoice.amount_paid ?? 0) <= 0 ||
      invoice.total !== invoice.amount_paid || invoice.subtotal !== invoice.amount_paid ||
      (invoice.total_taxes ?? []).some((tax) => tax.amount !== 0)) {
    throw new Error("Stripe invoice is not a supported settled EUR payment.");
  }
  const subscriptionRef = invoice.parent?.type === "subscription_details"
    ? invoice.parent.subscription_details?.subscription : undefined;
  const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!subscriptionId || !/^sub_[A-Za-z0-9]+$/.test(subscriptionId) ||
      !customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)) {
    throw new Error("Stripe subscription/customer identity missing.");
  }
  const subscription = await stripeGet<StripeSubscriptionRecord>(`subscriptions/${encodeURIComponent(subscriptionId)}`);
  const subscriptionCustomerId = typeof subscription.customer === "string"
    ? subscription.customer : subscription.customer?.id;
  if (subscription.id !== subscriptionId || subscription.metadata?.product_key !== "selen_daily" ||
      subscriptionCustomerId !== customerId) {
    throw new Error("Stripe subscription is not Selen Daily.");
  }
  const lineItems = invoice.lines?.data;
  if (!lineItems || lineItems.length !== 1 || lineItems[0].proration === true ||
      !Number.isSafeInteger(lineItems[0].period?.start) ||
      !Number.isSafeInteger(lineItems[0].period?.end)) {
    throw new Error("Unsupported Stripe billing period or prorated invoice.");
  }
  const start = new Date(lineItems[0].period!.start! * 1000);
  const end = new Date(lineItems[0].period!.end! * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      start.getUTCDate() !== 1 || start.getUTCHours() !== 0 ||
      start.getUTCMinutes() !== 0 || end.getTime() <= start.getTime() ||
      end.getUTCDate() !== 1 || end.getUTCHours() !== 0 ||
      end.getUTCMinutes() !== 0 ||
      (end.getUTCFullYear() * 12 + end.getUTCMonth()) -
      (start.getUTCFullYear() * 12 + start.getUTCMonth()) !== 1) {
    throw new Error("Stripe invoice does not cover exactly one calendar month.");
  }
  return {
    stripeInvoiceId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    amountPaidCents: invoice.amount_paid!,
    currency: "eur",
    billingMonth: start.toISOString().slice(0, 7),
    stripeInvoiceNumber: typeof invoice.number === "string" ? invoice.number : null,
    stripeInvoicePdfUrl: typeof invoice.invoice_pdf === "string" && /^https:\/\//.test(invoice.invoice_pdf) ? invoice.invoice_pdf : null,
  };
}
