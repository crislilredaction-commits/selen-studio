create table if not exists public.daily_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('pending', 'active', 'cancelled')),
  annual_learner_limit integer not null default 150,
  annual_period_start date not null default current_date,
  annual_period_end date not null default ((current_date + interval '1 year')::date),
  base_monthly_amount_cents integer not null default 8900,
  upper_monthly_amount_cents integer not null default 14900,
  current_tier text not null default 'base' check (current_tier in ('base', 'upper')),
  tier_change_pending boolean not null default false,
  tier_change_prepared_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  pricing_rule_accepted_at timestamptz,
  pricing_rule_accepted_version text not null default 'daily_150_2026_07',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id),
  check (annual_period_end > annual_period_start)
);

create table if not exists public.daily_onboarding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  current_step integer not null default 1,
  setup_choice text check (setup_choice in ('self', 'video')),
  video_requested_at timestamptz,
  organisation_name text,
  siret text,
  nda_number text,
  address text,
  manager_first_name text,
  manager_last_name text,
  qualiopi_status text check (qualiopi_status in ('yes', 'no', 'planned')),
  insee_document_pending boolean not null default false,
  qualiopi_certificate_pending boolean not null default false,
  nda_or_bpf_document_pending boolean not null default false,
  platform_contact_first_name text,
  platform_contact_last_name text,
  platform_contact_role text,
  platform_contact_email text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.daily_trainers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  cv_pending boolean not null default false,
  trainer_access_planned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.daily_sessions
  add column if not exists trainer_ids jsonb not null default '[]'::jsonb;

create index if not exists daily_onboarding_user_status_idx
  on public.daily_onboarding(user_id, status, current_step);

create index if not exists daily_trainers_user_idx
  on public.daily_trainers(user_id, last_name, first_name);

drop trigger if exists daily_subscriptions_set_updated_at on public.daily_subscriptions;
create trigger daily_subscriptions_set_updated_at
before update on public.daily_subscriptions
for each row execute function public.set_daily_updated_at();

drop trigger if exists daily_onboarding_set_updated_at on public.daily_onboarding;
create trigger daily_onboarding_set_updated_at
before update on public.daily_onboarding
for each row execute function public.set_daily_updated_at();

drop trigger if exists daily_trainers_set_updated_at on public.daily_trainers;
create trigger daily_trainers_set_updated_at
before update on public.daily_trainers
for each row execute function public.set_daily_updated_at();

create or replace function public.daily_refresh_subscription_period(
  p_user_id uuid
)
returns void as $$
declare
  subscription_record public.daily_subscriptions%rowtype;
  next_period_start date;
  next_period_end date;
begin
  select *
  into subscription_record
  from public.daily_subscriptions
  where user_id = p_user_id
  for update;

  if not found then
    return;
  end if;

  next_period_start := subscription_record.annual_period_start;
  next_period_end := subscription_record.annual_period_end;

  while current_date >= next_period_end loop
    next_period_start := next_period_end;
    next_period_end := (next_period_end + interval '1 year')::date;
  end loop;

  if next_period_start <> subscription_record.annual_period_start
    or next_period_end <> subscription_record.annual_period_end then
    update public.daily_subscriptions
    set annual_period_start = next_period_start,
        annual_period_end = next_period_end,
        tier_change_pending = false,
        tier_change_prepared_at = null
    where user_id = p_user_id;
  end if;
end;
$$ language plpgsql;

create or replace function public.daily_annual_learner_count(
  p_user_id uuid
)
returns integer as $$
declare
  learner_count integer;
begin
  perform public.daily_refresh_subscription_period(p_user_id);

  select coalesce(sum(
      jsonb_array_length(coalesce(ds.beneficiaries, '[]'::jsonb)) +
      jsonb_array_length(coalesce(ds.individual_beneficiaries, '[]'::jsonb))
    ), 0)::integer
  into learner_count
  from public.daily_sessions ds
  join public.daily_subscriptions sub on sub.user_id = ds.user_id
  where ds.user_id = p_user_id
    and ds.status <> 'archived'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(ds.schedule_blocks, '[]'::jsonb)) as block
      where case
          when coalesce(block->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (block->>'date')::date
          else null
        end >= sub.annual_period_start
        and case
          when coalesce(block->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
          then (block->>'date')::date
          else null
        end < sub.annual_period_end
    );

  return learner_count;
end;
$$ language plpgsql;

create or replace function public.daily_prepare_upper_tier_if_needed(
  p_user_id uuid
)
returns integer as $$
declare
  learner_count integer;
begin
  learner_count := public.daily_annual_learner_count(p_user_id);

  update public.daily_subscriptions
  set tier_change_pending = learner_count > annual_learner_limit,
      tier_change_prepared_at = case
        when learner_count > annual_learner_limit and tier_change_prepared_at is null then now()
        when learner_count <= annual_learner_limit then null
        else tier_change_prepared_at
      end
  where user_id = p_user_id;

  return learner_count;
end;
$$ language plpgsql;

alter table public.daily_subscriptions enable row level security;
alter table public.daily_onboarding enable row level security;
alter table public.daily_trainers enable row level security;

drop policy if exists "Clients can read their Daily subscription" on public.daily_subscriptions;
create policy "Clients can read their Daily subscription"
on public.daily_subscriptions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can read their Daily onboarding" on public.daily_onboarding;
create policy "Clients can read their Daily onboarding"
on public.daily_onboarding for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can create their Daily onboarding" on public.daily_onboarding;
create policy "Clients can create their Daily onboarding"
on public.daily_onboarding for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clients can update their Daily onboarding" on public.daily_onboarding;
create policy "Clients can update their Daily onboarding"
on public.daily_onboarding for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Clients can read their Daily trainers" on public.daily_trainers;
create policy "Clients can read their Daily trainers"
on public.daily_trainers for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can create their Daily trainers" on public.daily_trainers;
create policy "Clients can create their Daily trainers"
on public.daily_trainers for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clients can update their Daily trainers" on public.daily_trainers;
create policy "Clients can update their Daily trainers"
on public.daily_trainers for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Clients can delete their Daily trainers" on public.daily_trainers;
create policy "Clients can delete their Daily trainers"
on public.daily_trainers for delete
to authenticated
using (auth.uid() = user_id);
