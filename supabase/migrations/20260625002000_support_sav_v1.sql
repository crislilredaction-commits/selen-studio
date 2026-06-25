create table if not exists public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  client_email text not null,
  ticket_id uuid references public.support_tickets(id) on delete set null,
  discount_type text not null default 'percent',
  percent_off integer,
  amount_off_cents integer,
  currency text not null default 'eur',
  status text not null default 'active',
  expires_at timestamptz,
  used_at timestamptz,
  used_by_email text,
  created_by_agent_email text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint discount_codes_type_check check (discount_type in ('percent', 'amount')),
  constraint discount_codes_status_check check (status in ('active', 'cancelled', 'expired', 'used')),
  constraint discount_codes_percent_check check (percent_off is null or (percent_off > 0 and percent_off <= 100)),
  constraint discount_codes_amount_check check (amount_off_cents is null or amount_off_cents > 0)
);

create index if not exists discount_codes_client_email_idx
  on public.discount_codes (lower(client_email));

create index if not exists discount_codes_ticket_id_idx
  on public.discount_codes (ticket_id);

create table if not exists public.support_refund_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete set null,
  client_email text not null,
  amount_cents integer,
  currency text not null default 'eur',
  reason text not null,
  status text not null default 'to_process',
  stripe_payment_intent_id text,
  stripe_refund_id text,
  processed_by_agent_email text,
  processed_at timestamptz,
  created_by_agent_email text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint support_refund_requests_status_check check (
    status in ('to_process', 'processed', 'refused', 'cancelled')
  ),
  constraint support_refund_requests_amount_check check (
    amount_cents is null or amount_cents > 0
  )
);

create index if not exists support_refund_requests_ticket_id_idx
  on public.support_refund_requests (ticket_id);

create index if not exists support_refund_requests_client_email_idx
  on public.support_refund_requests (lower(client_email));

alter table public.discount_codes enable row level security;
alter table public.support_refund_requests enable row level security;

create policy "Studio staff can read discount codes"
on public.discount_codes
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can insert discount codes"
on public.discount_codes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can read refund requests"
on public.support_refund_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can insert refund requests"
on public.support_refund_requests
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can update refund requests"
on public.support_refund_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);
