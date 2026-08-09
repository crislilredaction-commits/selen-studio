-- Selen Daily Lot 1B.2 - authenticated Studio users may only change notification UI state.

revoke update on table public.notifications from authenticated;
grant update (pinned, read_at, dismissed_at) on table public.notifications to authenticated;
