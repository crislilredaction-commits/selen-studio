-- Journal métier concis des interactions importantes avec une alerte.

create table public.forge_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.forge_alerts(id) on delete cascade,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint forge_alert_events_type_check check (
    event_type in ('read', 'context_opened', 'archived')
  )
);

create index forge_alert_events_alert_idx
  on public.forge_alert_events(alert_id, created_at desc);

alter table public.forge_alert_events enable row level security;
revoke all on table public.forge_alert_events from public, anon, authenticated;
grant select, insert on table public.forge_alert_events to authenticated;

create policy "Studio staff can read Forge alert events"
on public.forge_alert_events for select to authenticated
using (public.forge_current_access_level() in ('viewer', 'admin'));

create policy "Studio admins can create Forge alert events"
on public.forge_alert_events for insert to authenticated
with check (
  public.forge_current_access_level() = 'admin'
  and actor_id = (select auth.uid())
);

create or replace function public.forge_audit_alert_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.read_at is null and new.read_at is not null then
    insert into public.forge_alert_events(alert_id, event_type, actor_id)
    values (new.id, 'read', (select auth.uid()));
  end if;
  if old.archived_at is null and new.archived_at is not null then
    insert into public.forge_alert_events(alert_id, event_type, actor_id)
    values (new.id, 'archived', (select auth.uid()));
  end if;
  return new;
end;
$$;

create trigger forge_alerts_audit_updates
after update of read_at, archived_at on public.forge_alerts
for each row execute function public.forge_audit_alert_update();

create or replace function public.forge_record_alert_context_open(p_alert_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.forge_require_admin();
  insert into public.forge_alert_events(alert_id, event_type, actor_id)
  values (p_alert_id, 'context_opened', (select auth.uid()));
end;
$$;

revoke all on function public.forge_audit_alert_update()
  from public, anon, authenticated;
revoke all on function public.forge_record_alert_context_open(uuid)
  from public, anon;
grant execute on function public.forge_record_alert_context_open(uuid)
  to authenticated;

