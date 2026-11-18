import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/lib/server/finalizePaidDailyInvoice.ts", import.meta.url), "utf8",
);

test("PDF finalization never allocates a second invoice number or sends email", () => {
  assert.doesNotMatch(source, /reserveNextInvoiceNumber|next_lil_invoice_number|sendLilInvoiceEmail/);
  assert.match(source, /generateLilInvoicePdfBuffer/);
  assert.match(source, /invoiceStorageProvider\.storePdf/);
});
test("PDF finalization only accepts paid and numbered Daily invoices", () => {
  assert.match(source, /invoice\.invoice_type !== "daily_subscription"/);
  assert.match(source, /invoice\.status !== "paid"/);
  assert.match(source, /!invoice\.invoice_number/);
});
test("PDF finalization is retry-safe and refuses overwriting recorded PDF", () => {
  assert.match(source, /invoice\.pdf_path && invoice\.pdf_bucket/);
  assert.match(source, /\.is\("pdf_path", null\)/);
  assert.match(source, /Daily PDF storage needs reconciliation/);
});
