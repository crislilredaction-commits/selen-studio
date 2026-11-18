import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../src/app/api/internal/daily-invoices/issue/route.ts", import.meta.url),
  "utf8",
);

test("Daily issuance route is guarded by a dedicated internal bearer secret", () => {
  assert.match(route, /SELEN_DAILY_INVOICE_INTERNAL_SECRET/);
  assert.match(route, /expected\.length < 32/);
  assert.match(route, /authorization/);
  assert.match(route, /status: 401/);
});

test("automatic issuance remains disabled by default", () => {
  assert.match(route, /SELEN_DAILY_INVOICE_ISSUE_ENABLED/);
  assert.match(route, /status: 503/);
});

test("Studio independently verifies Stripe before any future issuance", () => {
  assert.match(route, /verifyDailyStripePayment\(id\)/);
  assert.match(route, /status: 422/);
  assert.doesNotMatch(route, /\.rpc\(|\.insert\(|sendLilInvoiceEmail|invoiceStorageProvider/);
});

test("acknowledges only after processing the independently verified payment", () => {
  assert.match(route, /const status = await issueDailyInvoice\(payment\)/);
  assert.match(route, /stripeInvoiceId: id, status/);
});
