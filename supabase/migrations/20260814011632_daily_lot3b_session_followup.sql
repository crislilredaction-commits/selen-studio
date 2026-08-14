-- Selen Daily Lot 3B - incidents and adaptations during a training session.

create table public.daily_session_followup_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid references public.daily_session_enrolments(id) on delete set null,
  entry_type text not null check (entry_type in ('incident','adaptation')),
  level text not null default 'attention' check (level in ('info','attention','critical')),
  occurred_at timestamptz not null default now(),
  summary text not null check (char_length(btrim(summary)) between 1 and 240),
  description text,
  action_taken text,
  status text not null default 'open' check (status in ('open','resolved')),
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status='resolved' and resolved_at is not null) or status='open')
);

create index daily_session_followup_session_idx
  on public.daily_session_followup_entries(session_id,occurred_at desc);
create index daily_session_followup_attention_idx
  on public.daily_session_followup_entries(organisation_id,status,level,occurred_at desc);

alter table public.daily_session_followup_entries enable row level security;

create policy "Selen staff manage Daily session followup"
  on public.daily_session_followup_entries for all to authenticated
  using (public.daily_is_selen_staff())
  with check (public.daily_is_selen_staff());
create policy "Session managers read Daily session followup"
  on public.daily_session_followup_entries for select to authenticated
  using (public.can_manage_daily_sessions(organisation_id));
create policy "Session managers create Daily session followup"
  on public.daily_session_followup_entries for insert to authenticated
  with check (public.can_manage_daily_sessions(organisation_id));
create policy "Session managers update Daily session followup"
  on public.daily_session_followup_entries for update to authenticated
  using (public.can_manage_daily_sessions(organisation_id))
  with check (public.can_manage_daily_sessions(organisation_id));

grant select,insert,update on public.daily_session_followup_entries to authenticated;
grant all on public.daily_session_followup_entries to service_role;
