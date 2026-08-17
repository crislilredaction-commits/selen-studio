-- Daily Lot 4AI — stakeholder complaints and suggestions foundation
-- V1 foundation only. Submissions are received by Selen before they can be forwarded to the training organisation.

create table if not exists public.daily_stakeholder_feedback (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid references public.daily_sessions(id) on delete set null,
  enrolment_id uuid references public.daily_session_enrolments(id) on delete set null,
  submission_type text not null check (submission_type in ('complaint', 'suggestion')),
  stakeholder_type text not null check (stakeholder_type in ('learner', 'trainer', 'company', 'client', 'other')),
  submitter_name text not null check (length(btrim(submitter_name)) > 0),
  submitter_email text,
  subject text not null check (length(btrim(subject)) > 0),
  message text not null check (length(btrim(message)) > 0),
  status text not null default 'received' check (status in ('received', 'selen_reviewed', 'forwarded_to_organisation', 'resolved')),
  selen_review_note text,
  selen_reviewed_at timestamptz,
  selen_reviewed_by uuid references auth.users(id) on delete set null,
  forwarded_at timestamptz,
  forwarded_by uuid references auth.users(id) on delete set null,
  organisation_response text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_stakeholder_feedback_review_state_check check (
    (status = 'received')
    or (selen_reviewed_at is not null)
  ),
  constraint daily_stakeholder_feedback_forward_state_check check (
    status not in ('forwarded_to_organisation', 'resolved')
    or (selen_reviewed_at is not null and forwarded_at is not null)
  ),
  constraint daily_stakeholder_feedback_resolved_state_check check (
    status <> 'resolved'
    or resolved_at is not null
  )
);

comment on table public.daily_stakeholder_feedback is
  'Complaints and suggestions submitted by Daily stakeholders. Selen reviews each submission before forwarding it to the training organisation.';
comment on column public.daily_stakeholder_feedback.status is
  'Workflow order: received -> selen_reviewed -> forwarded_to_organisation -> resolved.';

create index if not exists daily_stakeholder_feedback_org_status_idx
  on public.daily_stakeholder_feedback (organisation_id, status, created_at desc);
create index if not exists daily_stakeholder_feedback_session_idx
  on public.daily_stakeholder_feedback (session_id, created_at desc)
  where session_id is not null;

create or replace function public.validate_daily_stakeholder_feedback_scope()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.session_id is not null and not exists (
    select 1
    from public.daily_sessions s
    where s.id = new.session_id
      and s.organisation_id = new.organisation_id
  ) then
    raise exception 'daily_stakeholder_feedback session does not belong to organisation';
  end if;

  if new.enrolment_id is not null and not exists (
    select 1
    from public.daily_session_enrolments e
    where e.id = new.enrolment_id
      and e.organisation_id = new.organisation_id
      and (new.session_id is null or e.session_id = new.session_id)
  ) then
    raise exception 'daily_stakeholder_feedback enrolment is outside feedback scope';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_daily_stakeholder_feedback_scope() from public, anon, authenticated;
grant execute on function public.validate_daily_stakeholder_feedback_scope() to service_role;

drop trigger if exists trg_validate_daily_stakeholder_feedback_scope on public.daily_stakeholder_feedback;
create trigger trg_validate_daily_stakeholder_feedback_scope
before insert or update on public.daily_stakeholder_feedback
for each row execute function public.validate_daily_stakeholder_feedback_scope();

alter table public.daily_stakeholder_feedback enable row level security;
revoke all on table public.daily_stakeholder_feedback from anon, authenticated;
grant select, insert, update, delete on table public.daily_stakeholder_feedback to service_role;

drop policy if exists daily_stakeholder_feedback_service_role_all on public.daily_stakeholder_feedback;
create policy daily_stakeholder_feedback_service_role_all
on public.daily_stakeholder_feedback
for all
to service_role
using (true)
with check (true);