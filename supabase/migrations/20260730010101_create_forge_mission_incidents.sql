-- Incidents persistants et tentatives bornees des missions Cody.

create table public.forge_mission_incidents (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  checkpoint_id uuid not null references public.forge_mission_checkpoints(id) on delete restrict,
  action_key text,
  category text not null,
  code text not null,
  message text not null,
  technical_details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  resolution_status text not null default 'detected',
  resolved_at timestamptz,
  correction_strategy text,
  ignore_justification text,
  human_decision_required text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_mission_incidents_category_check check (
    category in ('warning', 'recoverable_error', 'critical_error', 'human_decision_required')
  ),
  constraint forge_mission_incidents_code_check check (
    code = upper(code)
    and code ~ '^[A-Z][A-Z0-9_]{2,79}$'
  ),
  constraint forge_mission_incidents_message_check check (
    length(trim(message)) > 0
  ),
  constraint forge_mission_incidents_attempt_limit_check check (
    max_attempts between 1 and 10
    and attempt_count between 0 and max_attempts
  ),
  constraint forge_mission_incidents_resolution_status_check check (
    resolution_status in (
      'detected', 'retrying', 'resolved', 'blocked', 'failed',
      'ignored_with_justification'
    )
  ),
  constraint forge_mission_incidents_resolution_dates_check check (
    (resolution_status in ('resolved', 'ignored_with_justification') and resolved_at is not null)
    or (resolution_status not in ('resolved', 'ignored_with_justification') and resolved_at is null)
  ),
  constraint forge_mission_incidents_ignore_reason_check check (
    resolution_status <> 'ignored_with_justification'
    or length(trim(coalesce(ignore_justification, ''))) > 0
  ),
  constraint forge_mission_incidents_human_decision_check check (
    category <> 'human_decision_required'
    or length(trim(coalesce(human_decision_required, ''))) > 0
  ),
  constraint forge_mission_incidents_checkpoint_scope unique (id, mission_id, checkpoint_id)
);

create table public.forge_mission_incident_attempts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.forge_mission_incidents(id) on delete cascade,
  mission_id uuid not null references public.forge_missions(id) on delete cascade,
  checkpoint_id uuid not null references public.forge_mission_checkpoints(id) on delete restrict,
  attempt_number integer not null,
  strategy text not null,
  correction_fingerprint text not null,
  result_status text not null,
  result_message text not null,
  technical_details jsonb not null default '{}'::jsonb,
  plan_id uuid not null references public.forge_mission_plans(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_mission_incident_attempts_number unique (incident_id, attempt_number),
  constraint forge_mission_incident_attempts_result_check check (
    result_status in ('succeeded', 'failed', 'refused')
  ),
  constraint forge_mission_incident_attempts_strategy_check check (
    strategy in (
      'syntax_fix', 'missing_import', 'local_type_fix',
      'regression_test_fix', 'command_path_fix', 'command_parameter_fix',
      'local_conflict_fix', 'local_migration_fix', 'lint_fix', 'build_fix',
      'manual_resolution'
    )
  ),
  constraint forge_mission_incident_attempts_result_message_check check (
    length(trim(result_message)) > 0
  ),
  constraint forge_mission_incident_attempts_fingerprint_check check (
    length(trim(correction_fingerprint)) > 0
  ),
  constraint forge_mission_incident_attempts_dates_check check (
    completed_at >= started_at
  )
);

create index forge_mission_incidents_mission_status_idx
  on public.forge_mission_incidents(mission_id, resolution_status, detected_at desc);
create index forge_mission_incidents_checkpoint_idx
  on public.forge_mission_incidents(checkpoint_id, detected_at desc);
create index forge_mission_incident_attempts_incident_idx
  on public.forge_mission_incident_attempts(incident_id, attempt_number);

alter table public.forge_mission_incidents enable row level security;
alter table public.forge_mission_incident_attempts enable row level security;

revoke all on table public.forge_mission_incidents from anon, authenticated;
revoke all on table public.forge_mission_incident_attempts from anon, authenticated;
grant select on table public.forge_mission_incidents to authenticated;
grant select on table public.forge_mission_incident_attempts to authenticated;

create policy "Studio staff can read Forge mission incidents"
on public.forge_mission_incidents for select to authenticated
using (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
));

create policy "Studio staff can read Forge mission incident attempts"
on public.forge_mission_incident_attempts for select to authenticated
using (exists (
  select 1 from public.agent_profiles ap
  where ap.is_active = true and ap.role in ('agent', 'admin')
    and (ap.user_id = (select auth.uid())
      or lower(ap.email) = lower((select auth.jwt()) ->> 'email'))
));

