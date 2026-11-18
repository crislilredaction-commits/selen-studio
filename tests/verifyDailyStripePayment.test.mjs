import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/server/verifyDailyStripePayment.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(outputText, { exports, process: { env: {} }, AbortSignal, encodeURIComponent, Number });
const { verifyDailyStripePayment } = exports;
const invoice = {
  id: "in_test123", status: "paid", amount_remaining: 0,
  amount_paid: 8900, total: 8900, subtotal: 8900, total_taxes: [], currency: "eur", customer: "cus_test123",
  invoice_pdf: "https://pay.stripe.com/invoice/test.pdf",
  number: "STRIPE-001",
  lines: { data: [{ period: { start: 1793491200, end: 1796083200 }, proration: false }] },
  parent: { type: "subscription_details", subscription_details: { subscription: "sub_test123" } },
};
function fakeFetch(inv = invoice, sub = { id: "sub_test123", metadata: { product_key: "selen_daily" }, customer: "cus_test123" }) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return { ok: true, json: async () => url.includes("/invoices/") ? inv : sub };
  };
  return { urls, fetchImpl };
}
test("Studio independently retrieves and validates paid Daily Stripe invoice", async () => {
  const fake = fakeFetch();
  const result = await verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl });
  assert.equal(result.amountPaidCents, 8900);
  assert.equal(result.stripeInvoicePdfUrl, "https://pay.stripe.com/invoice/test.pdf");
  assert.equal(result.stripeInvoiceNumber, "STRIPE-001");
  assert.equal(result.billingMonth, "2026-11");
  assert.equal(result.stripeSubscriptionId, "sub_test123");
  assert.equal(fake.urls.length, 2);
});
test("unpaid, zero-amount and mismatched invoices fail before subscription lookup", async () => {
  for (const patch of [{ status: "open" }, { amount_paid: 0 }, { id: "in_wrong" }]) {
    const fake = fakeFetch({ ...invoice, ...patch });
    await assert.rejects(verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }));
    assert.equal(fake.urls.length, 1);
  }
});
test("non-Daily subscription is rejected", async () => {
  const fake = fakeFetch(invoice, { id: "sub_test123", metadata: { product_key: "unrelated" }, customer: "cus_test123" });
  await assert.rejects(verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }));
});
test("invalid ID or missing credentials never calls Stripe", async () => {
  const fake = fakeFetch();
  await assert.rejects(verifyDailyStripePayment("bad", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }));
  await assert.rejects(verifyDailyStripePayment("in_test123", { fetchImpl: fake.fetchImpl }));
  assert.equal(fake.urls.length, 0);
});

test("Stripe invoice cannot be attributed to a different subscription customer", async () => {
  const fake = fakeFetch(invoice, {
    id: "sub_test123",
    metadata: { product_key: "selen_daily" },
    customer: "cus_another",
  });
  await assert.rejects(
    verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }),
    /not Selen Daily/,
  );
});

test("taxes and discounts cannot silently become a zero-VAT Lil invoice", async () => {
  for (const patch of [
    { total: 9000 },
    { subtotal: 10000 },
    { total_taxes: [{ amount: 100 }] },
  ]) {
    const fake = fakeFetch({ ...invoice, ...patch });
    await assert.rejects(
      verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }),
      /not a supported settled EUR payment/,
    );
    assert.equal(fake.urls.length, 1);
  }
});

test("unsupported prorations and non-calendar periods cannot allocate a Lil invoice", async () => {
  for (const patch of [
    { lines: { data: [] } },
    { lines: { data: [{ period: { start: 1793491200, end: 1796083200 }, proration: true }] } },
    { lines: { data: [{ period: { start: 1793577600, end: 1796083200 }, proration: false }] } },
  ]) {
    const fake = fakeFetch({ ...invoice, ...patch });
    await assert.rejects(
      verifyDailyStripePayment("in_test123", { secretKey: "sk_test_dummy", fetchImpl: fake.fetchImpl }),
      /Stripe/,
    );
  }
});
