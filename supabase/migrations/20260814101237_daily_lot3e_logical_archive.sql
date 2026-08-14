-- Selen Daily Lot 3E - logical archive after final closure.
-- Archiving only changes dossier status; no business data is deleted.

create or replace function public.daily_archive_session_dossier(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists (
    select 1
    from public.daily_session_dossiers d
    join public.daily_session_checklist_items i
      on i.session_id=d.session_id
     and i.item_key='selen_closure_review'
    where d.session_id=p_session_id
      and d.status='completed'
      and i.status='validated'
  ) then
    raise exception 'Only a completed session dossier with a validated Selen closure review can be archived';
  end if;

  update public.daily_session_dossiers
  set status='archived'
  where session_id=p_session_id;
end;
$$;

revoke execute on function public.daily_archive_session_dossier(uuid) from public,anon,authenticated;
grant execute on function public.daily_archive_session_dossier(uuid) to service_role;
