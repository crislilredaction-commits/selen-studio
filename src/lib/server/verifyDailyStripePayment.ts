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
  currency?: string;
  customer?: string | { id: string };
  invoice_pdf?: string | null;
  parent?: {
    type?: string;
    subscription_details?: { subscription?: string | { id: string } };
  };
};
type StripeSubscriptionRecord = {
  id?: string;
  metadata?: Record<string, string>;
};

export type VerifiedDailyPayment = {
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  amountPaidCents: number;
  currency: "eur";
  stripeInvoicePdfUrl: string | null;
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
      !Number.isSafeInteger(invoice.amount_paid) || (invoice.amount_paid ?? 0) <= 0) {
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
  if (subscription.id !== subscriptionId || subscription.metadata?.product_key !== "selen_daily") {
    throw new Error("Stripe subscription is not Selen Daily.");
  }
  return {
    stripeInvoiceId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    amountPaidCents: invoice.amount_paid!,
    currency: "eur",
    stripeInvoicePdfUrl: typeof invoice.invoice_pdf === "string" && /^https:\/\//.test(invoice.invoice_pdf) ? invoice.invoice_pdf : null,
  };
}
