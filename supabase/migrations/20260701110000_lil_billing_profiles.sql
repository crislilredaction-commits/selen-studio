create table if not exists public.lil_billing_profiles (
  id uuid primary key default gen_random_uuid(),
  normalized_name text not null,
  name text not null,
  email text,
  address text,
  siren_siret text,
  phone text,
  default_payment_terms text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lil_billing_profiles_normalized_name_key
  on public.lil_billing_profiles (normalized_name);

create index if not exists lil_billing_profiles_name_idx
  on public.lil_billing_profiles (name);

create or replace function public.set_lil_billing_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lil_billing_profiles_updated_at on public.lil_billing_profiles;
create trigger trg_lil_billing_profiles_updated_at
before update on public.lil_billing_profiles
for each row
execute function public.set_lil_billing_profiles_updated_at();

alter table public.lil_billing_profiles enable row level security;

drop policy if exists "Lil owner can manage billing profiles" on public.lil_billing_profiles;
create policy "Lil owner can manage billing profiles"
on public.lil_billing_profiles
for all
using (
  exists (
    select 1
    from public.studio_admin_users sau
    where sau.email = auth.jwt() ->> 'email'
      and sau.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.studio_admin_users sau
    where sau.email = auth.jwt() ->> 'email'
      and sau.role in ('owner', 'admin')
  )
);
