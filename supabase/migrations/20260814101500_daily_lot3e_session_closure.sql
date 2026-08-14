-- Selen Daily Lot 3E - guarded session dossier closure.
-- Closure is logical and reversible: no business data is deleted.

create or replace function public.daily_close_session_dossier(
  p_session_id uuid,
  p_note text default null,
  p_validated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  d public.daily_session_dossiers%rowtype;
  closure_item public.daily_session_checklist_items%rowtype;
  blocking_count integer;
begin
  select * into d
  from public.daily_session_dossiers
  where session_id=p_session_id
  for update;

  if not found then
    raise exception 'Daily session dossier not found';
  end if;

  select * into closure_item
  from public.daily_session_checklist_items
  where session_id=p_session_id
    and item_key='selen_closure_review'
  for update;

  if not found then
    raise exception 'Selen closure review item not found';
  end if;

  select count(*) into blocking_count
  from public.daily_session_checklist_items
  where session_id=p_session_id
    and item_key <> 'selen_closure_review'
    and status not in ('validated','not_applicable');

  if blocking_count > 0 then
    raise exception 'Session dossier cannot be closed: % checklist item(s) remain incomplete', blocking_count;
  end if;

  update public.daily_session_checklist_items
  set status='validated',
      note=nullif(btrim(p_note),''),
      validated_by=p_validated_by
  where id=closure_item.id;

  update public.daily_session_dossiers
  set status='completed',
      completed_at=now()
  where session_id=p_session_id;
end;
$$;

revoke execute on function public.daily_close_session_dossier(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.daily_close_session_dossier(uuid,text,uuid) to service_role;

create or replace function public.daily_reopen_session_dossier(
  p_session_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  closure_item_id uuid;
begin
  select id into closure_item_id
  from public.daily_session_checklist_items
  where session_id=p_session_id
    and item_key='selen_closure_review'
  for update;

  if closure_item_id is null then
    raise exception 'Selen closure review item not found';
  end if;

  update public.daily_session_checklist_items
  set status='to_review',
      note=coalesce(nullif(btrim(p_note),''), note),
      validated_by=null
  where id=closure_item_id;

  update public.daily_session_dossiers
  set status='active',
      completed_at=null
  where session_id=p_session_id;
end;
$$;

revoke execute on function public.daily_reopen_session_dossier(uuid,text) from public,anon,authenticated;
grant execute on function public.daily_reopen_session_dossier(uuid,text) to service_role;

-- If any upstream checklist point is reopened after closure, automatically reopen
-- the logical dossier so a completed dossier never hides a newly incomplete item.
create or replace function public.daily_reopen_dossier_on_checklist_regression()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.item_key <> 'selen_closure_review'
     and old.status in ('validated','not_applicable')
     and new.status not in ('validated','not_applicable') then
    update public.daily_session_dossiers
    set status='active', completed_at=null
    where session_id=new.session_id
      and status in ('completed','archived');

    update public.daily_session_checklist_items
    set status='to_review',
        validated_by=null,
        note=case
          when note is null or btrim(note)='' then 'Revue de clôture à refaire après modification du dossier.'
          else note
        end
    where session_id=new.session_id
      and item_key='selen_closure_review'
      and status='validated';
  end if;
  return new;
end;
$$;

revoke execute on function public.daily_reopen_dossier_on_checklist_regression() from public,anon,authenticated;
grant execute on function public.daily_reopen_dossier_on_checklist_regression() to service_role;

drop trigger if exists daily_session_dossier_reopen_on_regression on public.daily_session_checklist_items;
create trigger daily_session_dossier_reopen_on_regression
after update of status on public.daily_session_checklist_items
for each row
when (old.status is distinct from new.status)
execute function public.daily_reopen_dossier_on_checklist_regression();
