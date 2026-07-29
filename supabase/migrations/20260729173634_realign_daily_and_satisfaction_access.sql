-- Correctifs ciblés issus de l'audit de l'historique distant.
-- La période annuelle Daily est glissante et commence à la souscription.
-- Cette migration n'a pas encore été appliquée au projet distant.

do $$
begin
  if to_regclass('public.satisfaction_surveys') is null then
    raise exception 'public.satisfaction_surveys is required';
  end if;

  alter table public.satisfaction_surveys enable row level security;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'satisfaction_surveys'
      and policyname = 'Studio staff can read satisfaction surveys'
  ) then
    execute $policy$
      create policy "Studio staff can read satisfaction surveys"
      on public.satisfaction_surveys
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.agent_profiles ap
          where ap.is_active = true
            and ap.role in ('agent', 'admin')
            and (
              ap.user_id = (select auth.uid())
              or lower(ap.email) = lower((select auth.jwt() ->> 'email'))
            )
        )
      )
    $policy$;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.daily_subscriptions') is null then
    raise exception 'public.daily_subscriptions is required';
  end if;
end;
$$;

alter table public.daily_subscriptions
  add column if not exists annual_period_start date,
  add column if not exists annual_period_end date;

-- Le schéma actuel ne conserve pas le current_period_start de Stripe.
-- pricing_rule_accepted_at est la meilleure trace locale de souscription,
-- created_at constitue le repli déterministe pour les lignes historiques.
update public.daily_subscriptions
set annual_period_start = coalesce(
  (pricing_rule_accepted_at at time zone 'UTC')::date,
  (created_at at time zone 'UTC')::date,
  current_date
)
where annual_period_start is null;

update public.daily_subscriptions
set annual_period_end = (annual_period_start + interval '1 year')::date
where annual_period_end is null;

do $$
begin
  if exists (
    select 1
    from public.daily_subscriptions
    where annual_period_start is null
      or annual_period_end is null
      or annual_period_end <> (annual_period_start + interval '1 year')::date
  ) then
    raise exception
      'Daily annual periods must contain non-null bounds exactly 12 months apart';
  end if;
end;
$$;

alter table public.daily_subscriptions
  alter column annual_period_start set default current_date,
  alter column annual_period_start set not null,
  alter column annual_period_end
    set default ((current_date + interval '1 year')::date),
  alter column annual_period_end set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_subscriptions'::regclass
      and conname = 'daily_subscriptions_annual_period_exact_year_check'
  ) then
    alter table public.daily_subscriptions
      add constraint daily_subscriptions_annual_period_exact_year_check
      check (
        annual_period_end =
          (annual_period_start + interval '1 year')::date
      );
  end if;
end;
$$;

-- Supprime la variante distante par année civile et recrée l'API glissante.
drop function if exists public.daily_prepare_upper_tier_if_needed(uuid, integer);
drop function if exists public.daily_annual_learner_count(uuid, integer);

create or replace function public.daily_refresh_subscription_period(
  p_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  period_start date;
  period_end date;
  period_advanced boolean := false;
begin
  select annual_period_start, annual_period_end
  into period_start, period_end
  from public.daily_subscriptions
  where user_id = p_user_id
    and status = 'active'
  for update;

  if not found then
    return;
  end if;

  while current_date >= period_end loop
    period_start := period_end;
    period_end := (period_end + interval '1 year')::date;
    period_advanced := true;
  end loop;

  if period_advanced then
    update public.daily_subscriptions
    set
      annual_period_start = period_start,
      annual_period_end = period_end,
      tier_change_pending = false,
      tier_change_prepared_at = null
    where user_id = p_user_id
      and status = 'active';
  end if;
end;
$$;

create or replace function public.daily_annual_learner_count(
  p_user_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  period_start date;
  period_end date;
  learner_count integer;
begin
  perform public.daily_refresh_subscription_period(p_user_id);

  select annual_period_start, annual_period_end
  into period_start, period_end
  from public.daily_subscriptions
  where user_id = p_user_id
    and status = 'active';

  if not found then
    return 0;
  end if;

  select coalesce(sum(
    jsonb_array_length(coalesce(ds.beneficiaries, '[]'::jsonb))
    + jsonb_array_length(coalesce(ds.individual_beneficiaries, '[]'::jsonb))
  ), 0)::integer
  into learner_count
  from public.daily_sessions ds
  where ds.user_id = p_user_id
    and ds.status <> 'archived'
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce(ds.schedule_blocks, '[]'::jsonb)
      ) as block
      where (
          case
            when pg_catalog.pg_input_is_valid(
              left(coalesce(block ->> 'date', ''), 10),
              'date'
            )
              then left(block ->> 'date', 10)::date
            else null
          end
        ) >= period_start
        and (
          case
            when pg_catalog.pg_input_is_valid(
              left(coalesce(block ->> 'date', ''), 10),
              'date'
            )
              then left(block ->> 'date', 10)::date
            else null
          end
        ) < period_end
    );

  return learner_count;
end;
$$;

create or replace function public.daily_prepare_upper_tier_if_needed(
  p_user_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  learner_count integer;
begin
  learner_count := public.daily_annual_learner_count(p_user_id);

  update public.daily_subscriptions
  set
    tier_change_pending = learner_count > annual_learner_limit,
    tier_change_prepared_at = case
      when learner_count > annual_learner_limit
        and tier_change_prepared_at is null
        then now()
      when learner_count <= annual_learner_limit
        then null
      else tier_change_prepared_at
    end
  where user_id = p_user_id
    and status = 'active';

  return learner_count;
end;
$$;

revoke all on function public.daily_refresh_subscription_period(uuid)
  from public, anon, authenticated;
revoke all on function public.daily_annual_learner_count(uuid)
  from public, anon, authenticated;
revoke all on function public.daily_prepare_upper_tier_if_needed(uuid)
  from public, anon, authenticated;

grant execute
  on function public.daily_refresh_subscription_period(uuid)
  to service_role;
grant execute
  on function public.daily_annual_learner_count(uuid)
  to service_role;
grant execute
  on function public.daily_prepare_upper_tier_if_needed(uuid)
  to service_role;
