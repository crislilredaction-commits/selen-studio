create table if not exists public.daily_work_escalations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid null references public.daily_sessions(id) on delete restrict,
  target_type text not null check (target_type in ('task','dossier')),
  task_key text null,
  task_title text null,
  target_href text not null,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'open' check (status in ('open','in_progress','returned','resolved')),
  escalated_by uuid not null references public.agent_profiles(id) on delete restrict,
  handled_by uuid null references public.agent_profiles(id) on delete set null,
  resolution_note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint daily_work_escalations_target_shape check ((target_type='task' and task_key is not null) or (target_type='dossier' and task_key is null and session_id is not null))
);
create unique index if not exists daily_work_escalations_active_task_key_uq on public.daily_work_escalations(task_key) where target_type='task' and status in ('open','in_progress','returned');
create unique index if not exists daily_work_escalations_active_dossier_uq on public.daily_work_escalations(session_id) where target_type='dossier' and status in ('open','in_progress','returned');
create index if not exists daily_work_escalations_org_status_idx on public.daily_work_escalations(organisation_id,status,created_at desc);
create index if not exists daily_work_escalations_escalated_by_idx on public.daily_work_escalations(escalated_by,created_at desc);

create table if not exists public.daily_work_escalation_events (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references public.daily_work_escalations(id) on delete cascade,
  event_type text not null check (event_type in ('created','taken','returned','resolved')),
  actor_id uuid null references public.agent_profiles(id) on delete set null,
  message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists daily_work_escalation_events_escalation_idx on public.daily_work_escalation_events(escalation_id,created_at asc);
alter table public.daily_work_escalations enable row level security;
alter table public.daily_work_escalation_events enable row level security;
revoke all on table public.daily_work_escalations from anon, authenticated;
revoke all on table public.daily_work_escalation_events from anon, authenticated;
grant select,insert,update,delete on table public.daily_work_escalations to service_role;
grant select,insert,update,delete on table public.daily_work_escalation_events to service_role;
