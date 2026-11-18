# Daily invoicing: production activation gate

Status: NOT APPROVED. Both `SELEN_DAILY_INVOICE_ISSUE_ENABLED` (Studio) and
`SELEN_DAILY_INVOICE_FORWARD_ENABLED` (Daily) must remain disabled.

## Fiscal decision required

Stripe already generates a numbered invoice for a paid Daily subscription.
Before activating a second canonical Lil invoice, determine with the accountant
whether Stripe invoices are the legally issued customer invoices, or whether
Stripe is only a payment intermediary and its invoice issuance can be disabled.
Never issue both independently for the same supply. Keep Stripe invoice ID,
Stripe invoice number, payment date, amount, and service period in the ledger.

## Technical gates

- [ ] Run both migrations against isolated PostgreSQL with the actual Studio schema.
- [ ] Verify idempotency, concurrent webhook retries, and overlapping billing periods.
- [ ] Verify the real subscription billing period (15 November through 14 December).
- [ ] Verify client legal identity and postal address from Stripe or a verified profile.
- [ ] Check taxes, discounts, credits, refunds and prorations against actual Stripe payloads.
- [ ] Reconcile any pre-existing manual invoices before automatic numbering.
- [ ] Implement and test the end-to-end issuing handler; currently it intentionally
      returns HTTP 503 even if its flag is enabled.
- [ ] Verify PDF persistence, link access control, and retry-safe email delivery.
- [ ] Review production environment secrets and data retention.
- [ ] Obtain explicit approval before applying migrations or enabling either flag.

No migration, fiscal invoice issuance, email or payment should occur merely
by merging this draft branch.
