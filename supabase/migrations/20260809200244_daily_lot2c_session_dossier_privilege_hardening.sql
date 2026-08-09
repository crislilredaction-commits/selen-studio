-- Selen Daily Lot 2C - keep client direct writes limited to checklist progress fields only.
revoke update on public.daily_session_checklist_items from authenticated;
grant update(status,note) on public.daily_session_checklist_items to authenticated;
revoke insert,delete on public.daily_session_checklist_items from authenticated;
revoke insert,update,delete on public.daily_session_dossiers from authenticated;
