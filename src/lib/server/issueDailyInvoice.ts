import { centsToEuros } from "@/lib/lilInvoiceShared";
import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { finalizePaidDailyInvoicePdf } from "@/lib/server/finalizePaidDailyInvoice";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { renderSelenEmailFromText } from "@/lib/server/selenEmailLayout";
import type { VerifiedDailyPayment } from "@/lib/server/verifyDailyStripePayment";

function stripeHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function issueDailyInvoice(payment: VerifiedDailyPayment) {
  const db = createSupabaseAdminClient();
  const { data: prior, error: priorError } = await db
    .from("lil_daily_prior_payments")
    .select("*")
    .eq("stripe_invoice_hash", stripeHash(payment.stripeInvoiceId))
    .maybeSingle();
  if (priorError) throw priorError;
  if (prior) {
    if (
      prior.stripe_subscription_hash !==
        stripeHash(payment.stripeSubscriptionId) ||
      prior.stripe_number_hash !==
        stripeHash(payment.stripeInvoiceNumber || "") ||
      Date.parse(prior.period_start) !==
        Date.parse(payment.billingPeriodStart) ||
      Date.parse(prior.period_end_exclusive) !==
        Date.parse(payment.billingPeriodEndExclusive) ||
      prior.amount_cents !== payment.amountPaidCents
    )
      throw new Error("Historical payment mismatch.");
    return "historical";
  }
  const { data: account, error } = await db
    .from("lil_daily_billing_accounts")
    .select(
      "organisation_id,first_unbilled_period_start,organisations(legal_name,company_name,siret,legal_form,vat_number,address,administrative_address,administrative_email,email)",
    )
    .eq("stripe_subscription_id", payment.stripeSubscriptionId)
    .eq("stripe_customer_id", payment.stripeCustomerId)
    .single();
  if (error || !account) throw new Error("Subscription is not reconciled.");
  if (
    Date.parse(payment.billingPeriodStart) <
    Date.parse(account.first_unbilled_period_start)
  ) {
    throw new Error("Historical period needs reconciliation.");
  }
  const org = Array.isArray(account.organisations)
    ? account.organisations[0]
    : account.organisations;
  const name = org?.legal_name?.trim() || org?.company_name?.trim();
  const email = org?.administrative_email?.trim() || org?.email?.trim();
  const address = org?.address?.trim() || org?.administrative_address?.trim();
  if (!name || !email || !address || !/^\d{14}$/.test(org?.siret || "")) {
    throw new Error("Incomplete legal billing identity.");
  }
  const amount = payment.amountPaidCents;
  const { data: result, error: issueError } = await db.rpc(
    "issue_paid_daily_lil_invoice",
    {
      p_stripe_invoice_id: payment.stripeInvoiceId,
      p_stripe_subscription_id: payment.stripeSubscriptionId,
      p_period_start: payment.billingPeriodStart,
      p_period_end_exclusive: payment.billingPeriodEndExclusive,
      p_recipient_name: name,
      p_recipient_email: email,
      p_recipient_address: address,
      p_amount_cents: amount,
      p_invoice_date: new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Paris",
      }),
      p_lines: [
        {
          label: "Abonnement Selen Daily",
          details: payment.discountCents ? `Prix avant remise : ${centsToEuros(amount + payment.discountCents)}. Remise : ${centsToEuros(payment.discountCents)}.` : undefined,
          quantity: 1,
          unitAmountCents: amount,
          totalAmountCents: amount,
        },
      ],
      p_metadata: {
        payment_verified: true,
        stripe_paid_at: payment.paidAt,
        stripe_invoice_number: payment.stripeInvoiceNumber,
        stripe_customer_id: payment.stripeCustomerId,
        organisation_id: account.organisation_id,
        client_siren_siret: org.siret,
        client_legal_form: org.legal_form,
        client_vat_number: org.vat_number,
      },
    },
  );
  const issued = Array.isArray(result) && result.length === 1 ? result[0] : result;
  if (issueError || !issued?.id)
    throw new Error("Atomic invoice issuance failed.");
  const { invoice } = await finalizePaidDailyInvoicePdf(issued.id);
  const ledger = () => db.from("lil_daily_invoice_links");
  const { data: link, error: linkError } = await ledger()
    .select("email_status,email_first_attempt_at")
    .eq("lil_invoice_id", invoice.id)
    .single();
  if (linkError || !link) throw new Error("Delivery state unavailable.");
  if (link.email_status === "sent") return "sent";
  const pdf = await db.storage
    .from(invoice.pdf_bucket!)
    .download(invoice.pdf_path!);
  if (pdf.error || !pdf.data) throw new Error("Archived invoice unavailable.");
  // Persist the first attempt BEFORE contacting Resend. Retries use identical
  // archived bytes and a stable key within the provider's 24-hour retention.
  const claim = await ledger()
    .update({
      email_status: "sending",
      email_first_attempt_at: new Date().toISOString(),
    })
    .eq("lil_invoice_id", invoice.id)
    .is("email_first_attempt_at", null)
    .select("id")
    .maybeSingle();
  if (claim.error) throw claim.error;
  if (
    !claim.data &&
    (!link.email_first_attempt_at ||
      Date.now() - Date.parse(link.email_first_attempt_at) >= 23 * 3600000)
  ) {
    throw new Error("Check email delivery before retry.");
  }
  const subject = `Facture acquittée ${invoice.invoice_number} – Selen Daily`;
  const body = renderSelenEmailFromText({
    title: subject,
    bodyText:
      "Bonjour,\n\nVotre facture acquittée est jointe à cet email.\n\nBien cordialement,\nSelen Éditions",
  });
  const sent = await sendClientEmailWithSilence({
    organisationId: account.organisation_id,
    to: invoice.recipient_email!,
    subject,
    html: body.html,
    text: body.text,
    idempotencyKey: `daily-invoice/${invoice.id}`,
    attachments: [
      {
        filename: `${invoice.invoice_number}.pdf`,
        contentType: "application/pdf",
        content: Buffer.from(await pdf.data.arrayBuffer()),
      },
    ],
  });
  if (!sent.sent || !("resendId" in sent) || !sent.resendId)
    throw new Error("Email delivery unconfirmed.");
  const { error: sentError } = await db.rpc("mark_daily_invoice_sent", {
    p_invoice: invoice.id,
    p_provider_id: sent.resendId,
  });
  if (sentError) throw sentError;
  return "sent";
}
