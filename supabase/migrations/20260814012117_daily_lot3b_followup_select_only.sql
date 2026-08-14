-- Selen Daily Lot 3B - explicit least-privilege grants for client-side database access.

revoke all on public.daily_session_followup_entries from authenticated;
grant select on public.daily_session_followup_entries to authenticated;
