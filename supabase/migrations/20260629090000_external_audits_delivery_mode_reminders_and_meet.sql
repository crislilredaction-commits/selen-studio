alter table public.external_audits
  add column if not exists audit_delivery_mode text not null default 'presentiel',
  add column if not exists google_meet_link text,
  add column if not exists calendar_link text,
  add column if not exists client_reminder_sent_at timestamptz,
  add column if not exists lil_reminder_sent_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_audits_delivery_mode_check'
      and conrelid = 'public.external_audits'::regclass
  ) then
    alter table public.external_audits
      add constraint external_audits_delivery_mode_check
      check (audit_delivery_mode in ('presentiel', 'distanciel'));
  end if;
end;
$$;

update public.external_audits
set
  audit_delivery_mode = coalesce(
    nullif(metadata ->> 'audit_delivery_mode', ''),
    audit_delivery_mode,
    'presentiel'
  ),
  google_meet_link = coalesce(
    google_meet_link,
    nullif(metadata ->> 'meet_link', ''),
    nullif(metadata ->> 'google_meet_link', '')
  ),
  calendar_link = coalesce(calendar_link, nullif(metadata ->> 'calendar_link', '')),
  lil_reminder_sent_at = coalesce(lil_reminder_sent_at, reminder_email_sent_at)
where true;

create index if not exists external_audits_client_reminder_due_idx
  on public.external_audits (audit_date, client_reminder_sent_at);

create index if not exists external_audits_lil_reminder_due_idx
  on public.external_audits (audit_date, lil_reminder_sent_at);
