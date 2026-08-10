-- Selen Daily Lot 2D - learners, session enrolments and adaptation needs.

create table if not exists public.daily_learners (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  company_name text,
  job_title text,
  status text not null default 'active' check (status in ('active','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(first_name) <> '' and btrim(last_name) <> ''),
  check (email is null or btrim(email) <> '')
);

create unique index if not exists daily_learners_org_email_unique
  on public.daily_learners(organisation_id, lower(btrim(email)))
  where email is not null;
create index if not exists daily_learners_org_name_idx
  on public.daily_learners(organisation_id, last_name, first_name);

create table if not exists public.daily_session_enrolments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  learner_id uuid not null references public.daily_learners(id) on delete restrict,
  status text not null default 'pending' check (status in ('invited','pending','confirmed','declined','cancelled','completed')),
  funding_type text not null default 'unknown' check (funding_type in ('employer','self_funded','opco','public_funder','other','unknown')),
  funding_organisation text,
  company_name text,
  company_contact_name text,
  company_contact_email text,
  positioning_status text not null default 'not_started' check (positioning_status in ('not_started','sent','submitted','reviewed')),
  prerequisites_status text not null default 'not_reviewed' check (prerequisites_status in ('not_reviewed','met','not_met','to_clarify')),
  source text not null default 'manual' check (source in ('manual','public_form','import','legacy')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, learner_id)
);

create index if not exists daily_session_enrolments_session_idx
  on public.daily_session_enrolments(session_id, status, created_at);
create index if not exists daily_session_enrolments_learner_idx
  on public.daily_session_enrolments(learner_id, created_at desc);

create table if not exists public.daily_enrolment_support_needs (
  enrolment_id uuid primary key references public.daily_session_enrolments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  has_specific_needs boolean not null default false,
  needs_description text,
  planned_accommodations text,
  contact_requested boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (has_specific_needs or (needs_description is null and planned_accommodations is null and contact_requested = false))
);

alter table public.daily_learners enable row level security;
alter table public.daily_session_enrolments enable row level security;
alter table public.daily_enrolment_support_needs enable row level security;

create or replace function public.daily_validate_enrolment_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  session_org uuid;
  learner_org uuid;
begin
  select organisation_id into session_org from public.daily_sessions where id=new.session_id;
  select organisation_id into learner_org from public.daily_learners where id=new.learner_id;
  if session_org is null then raise exception 'Daily session not found'; end if;
  if learner_org is null then raise exception 'Daily learner not found'; end if;
  if new.organisation_id <> session_org or new.organisation_id <> learner_org then
    raise exception 'Daily enrolment organisation mismatch';
  end if;
  if exists (
    select 1 from public.daily_sessions s
    where s.id=new.session_id and s.max_participants is not null
      and s.max_participants <= (
        select count(*) from public.daily_session_enrolments e
        where e.session_id=new.session_id
          and e.status not in ('declined','cancelled')
          and e.id is distinct from new.id
      )
      and new.status not in ('declined','cancelled')
  ) then
    raise exception 'Daily session participant capacity reached';
  end if;
  new.updated_at:=now();
  return new;
end; $$;
revoke execute on function public.daily_validate_enrolment_scope() from public,anon,authenticated;
grant execute on function public.daily_validate_enrolment_scope() to service_role;

drop trigger if exists daily_session_enrolments_scope on public.daily_session_enrolments;
create trigger daily_session_enrolments_scope before insert or update on public.daily_session_enrolments
for each row execute function public.daily_validate_enrolment_scope();

create or replace function public.daily_validate_support_need_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare enrolment_org uuid;
begin
  select organisation_id into enrolment_org from public.daily_session_enrolments where id=new.enrolment_id;
  if enrolment_org is null then raise exception 'Daily enrolment not found'; end if;
  if new.organisation_id <> enrolment_org then raise exception 'Daily support need organisation mismatch'; end if;
  new.updated_at:=now();
  return new;
end; $$;
revoke execute on function public.daily_validate_support_need_scope() from public,anon,authenticated;
grant execute on function public.daily_validate_support_need_scope() to service_role;

drop trigger if exists daily_enrolment_support_needs_scope on public.daily_enrolment_support_needs;
create trigger daily_enrolment_support_needs_scope before insert or update on public.daily_enrolment_support_needs
for each row execute function public.daily_validate_support_need_scope();

create or replace function public.daily_sync_session_participants_checklist(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare active_count integer; pending_count integer; target_status text;
begin
  select count(*) filter (where status not in ('declined','cancelled')),
         count(*) filter (where status in ('invited','pending'))
    into active_count,pending_count
  from public.daily_session_enrolments where session_id=p_session_id;
  target_status := case when active_count=0 then 'todo' when pending_count>0 then 'in_progress' else 'to_review' end;
  update public.daily_session_checklist_items
  set status=target_status
  where session_id=p_session_id and item_key='participants_ready'
    and status not in ('blocked','not_applicable')
    and status is distinct from target_status;
end; $$;
revoke execute on function public.daily_sync_session_participants_checklist(uuid) from public,anon,authenticated;
grant execute on function public.daily_sync_session_participants_checklist(uuid) to service_role;

create or replace function public.daily_sync_session_participants_checklist_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.daily_sync_session_participants_checklist(coalesce(new.session_id,old.session_id));
  return coalesce(new,old);
end; $$;
revoke execute on function public.daily_sync_session_participants_checklist_trigger() from public,anon,authenticated;
grant execute on function public.daily_sync_session_participants_checklist_trigger() to service_role;

drop trigger if exists daily_session_enrolments_sync_checklist on public.daily_session_enrolments;
create trigger daily_session_enrolments_sync_checklist after insert or update or delete on public.daily_session_enrolments
for each row execute function public.daily_sync_session_participants_checklist_trigger();

create policy "Organisation session managers manage Daily learners"
on public.daily_learners for all to authenticated
using (public.can_manage_daily_sessions(organisation_id))
with check (public.can_manage_daily_sessions(organisation_id));

create policy "Organisation session managers manage Daily enrolments"
on public.daily_session_enrolments for all to authenticated
using (public.can_manage_daily_sessions(organisation_id))
with check (public.can_manage_daily_sessions(organisation_id));

create policy "Organisation session managers manage Daily support needs"
on public.daily_enrolment_support_needs for all to authenticated
using (public.can_manage_daily_sessions(organisation_id))
with check (public.can_manage_daily_sessions(organisation_id));

grant select,insert,update on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs to authenticated;
grant delete on public.daily_session_enrolments to authenticated;
grant all on public.daily_learners,public.daily_session_enrolments,public.daily_enrolment_support_needs to service_role;
