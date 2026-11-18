import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(
  new URL("../supabase/migrations/20261118130000_issue_paid_daily_lil_invoice.sql", import.meta.url),
  "utf8",
);

test("paid Daily invoice uses existing canonical number allocator", () => {
  assert.match(sql, /public\.next_lil_invoice_number\(\)/);
  assert.match(sql, /insert into public\.lil_invoices/);
  assert.match(sql, /insert into public\.lil_daily_invoice_links/);
  assert.doesNotMatch(sql, /create (?:table|sequence).*daily_invoice_sequence/i);
});

test("issuance has transactional locking and idempotent Stripe lookup", () => {
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /where stripe_invoice_id = p_stripe_invoice_id/);
  assert.match(sql, /return v_existing/);
  assert.match(sql, /Existing manual Daily invoice requires reconciliation/);
});

test("RPC cannot be called with end-user database roles", () => {
  assert.match(sql, /request\.jwt\.claim\.role/);
  assert.match(sql, /revoke all on function public\.issue_paid_daily_lil_invoice/);
  assert.match(sql, /grant execute on function public\.issue_paid_daily_lil_invoice/);
});

test("Daily invoices preserve audit-model VAT exemption and paid Stripe terms", () => {
  assert.match(sql, /tax_cents, total_cents/);
  assert.match(sql, /p_amount_cents, 0, p_amount_cents/);
  assert.match(sql, /TVA non applicable, art\. 293 B du CGI/);
  assert.match(sql, /Facture acquittee - paiement recu par Stripe/);
});

test("SQL migration contains exactly one complete function and permission grant", () => {
  assert.equal((sql.match(/create or replace function public\.issue_paid_daily_lil_invoice\(/g) ?? []).length, 1);
  assert.equal((sql.match(/grant execute on function public\.issue_paid_daily_lil_invoice\(/g) ?? []).length, 1);
  assert.match(sql, /unitAmountCents'\)\s*::numeric <> p_amount_cents/);
  assert.match(sql, /quantity'\)\s*::numeric <> 1/);
  assert.doesNotMatch(sql, /\^\[0-9\]\+\s+or jsonb_typeof/);
});
