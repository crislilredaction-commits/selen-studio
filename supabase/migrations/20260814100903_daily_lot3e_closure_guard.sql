-- Selen Daily Lot 3E - make the closure checklist item authoritative.
-- This also protects older Studio screens that can still update checklist status directly.

create or replace function public.daily_guard_session_closure_review()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  blocking_count integer;
begin
  if new.item_key <> 'selen_closure_review' then
    return new;
  end if;

  if new.status='not_applicable' then
    raise exception 'Selen closure review cannot be marked not applicable';
  end if;

  if new.status='validated' and old.status is distinct from 'validated' then
    select count(*) into blocking_count
    from public.daily_session_checklist_items
    where session_id=new.session_id
      and item_key <> 'selen_closure_review'
      and status not in ('validated','not_applicable');

    if blocking_count > 0 then
      raise exception 'Session dossier cannot be closed: % checklist item(s) remain incomplete', blocking_count;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_guard_session_closure_review() from public,anon,authenticated;
grant execute on function public.daily_guard_session_closure_review() to service_role;

drop trigger if exists daily_session_closure_review_guard on public.daily_session_checklist_items;
create trigger daily_session_closure_review_guard
before update of status on public.daily_session_checklist_items
for each row
when (old.status is distinct from new.status)
execute function public.daily_guard_session_closure_review();

create or replace function public.daily_sync_dossier_from_closure_review()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.item_key <> 'selen_closure_review' then
    return new;
  end if;

  if new.status='validated' then
    update public.daily_session_dossiers
    set status='completed',
        completed_at=coalesce(completed_at,now())
    where session_id=new.session_id;
  elsif old.status='validated' and new.status <> 'validated' then
    update public.daily_session_dossiers
    set status='active',
        completed_at=null
    where session_id=new.session_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_sync_dossier_from_closure_review() from public,anon,authenticated;
grant execute on function public.daily_sync_dossier_from_closure_review() to service_role;

drop trigger if exists daily_session_closure_review_sync on public.daily_session_checklist_items;
create trigger daily_session_closure_review_sync
after update of status on public.daily_session_checklist_items
for each row
when (old.status is distinct from new.status)
execute function public.daily_sync_dossier_from_closure_review();
