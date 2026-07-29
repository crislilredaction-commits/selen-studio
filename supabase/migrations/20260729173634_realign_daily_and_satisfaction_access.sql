-- Correctifs ciblés issus de l'audit de l'historique distant.
-- Aucun changement de données et aucune restauration de la contrainte
-- obsolète des statuts de factures.

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

-- Le schéma distant utilise désormais un comptage par année civile explicite.
-- Les anciennes fonctions à un argument dépendaient de colonnes de période
-- glissante qui n'existent plus et ne sont appelées par aucun code local.
drop function if exists public.daily_prepare_upper_tier_if_needed(uuid);
drop function if exists public.daily_annual_learner_count(uuid);
drop function if exists public.daily_refresh_subscription_period(uuid);

create or replace function public.daily_annual_learner_count(
  p_user_id uuid,
  p_year integer default extract(year from now())::integer
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    jsonb_array_length(coalesce(ds.beneficiaries, '[]'::jsonb))
    + jsonb_array_length(coalesce(ds.individual_beneficiaries, '[]'::jsonb))
  ), 0)::integer
  from public.daily_sessions ds
  where ds.user_id = p_user_id
    and ds.status <> 'archived'
    and exists (
      select 1
      from jsonb_array_elements(
        coalesce(ds.schedule_blocks, '[]'::jsonb)
      ) as block
      where left(coalesce(block ->> 'date', ''), 4) = p_year::text
    );
$$;

create or replace function public.daily_prepare_upper_tier_if_needed(
  p_user_id uuid,
  p_year integer default extract(year from now())::integer
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  learner_count integer;
begin
  learner_count :=
    public.daily_annual_learner_count(p_user_id, p_year);

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
  where user_id = p_user_id;

  return learner_count;
end;
$$;

revoke all on function public.daily_annual_learner_count(uuid, integer)
  from public, anon;
revoke all on function public.daily_prepare_upper_tier_if_needed(uuid, integer)
  from public, anon;

grant execute
  on function public.daily_annual_learner_count(uuid, integer)
  to authenticated, service_role;
grant execute
  on function public.daily_prepare_upper_tier_if_needed(uuid, integer)
  to authenticated, service_role;
