-- Additive presentation decisions. No business data is deleted or marked compliant.
create table if not exists public.daily_agent_task_dispositions (
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  task_key text not null check (char_length(task_key) between 10 and 200),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  resolution text not null check (resolution in ('handled','dismissed')),
  reason text not null check (char_length(btrim(reason)) between 8 and 1000),
  actor_user_id uuid not null,
  actor_email text not null,
  task_title text not null,
  task_status text not null,
  resolved_at timestamptz not null default now(),
  primary key (organisation_id, task_key)
);
create table if not exists public.daily_agent_task_disposition_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  task_key text not null,
  fingerprint text not null,
  resolution text not null,
  reason text not null,
  actor_user_id uuid not null,
  actor_email text not null,
  task_title text not null,
  task_status text not null,
  recorded_at timestamptz not null default now()
);
create index if not exists daily_agent_task_disposition_events_lookup
  on public.daily_agent_task_disposition_events(organisation_id, task_key, recorded_at desc);
create or replace function public.log_daily_agent_task_disposition()
returns trigger language plpgsql set search_path = public as $$
begin
  insert into public.daily_agent_task_disposition_events (
    organisation_id, task_key, fingerprint, resolution, reason,
    actor_user_id, actor_email, task_title, task_status
  ) values (
    new.organisation_id, new.task_key, new.fingerprint, new.resolution, new.reason,
    new.actor_user_id, new.actor_email, new.task_title, new.task_status
  );
  return new;
end;
$$;
drop trigger if exists daily_agent_task_disposition_audit on public.daily_agent_task_dispositions;
create trigger daily_agent_task_disposition_audit
after insert or update on public.daily_agent_task_dispositions
for each row execute function public.log_daily_agent_task_disposition();
alter table public.daily_agent_task_dispositions enable row level security;
alter table public.daily_agent_task_disposition_events enable row level security;
revoke all on public.daily_agent_task_dispositions from anon, authenticated;
revoke all on public.daily_agent_task_disposition_events from anon, authenticated;
grant select, insert, update on public.daily_agent_task_dispositions to service_role;
grant select, insert on public.daily_agent_task_disposition_events to service_role;
