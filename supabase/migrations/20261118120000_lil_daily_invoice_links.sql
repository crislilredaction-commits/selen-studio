-- Allow the Daily invoice type in the canonical Gestion Lil table.
-- Original constraint is in 20260629110000_create_lil_invoice_generator.sql.
alter table public.lil_invoices
  drop constraint if exists lil_invoices_type_check;
alter table public.lil_invoices
  add constraint lil_invoices_type_check check (
    invoice_type in ('certifopac_single_audit', 'icpf_monthly', 'manual', 'daily_subscription')
  );

-- Selen Daily: deduplication ledger for the existing Gestion Lil invoice sequence.
-- Apply only after reviewing the Studio/Daily database boundary and tax configuration.
-- This table does NOT allocate invoice numbers: lil_invoices + next_lil_invoice_number remain canonical.
create table if not exists public.lil_daily_invoice_links (
  id uuid primary key default gen_random_uuid(),
  stripe_invoice_id text unique,
  stripe_subscription_id text not null,
  billing_month date not null,
  billing_profile_id uuid,
  lil_invoice_id uuid unique references public.lil_invoices(id) on delete restrict,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lil_daily_billing_month_first_day
    check (extract(day from billing_month) = 1),
  constraint lil_daily_stripe_invoice_format
    check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  constraint lil_daily_invoice_unique_period
    unique (stripe_subscription_id, billing_month)
);

create index if not exists lil_daily_invoice_links_invoice_id_idx
  on public.lil_daily_invoice_links (lil_invoice_id);

alter table public.lil_daily_invoice_links enable row level security;
revoke all on public.lil_daily_invoice_links from public, anon, authenticated;
grant select, insert, update on public.lil_daily_invoice_links to service_role;

comment on table public.lil_daily_invoice_links is
  'Links Stripe subscription billing months to canonical Gestion Lil invoices. Never allocates an independent invoice number. Server-only.';

-- IMPORTANT: the actual invoice-number allocation + link insert must be a single
-- transactional RPC before this ledger can safely be used by a webhook.
-- A unique period assumes one invoice per subscription/calendar month; validate
-- prorations and subscription-cycle boundaries before enabling automatic issuance.

-- The application-level name/month check is insufficient for concurrent manual requests.
-- Enforce uniqueness in PostgreSQL as well. Cancelled invoices remain in the audit trail,
-- but a new corrected invoice can be created explicitly after cancellation.
-- This temporary key must be replaced with a stable Daily subscription identifier
-- before enabling automated issuance.
create unique index if not exists lil_daily_manual_unique_client_month_idx
  on public.lil_invoices (
    lower(btrim(recipient_name)),
    (metadata ->> 'daily_billing_month')
  )
  where invoice_type = 'daily_subscription'
    and status <> 'cancelled';

-- Validate metadata for new Daily rows. Existing non-Daily invoices are unaffected.
alter table public.lil_invoices
  add constraint lil_daily_billing_month_valid_check
  check (
    invoice_type <> 'daily_subscription'
    or (
      metadata ->> 'daily_billing_month' ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and recipient_name <> ''
    )
  );
