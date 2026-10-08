-- P4: one canonical session follow-up stream for all operational events.
alter table public.daily_session_followup_entries
  drop constraint if exists daily_session_followup_entries_entry_type_check;

alter table public.daily_session_followup_entries
  add constraint daily_session_followup_entries_entry_type_check
  check (entry_type in (
    'incident',
    'adaptation',
    'note',
    'absence',
    'delay',
    'abandonment_alert'
  ));

comment on column public.daily_session_followup_entries.entry_type is
  'Canonical session event: incident, adaptation, note, absence, delay or abandonment alert.';
