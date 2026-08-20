-- Selen Daily Lot 4BW - allow free trainer follow-up notes alongside incidents and adaptations.
-- Additive V1 change: no row is deleted or transformed.

alter table public.daily_session_followup_entries
  drop constraint if exists daily_session_followup_entries_entry_type_check;

alter table public.daily_session_followup_entries
  add constraint daily_session_followup_entries_entry_type_check
  check (entry_type in ('incident','adaptation','note'));

comment on constraint daily_session_followup_entries_entry_type_check on public.daily_session_followup_entries
  is 'Daily V1 follow-up entries: incidents, adaptations and free trainer follow-up notes.';
