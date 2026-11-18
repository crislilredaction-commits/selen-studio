import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/api/internal/daily-invoices/preview/route.ts", import.meta.url),
  "utf8",
);

test("preview is protected and disabled without a configured long secret", () => {
  assert.match(source, /SELEN_DAILY_INVOICE_INTERNAL_SECRET/);
  assert.match(source, /expected\.length < 32/);
  assert.match(source, /authorization/);
});

test("preview only renders existing numbered Daily invoices", () => {
  assert.match(source, /invoice_type !== "daily_subscription"/);
  assert.match(source, /!data\.invoice_number/);
  assert.match(source, /generateLilInvoicePdfBuffer/);
  assert.doesNotMatch(source, /reserveNextInvoiceNumber|\.insert\(|\.update\(|sendLilInvoiceEmail|storePdf/);
});
