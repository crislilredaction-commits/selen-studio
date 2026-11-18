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
  status_transitions?: { paid_at?: number };
  payments?: { has_more?: boolean; data?: Array<{
    status?: string; amount_paid?: number; payment?: {type?: string; payment_intent?: string};
  }> };
  lines?: { has_more?: boolean; data?: Array<{ period?: { start?: number; end?: number }; proration?: boolean; parent?: { subscription_item_details?: {proration?: boolean} } }> };
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
  discountCents: number;
  paidAt: string;
  amountPaidCents: number;
  currency: "eur";
  stripeInvoicePdfUrl: string | null;
  stripeInvoiceNumber: string | null;
  billingPeriodStart: string;
  billingPeriodEndExclusive: string;
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
      headers: { Authorization: `Bearer ${secret}`, "Stripe-Version": "2026-04-22.dahlia" },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`Stripe verification failed: HTTP ${response.status}`);
    return await response.json() as T;
  }
  const invoice = await stripeGet<StripeInvoiceRecord>(`invoices/${encodeURIComponent(stripeInvoiceId)}?expand[]=payments`);
  if (invoice.id !== stripeInvoiceId || invoice.status !== "paid" ||
      invoice.amount_remaining !== 0 || invoice.currency !== "eur" ||
      !Number.isSafeInteger(invoice.amount_paid) || (invoice.amount_paid ?? 0) <= 0 ||
      invoice.total !== invoice.amount_paid || !Number.isSafeInteger(invoice.subtotal) ||
      invoice.subtotal! < invoice.total! ||
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
  if (invoice.lines?.has_more || lineItems?.[0]?.parent?.subscription_item_details?.proration || !lineItems || lineItems.length !== 1 || lineItems[0].proration === true ||
      !Number.isSafeInteger(lineItems[0].period?.start) ||
      !Number.isSafeInteger(lineItems[0].period?.end)) {
    throw new Error("Unsupported Stripe billing period or prorated invoice.");
  }
  const start = new Date(lineItems[0].period!.start! * 1000);
  const end = new Date(lineItems[0].period!.end! * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      end.getTime() <= start.getTime()) {
    throw new Error("Invalid Stripe subscription service period.");
  }
  const payments = invoice.payments?.data?.filter((entry) => entry.status === "paid");
  const payment = payments?.[0];
  const intentId = payment?.payment?.payment_intent;
  if (invoice.payments?.has_more || payments?.length !== 1 || payment?.amount_paid !== invoice.amount_paid ||
      payment?.payment?.type !== "payment_intent" || typeof intentId !== "string" || !/^pi_[a-zA-Z0-9]+$/.test(intentId) ||
      !Number.isSafeInteger(invoice.status_transitions?.paid_at)) {
    throw new Error("Stripe charge confirmation missing.");
  }
  const intent = await stripeGet<{id: string; status: string; currency: string; customer: string;
    amount_received: number; latest_charge?: {paid: boolean; refunded: boolean; amount_refunded: number; disputed: boolean}
  }>(`payment_intents/${intentId}?expand[]=latest_charge`);
  const charge = intent.latest_charge;
  if (intent.id !== intentId || intent.status !== "succeeded" || intent.customer !== customerId ||
      intent.currency !== "eur" || intent.amount_received !== invoice.amount_paid ||
      !charge?.paid || charge.refunded !== false || charge.amount_refunded !== 0 || charge.disputed !== false) {
    throw new Error("Stripe payment is not fully collected.");
  }
  // Stripe periods are [start, end). Preserve their actual cycle boundaries,
  // e.g. 15 November through 14 December, not calendar-month buckets.
  const periodStart = start.toISOString();
  const periodEndExclusive = end.toISOString();
  return {
    stripeInvoiceId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    discountCents: invoice.subtotal! - invoice.total!,
    paidAt: new Date(invoice.status_transitions!.paid_at! * 1000).toISOString(),
    amountPaidCents: invoice.amount_paid!,
    currency: "eur",
    billingPeriodStart: periodStart,
    billingPeriodEndExclusive: periodEndExclusive,
    stripeInvoiceNumber: typeof invoice.number === "string" ? invoice.number : null,
    stripeInvoicePdfUrl: typeof invoice.invoice_pdf === "string" && /^https:\/\//.test(invoice.invoice_pdf) ? invoice.invoice_pdf : null,
  };
}
