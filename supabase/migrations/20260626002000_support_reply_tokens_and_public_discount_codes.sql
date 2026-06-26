create table if not exists public.support_reply_tokens (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists support_reply_tokens_ticket_id_idx
  on public.support_reply_tokens (ticket_id);

create index if not exists support_reply_tokens_expires_at_idx
  on public.support_reply_tokens (expires_at);

alter table public.support_reply_tokens enable row level security;

create policy "Studio staff can read support reply tokens"
on public.support_reply_tokens
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

alter table public.discount_codes
  alter column client_email drop not null;

alter table public.discount_codes
  add column if not exists type text not null default 'support_ticket',
  add column if not exists offer_slug text,
  add column if not exists discount_percent integer,
  add column if not exists discount_amount integer,
  add column if not exists max_global_uses integer,
  add column if not exists max_uses_per_email integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_public_type_check'
      and conrelid = 'public.discount_codes'::regclass
  ) then
    alter table public.discount_codes
      add constraint discount_codes_public_type_check
      check (type in ('support_ticket', 'newsletter_public'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_public_percent_check'
      and conrelid = 'public.discount_codes'::regclass
  ) then
    alter table public.discount_codes
      add constraint discount_codes_public_percent_check
      check (discount_percent is null or (discount_percent > 0 and discount_percent <= 100));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'discount_codes_public_amount_check'
      and conrelid = 'public.discount_codes'::regclass
  ) then
    alter table public.discount_codes
      add constraint discount_codes_public_amount_check
      check (discount_amount is null or discount_amount > 0);
  end if;
end $$;

create index if not exists discount_codes_type_idx
  on public.discount_codes (type);

create index if not exists discount_codes_offer_slug_idx
  on public.discount_codes (offer_slug);

create table if not exists public.discount_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_code_id uuid not null references public.discount_codes(id) on delete cascade,
  client_email text not null,
  used_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists discount_code_redemptions_code_idx
  on public.discount_code_redemptions (discount_code_id);

create index if not exists discount_code_redemptions_client_email_idx
  on public.discount_code_redemptions (lower(client_email));

alter table public.discount_code_redemptions enable row level security;

create policy "Studio staff can read discount redemptions"
on public.discount_code_redemptions
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
