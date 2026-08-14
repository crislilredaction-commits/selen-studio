-- Selen Daily Lot 3B - keep incident/adaptation writes behind validated server APIs.

drop policy if exists "Session managers create Daily session followup"
  on public.daily_session_followup_entries;
drop policy if exists "Session managers update Daily session followup"
  on public.daily_session_followup_entries;

revoke insert,update on public.daily_session_followup_entries from authenticated;
