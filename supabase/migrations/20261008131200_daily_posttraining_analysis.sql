create table if not exists public.daily_posttraining_analyses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  strengths text,
  weaknesses text,
  vigilance text,
  summary text,
  action_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_posttraining_analyses_scope_unique
    unique (organisation_id, session_id, enrolment_id),
  constraint daily_posttraining_analyses_content_check
    check (
      nullif(btrim(strengths), '') is not null
      or nullif(btrim(weaknesses), '') is not null
      or nullif(btrim(vigilance), '') is not null
      or nullif(btrim(summary), '') is not null
      or action_required
    )
);

comment on table public.daily_posttraining_analyses is
  'Analyse Studio structurée des évaluations et retours post-formation, conservée par apprenant et session.';

create index if not exists daily_posttraining_analyses_session_idx
  on public.daily_posttraining_analyses (organisation_id, session_id);

create or replace function public.validate_daily_posttraining_analysis_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;

  if not exists (
    select 1
    from public.daily_session_enrolments enrolment
    where enrolment.id = new.enrolment_id
      and enrolment.organisation_id = new.organisation_id
      and enrolment.session_id = new.session_id
      and enrolment.status not in ('declined', 'cancelled', 'abandoned')
  ) then
    raise exception 'Analyse post-formation hors périmètre ou inscription inactive.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_daily_posttraining_analysis_scope() from public;
revoke all on function public.validate_daily_posttraining_analysis_scope() from anon;
revoke all on function public.validate_daily_posttraining_analysis_scope() from authenticated;

drop trigger if exists daily_posttraining_analysis_scope_guard
  on public.daily_posttraining_analyses;
create trigger daily_posttraining_analysis_scope_guard
before insert or update on public.daily_posttraining_analyses
for each row execute function public.validate_daily_posttraining_analysis_scope();

alter table public.daily_posttraining_analyses enable row level security;

drop policy if exists "Authorised users read Daily posttraining analyses"
  on public.daily_posttraining_analyses;
create policy "Authorised users read Daily posttraining analyses"
on public.daily_posttraining_analyses
for select
to authenticated
using (
  daily_is_selen_staff()
  or can_manage_daily_sessions(organisation_id)
);

drop policy if exists "Selen staff insert Daily posttraining analyses"
  on public.daily_posttraining_analyses;
create policy "Selen staff insert Daily posttraining analyses"
on public.daily_posttraining_analyses
for insert
to authenticated
with check (daily_is_selen_staff());

drop policy if exists "Selen staff update Daily posttraining analyses"
  on public.daily_posttraining_analyses;
create policy "Selen staff update Daily posttraining analyses"
on public.daily_posttraining_analyses
for update
to authenticated
using (daily_is_selen_staff())
with check (daily_is_selen_staff());

drop policy if exists "Selen staff delete Daily posttraining analyses"
  on public.daily_posttraining_analyses;
create policy "Selen staff delete Daily posttraining analyses"
on public.daily_posttraining_analyses
for delete
to authenticated
using (daily_is_selen_staff());

grant select, insert, update, delete on public.daily_posttraining_analyses to authenticated;
revoke all on public.daily_posttraining_analyses from anon;

