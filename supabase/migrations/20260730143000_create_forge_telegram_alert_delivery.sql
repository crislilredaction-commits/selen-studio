-- Relais Telegram privé des alertes Forge importantes.

create table public.forge_telegram_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.forge_telegram_settings (id, enabled) values (true, false);

create table public.forge_telegram_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.forge_alerts(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  next_attempt_at timestamptz not null default now(),
  telegram_message_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint forge_telegram_deliveries_alert_unique unique (alert_id),
  constraint forge_telegram_deliveries_status_check check (
    status in ('pending', 'processing', 'retry_scheduled', 'sent', 'failed', 'disabled')
  ),
  constraint forge_telegram_deliveries_attempts_check check (
    attempt_count between 0 and max_attempts and max_attempts between 1 and 5
  ),
  constraint forge_telegram_deliveries_result_check check (
    (status = 'sent' and sent_at is not null and telegram_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  )
);

create index forge_telegram_deliveries_queue_idx
  on public.forge_telegram_deliveries(status, next_attempt_at, created_at)
  where status in ('pending', 'retry_scheduled');

alter table public.forge_telegram_settings enable row level security;
alter table public.forge_telegram_deliveries enable row level security;
revoke all on table public.forge_telegram_settings from public, anon, authenticated;
revoke all on table public.forge_telegram_deliveries from public, anon, authenticated;
grant select, update on table public.forge_telegram_settings to authenticated;
grant select on table public.forge_telegram_deliveries to authenticated;

create policy "Studio admins manage Forge Telegram settings"
on public.forge_telegram_settings for all to authenticated
using (public.forge_current_access_level() = 'admin')
with check (public.forge_current_access_level() = 'admin');

create policy "Studio admins read Forge Telegram deliveries"
on public.forge_telegram_deliveries for select to authenticated
using (public.forge_current_access_level() = 'admin');

create or replace function public.forge_enqueue_telegram_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.alert_type in (
    'mission_blocked', 'plan_validation_required', 'human_decision_required',
    'critical_incident', 'mission_ready_to_resume', 'mission_completed',
    'mission_failed', 'final_report_available', 'preview_available',
    'important_warning'
  ) and new.level <> 'information' then
    insert into public.forge_telegram_deliveries(alert_id)
    values (new.id)
    on conflict (alert_id) do nothing;

    update public.forge_alerts
    set external_channel_eligible = true,
        external_delivery_status = 'scheduled'
    where id = new.id;
  end if;
  return new;
end;
$$;

create trigger forge_alerts_enqueue_telegram
after insert on public.forge_alerts
for each row execute function public.forge_enqueue_telegram_alert();

create or replace function public.forge_claim_telegram_deliveries(p_limit integer default 10)
returns setof public.forge_telegram_deliveries
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select d.id
    from public.forge_telegram_deliveries d
    where d.status in ('pending', 'retry_scheduled')
      and d.next_attempt_at <= now()
      and d.attempt_count < d.max_attempts
    order by d.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 25)
  )
  update public.forge_telegram_deliveries d
  set status = 'processing',
      attempt_count = d.attempt_count + 1,
      updated_at = now()
  from claimed
  where d.id = claimed.id
  returning d.*;
end;
$$;

create or replace function public.forge_finish_telegram_delivery(
  p_delivery_id uuid,
  p_sent boolean,
  p_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.forge_telegram_deliveries;
begin
  select * into delivery
  from public.forge_telegram_deliveries
  where id = p_delivery_id
  for update;

  if delivery.id is null or delivery.status <> 'processing' then
    raise exception 'Telegram delivery is not processing';
  end if;

  update public.forge_telegram_deliveries
  set status = case
        when p_sent then 'sent'
        when attempt_count >= max_attempts then 'failed'
        else 'retry_scheduled'
      end,
      telegram_message_id = case when p_sent then left(p_message_id, 100) else null end,
      last_error = case when p_sent then null else left(coalesce(p_error, 'telegram_delivery_failed'), 300) end,
      sent_at = case when p_sent then now() else null end,
      next_attempt_at = case when p_sent then next_attempt_at else now() + interval '5 minutes' * attempt_count end,
      updated_at = now()
  where id = p_delivery_id;

  update public.forge_alerts
  set external_delivery_status = case
        when p_sent then 'sent'
        when delivery.attempt_count >= delivery.max_attempts then 'failed'
        else 'scheduled'
      end,
      updated_at = now()
  where id = delivery.alert_id;
end;
$$;

revoke all on function public.forge_enqueue_telegram_alert() from public, anon, authenticated;
revoke all on function public.forge_claim_telegram_deliveries(integer) from public, anon, authenticated;
revoke all on function public.forge_finish_telegram_delivery(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.forge_claim_telegram_deliveries(integer) to service_role;
grant execute on function public.forge_finish_telegram_delivery(uuid, boolean, text, text) to service_role;

