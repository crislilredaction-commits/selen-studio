create table if not exists public.client_reminders (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_id uuid,
  dossier_id uuid,
  reminder_type text not null,
  status text not null default 'ready',
  subject text not null,
  body_html text not null,
  body_text text not null,
  due_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  constraint client_reminders_status_check check (
    status in ('draft', 'ready', 'sent', 'ignored', 'postponed')
  ),
  constraint client_reminders_type_check check (
    reminder_type in (
      'preaudit_incomplete_15_days',
      'audit_blanc_booking_reminder_7_days',
      'audit_blanc_48h_reminder',
      'nda_inactive_9_days'
    )
  )
);

create index if not exists client_reminders_status_due_at_idx
  on public.client_reminders (status, due_at desc);

create index if not exists client_reminders_client_email_idx
  on public.client_reminders (lower(client_email));

create index if not exists client_reminders_dossier_id_idx
  on public.client_reminders (dossier_id);

create unique index if not exists client_reminders_active_dedupe_idx
  on public.client_reminders (dedupe_key)
  where status in ('draft', 'ready', 'postponed');

create or replace function public.set_client_reminders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_reminders_updated_at on public.client_reminders;

create trigger trg_client_reminders_updated_at
before update on public.client_reminders
for each row
execute function public.set_client_reminders_updated_at();

alter table public.client_reminders enable row level security;

create policy "Studio staff can read client reminders"
on public.client_reminders
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can update client reminders"
on public.client_reminders
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
)
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

create policy "Studio staff can insert client reminders"
on public.client_reminders
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

comment on table public.client_reminders is
  'Brouillons de relances client préparés par Studio et envoyés après validation agent.';

