import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../src/lib/server/reconcileDailyStripeInvoice.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../src/app/api/internal/daily-invoices/reconcile/route.ts", import.meta.url), "utf8");

test("read-only reconciliation checks Stripe payment and overlapping service periods", () => {
  assert.match(helper, /verifyDailyStripePayment\(stripeInvoiceId\)/);
  assert.match(helper, /\.lt\("period_start", payment\.billingPeriodEndExclusive\)/);
  assert.match(helper, /\.gt\("period_end_exclusive", payment\.billingPeriodStart\)/);
  assert.match(helper, /conflictingPeriods/);
  assert.match(helper, /needs_reconciliation/);
});
test("reconciliation cannot create, number, email or upload fiscal invoices", () => {
  assert.doesNotMatch(helper + route, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(|\.upload\(|sendLilInvoiceEmail|reserveNextInvoiceNumber/);
});
test("reconciliation is authenticated and does not expose raw Stripe failures", () => {
  assert.match(route, /SELEN_DAILY_INVOICE_INTERNAL_SECRET/);
  assert.match(route, /expected\.length < 32/);
  assert.match(route, /Cache-Control.*no-store/);
  assert.match(route, /Rapprochement indisponible/);
});
