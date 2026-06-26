create table if not exists public.selen_payments (
  id uuid primary key default gen_random_uuid(),
  client_email text,
  prestation_type text,
  amount_cents integer not null,
  original_amount_cents integer,
  discount_amount_cents integer,
  currency text not null default 'eur',
  status text not null default 'pending',
  stripe_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint selen_payments_amount_check check (amount_cents >= 0)
);

create index if not exists selen_payments_paid_at_idx
  on public.selen_payments (paid_at desc);

create index if not exists selen_payments_status_idx
  on public.selen_payments (status);

create unique index if not exists selen_payments_stripe_session_id_idx
  on public.selen_payments (stripe_session_id)
  where stripe_session_id is not null;

create unique index if not exists selen_payments_stripe_payment_intent_id_idx
  on public.selen_payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create table if not exists public.selen_expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text,
  amount_cents integer not null,
  expense_date date not null,
  recurrence text not null default 'one_shot',
  notes text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint selen_expenses_amount_check check (amount_cents > 0),
  constraint selen_expenses_recurrence_check check (
    recurrence in ('one_shot', 'monthly', 'yearly')
  )
);

create index if not exists selen_expenses_expense_date_idx
  on public.selen_expenses (expense_date desc);

alter table public.selen_payments enable row level security;
alter table public.selen_expenses enable row level security;

create policy "Lil owner can read selen payments"
on public.selen_payments
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');

create policy "Lil owner can read selen expenses"
on public.selen_expenses
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');

create policy "Lil owner can insert selen expenses"
on public.selen_expenses
for insert
to authenticated
with check (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');
