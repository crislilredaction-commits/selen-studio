-- Selen Daily Lot 1B.1 - versioned subcontractor condition acceptances.
-- Append-only evidence: corrections require a new explicit acceptance record/version.

create table if not exists public.daily_trainer_condition_acceptances (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete restrict,
  accepted_by uuid not null references auth.users(id) on delete restrict,
  condition_type text not null,
  condition_version text not null,
  accepted_at timestamptz not null default now(),
  evidence_hash text not null,
  ip_address inet null,
  user_agent text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_trainer_condition_acceptances_hash_check
    check (evidence_hash ~ '^[A-Fa-f0-9]{64}$'),
  constraint daily_trainer_condition_acceptances_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint daily_trainer_condition_acceptances_no_secret_check
    check (metadata::text !~* '(raw_token|access_token|refresh_token|secret|password)'),
  constraint daily_trainer_condition_acceptances_unique
    unique (trainer_profile_id, condition_type, condition_version)
);

create index if not exists daily_trainer_condition_acceptances_profile_idx
  on public.daily_trainer_condition_acceptances (trainer_profile_id, accepted_at desc);

create or replace function public.prevent_daily_trainer_condition_acceptance_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role') then
    if tg_op = 'UPDATE' then return new; end if;
    return old;
  end if;
  raise exception 'daily_trainer_condition_acceptances is append-only';
end;
$$;

revoke execute on function public.prevent_daily_trainer_condition_acceptance_mutation()
  from public, anon, authenticated;
grant execute on function public.prevent_daily_trainer_condition_acceptance_mutation()
  to service_role;

drop trigger if exists daily_trainer_condition_acceptances_prevent_update
  on public.daily_trainer_condition_acceptances;
create trigger daily_trainer_condition_acceptances_prevent_update
before update on public.daily_trainer_condition_acceptances
for each row execute function public.prevent_daily_trainer_condition_acceptance_mutation();

drop trigger if exists daily_trainer_condition_acceptances_prevent_delete
  on public.daily_trainer_condition_acceptances;
create trigger daily_trainer_condition_acceptances_prevent_delete
before delete on public.daily_trainer_condition_acceptances
for each row execute function public.prevent_daily_trainer_condition_acceptance_mutation();

alter table public.daily_trainer_condition_acceptances enable row level security;
revoke all on table public.daily_trainer_condition_acceptances from public, anon, authenticated;

comment on table public.daily_trainer_condition_acceptances is
  'Daily Lot 1B.1: immutable versioned evidence of subcontractor condition acceptance. Revocation fields are intentionally absent from this foundation.';
