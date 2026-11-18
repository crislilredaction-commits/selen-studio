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
  period_start timestamptz not null,
  period_end_exclusive timestamptz not null,
  billing_profile_id uuid,
  lil_invoice_id uuid unique references public.lil_invoices(id) on delete restrict,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lil_daily_period_order
    check (period_end_exclusive > period_start),
  constraint lil_daily_stripe_invoice_format
    check (stripe_invoice_id is null or stripe_invoice_id ~ '^in_[A-Za-z0-9]+$'),
  constraint lil_daily_invoice_unique_period
    unique (stripe_subscription_id, period_start, period_end_exclusive)
);

create index if not exists lil_daily_invoice_links_invoice_id_idx
  on public.lil_daily_invoice_links (lil_invoice_id);

alter table public.lil_daily_invoice_links enable row level security;
revoke all on public.lil_daily_invoice_links from public, anon, authenticated;
grant select, insert, update on public.lil_daily_invoice_links to service_role;

comment on table public.lil_daily_invoice_links is
  'Links Stripe subscription billing periods to canonical Gestion Lil invoices. Never allocates an independent invoice number. Server-only.';

-- IMPORTANT: the actual invoice-number allocation + link insert must be a single
-- transactional RPC before this ledger can safely be used by a webhook.
-- A unique period assumes one invoice per subscription/exact Stripe period; validate
-- prorations and subscription-cycle boundaries before enabling automatic issuance.

-- The application-level name/month check is insufficient for concurrent manual requests.
-- Enforce uniqueness in PostgreSQL as well. Cancelled invoices remain in the audit trail,
-- but a new corrected invoice can be created explicitly after cancellation.
-- This temporary key must be replaced with a stable Daily subscription identifier
-- before enabling automated issuance.
create unique index if not exists lil_daily_manual_unique_client_period_idx
  on public.lil_invoices (
    lower(btrim(recipient_name)),
    (metadata ->> 'daily_period_start'),
    (metadata ->> 'daily_period_end')
  )
  where invoice_type = 'daily_subscription'
    and status <> 'cancelled';

-- Validate metadata for new Daily rows. Existing non-Daily invoices are unaffected.
alter table public.lil_invoices
  add constraint lil_daily_billing_month_valid_check
  check (
    invoice_type <> 'daily_subscription'
    or (
      coalesce(metadata ->> 'daily_period_start','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and coalesce(metadata ->> 'daily_period_end','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and (metadata ->> 'daily_period_end') >= (metadata ->> 'daily_period_start')
      and btrim(recipient_name) <> ''
    )
  );

-- Reviewed association for existing subscriptions. Enrol only after historical reconciliation.
create table public.lil_daily_billing_accounts (
  stripe_subscription_id text primary key,
  stripe_customer_id text not null,
  organisation_id uuid not null references public.organisations(id),
  first_unbilled_period_start timestamptz not null
);
alter table public.lil_daily_billing_accounts enable row level security;
revoke all on public.lil_daily_billing_accounts from public, anon, authenticated;
grant select,insert,update on public.lil_daily_billing_accounts to service_role;

alter table public.lil_daily_invoice_links add column email_first_attempt_at timestamptz, add column email_provider_id text;
insert into storage.buckets (id,name,public)
values ('lil-daily-invoices','lil-daily-invoices',false);

-- Imported evidence only. A match never allocates a number or schedules an email.
create table public.lil_daily_prior_payments (
  stripe_invoice_hash text primary key,
  stripe_subscription_hash text not null,
  invoice_number text unique not null check (invoice_number ~ '^F[0-9]{6}$'),
  stripe_number_hash text not null,
  period_start timestamptz not null,
  period_end_exclusive timestamptz not null check (period_end_exclusive > period_start),
  amount_cents integer not null check (amount_cents > 0)
);
alter table public.lil_daily_prior_payments enable row level security;
revoke all on public.lil_daily_prior_payments from public,anon,authenticated;
grant select,insert on public.lil_daily_prior_payments to service_role;

-- Historical document matches verified read-only on 2026-11-18. No invoice or email is created.
insert into public.lil_daily_prior_payments
  (stripe_invoice_hash, stripe_subscription_hash, invoice_number, stripe_number_hash, period_start, period_end_exclusive, amount_cents) values
  ('ae82b53b49ff2d85c5e5554e4e77c36c9b6322279b2d7e2fab571883d9643593','344b903d6a9df7ef23f6bd001959d527bcd47b080fc93940be911c27749a1108','F000437','5bcefb0353ce9a431982e85333ad0f2ddcff9352bf93631284e98bdf3e3528a1','2026-11-14T18:50:51.000Z','2026-12-14T18:50:51.000Z',6900),
  ('8b3230fd9d2f883e42e333650fc3fd1953019324322372a76f8edbd130b87544','344b903d6a9df7ef23f6bd001959d527bcd47b080fc93940be911c27749a1108','F000436','ec370448e9ac320844f84c80b02566040e0f379b11d553ae8f0611f45e1b9ae1','2026-10-14T18:50:51.000Z','2026-11-14T18:50:51.000Z',6900),
  ('7de261995e301043205c4212230c6ea9ce58ca74c8f2aeaf420c920f294656dc','344b903d6a9df7ef23f6bd001959d527bcd47b080fc93940be911c27749a1108','F000435','232b79826396b18fee70e675bc135bba6c04e99afc9e1514012a0e0bb92fcae3','2026-09-14T18:50:51.000Z','2026-10-14T18:50:51.000Z',6900);
