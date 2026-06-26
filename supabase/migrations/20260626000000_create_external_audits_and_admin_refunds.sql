create table if not exists public.external_audits (
  id uuid primary key default gen_random_uuid(),
  of_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  address text,
  audit_type text not null,
  certifier text,
  audit_date date not null,
  start_time time not null,
  end_time time,
  status text not null default 'planned',
  google_calendar_event_id text,
  confirmation_email_sent_at timestamptz,
  reminder_email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint external_audits_status_check check (
    status in ('planned', 'confirmed', 'completed', 'cancelled')
  )
);

create index if not exists external_audits_audit_date_idx
  on public.external_audits (audit_date, start_time);

create or replace function public.set_external_audits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_external_audits_updated_at on public.external_audits;

create trigger trg_external_audits_updated_at
before update on public.external_audits
for each row
execute function public.set_external_audits_updated_at();

alter table public.external_audits enable row level security;

drop policy if exists "Studio admins can read external audits" on public.external_audits;
create policy "Studio admins can read external audits"
on public.external_audits
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Studio admins can insert external audits" on public.external_audits;
create policy "Studio admins can insert external audits"
on public.external_audits
for insert
to authenticated
with check (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Studio admins can update external audits" on public.external_audits;
create policy "Studio admins can update external audits"
on public.external_audits
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
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
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);

drop policy if exists "Studio staff can update refund requests" on public.support_refund_requests;

create policy "Studio admins can update refund requests"
on public.support_refund_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role = 'admin'
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
      and ap.role = 'admin'
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);
