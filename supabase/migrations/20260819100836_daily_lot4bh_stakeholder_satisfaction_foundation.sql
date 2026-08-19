create table if not exists public.daily_stakeholder_satisfaction_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete restrict,
  stakeholder_type text not null check (stakeholder_type in ('company','trainer','client','other')),
  entity_key text not null check (length(btrim(entity_key)) > 0),
  entity_name text,
  entity_email text,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  objectives_rating smallint check (objectives_rating between 1 and 5),
  trainer_rating smallint check (trainer_rating between 1 and 5),
  organisation_rating smallint check (organisation_rating between 1 and 5),
  would_recommend boolean,
  strengths text,
  improvements text,
  free_comment text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (session_id, stakeholder_type, entity_key)
);

create index if not exists daily_stakeholder_satisfaction_org_session_idx
  on public.daily_stakeholder_satisfaction_responses (organisation_id, session_id);

alter table public.daily_stakeholder_satisfaction_responses enable row level security;
revoke all on public.daily_stakeholder_satisfaction_responses from anon, authenticated;
grant select, insert, update, delete on public.daily_stakeholder_satisfaction_responses to service_role;

create policy daily_stakeholder_satisfaction_service_role_all
  on public.daily_stakeholder_satisfaction_responses
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.daily_guard_stakeholder_satisfaction_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.daily_sessions s
    where s.id = new.session_id
      and s.organisation_id = new.organisation_id
  ) then
    raise exception 'daily_stakeholder_satisfaction_scope_mismatch';
  end if;
  return new;
end;
$$;

revoke all on function public.daily_guard_stakeholder_satisfaction_scope() from public, anon, authenticated;
grant execute on function public.daily_guard_stakeholder_satisfaction_scope() to service_role;

drop trigger if exists daily_guard_stakeholder_satisfaction_scope on public.daily_stakeholder_satisfaction_responses;
create trigger daily_guard_stakeholder_satisfaction_scope
before insert or update of organisation_id, session_id
on public.daily_stakeholder_satisfaction_responses
for each row execute function public.daily_guard_stakeholder_satisfaction_scope();
