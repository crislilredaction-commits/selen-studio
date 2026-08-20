-- Selen Daily Lot 4CC - closure gate for completed session and quality analysis.
-- Additive and reversible: no business data is deleted.

-- Existing dossiers receive the new Selen-only quality review item when missing.
insert into public.daily_session_checklist_items (
  session_id,
  organisation_id,
  item_key,
  phase,
  responsibility,
  label,
  description,
  due_at,
  position
)
select
  d.session_id,
  d.organisation_id,
  'quality_analysis_review',
  'after',
  'selen',
  'Mettre à jour les analyses de satisfaction et de performance',
  'Selen vérifie les retours de satisfaction et les indicateurs de performance de la session avant la revue de clôture.',
  case when s.end_date is null then null else s.end_date::timestamptz + interval '4 days' end,
  85
from public.daily_session_dossiers d
join public.daily_sessions s on s.id = d.session_id
where not exists (
  select 1
  from public.daily_session_checklist_items i
  where i.session_id = d.session_id
    and i.item_key = 'quality_analysis_review'
);

-- Future dossiers receive the item automatically without rewriting the historical seed function.
create or replace function public.daily_seed_quality_analysis_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_end_date date;
begin
  select s.end_date into session_end_date
  from public.daily_sessions s
  where s.id = new.session_id;

  insert into public.daily_session_checklist_items (
    session_id,
    organisation_id,
    item_key,
    phase,
    responsibility,
    label,
    description,
    due_at,
    position
  ) values (
    new.session_id,
    new.organisation_id,
    'quality_analysis_review',
    'after',
    'selen',
    'Mettre à jour les analyses de satisfaction et de performance',
    'Selen vérifie les retours de satisfaction et les indicateurs de performance de la session avant la revue de clôture.',
    case when session_end_date is null then null else session_end_date::timestamptz + interval '4 days' end,
    85
  )
  on conflict (session_id, item_key) do nothing;

  return new;
end;
$$;

revoke execute on function public.daily_seed_quality_analysis_review() from public, anon, authenticated;
grant execute on function public.daily_seed_quality_analysis_review() to service_role;

drop trigger if exists daily_session_dossier_seed_quality_analysis_review on public.daily_session_dossiers;
create trigger daily_session_dossier_seed_quality_analysis_review
after insert on public.daily_session_dossiers
for each row execute function public.daily_seed_quality_analysis_review();

-- Keep the historical direct-checklist guard aligned with the new closure rules so an
-- older Studio screen cannot bypass the canonical RPC.
create or replace function public.daily_guard_session_closure_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  session_end_date date;
  quality_status text;
  blocking_count integer;
begin
  if new.item_key <> 'selen_closure_review' then
    return new;
  end if;

  if new.status = 'not_applicable' then
    raise exception 'Selen closure review cannot be marked not applicable';
  end if;

  if new.status = 'validated' and old.status is distinct from 'validated' then
    select s.end_date into session_end_date
    from public.daily_sessions s
    where s.id = new.session_id;

    if session_end_date is null then
      raise exception 'Session dossier cannot be closed: session end date is missing';
    end if;

    if (now() at time zone 'Europe/Paris')::date <= session_end_date then
      raise exception 'Session dossier cannot be closed before the session has fully ended';
    end if;

    select i.status into quality_status
    from public.daily_session_checklist_items i
    where i.session_id = new.session_id
      and i.item_key = 'quality_analysis_review';

    if quality_status is distinct from 'validated' then
      raise exception 'Session dossier cannot be closed: satisfaction and performance analyses are not validated';
    end if;

    select count(*) into blocking_count
    from public.daily_session_checklist_items
    where session_id = new.session_id
      and item_key <> 'selen_closure_review'
      and status not in ('validated', 'not_applicable');

    if blocking_count > 0 then
      raise exception 'Session dossier cannot be closed: % checklist item(s) remain incomplete', blocking_count;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_guard_session_closure_review() from public, anon, authenticated;
grant execute on function public.daily_guard_session_closure_review() to service_role;

-- The canonical RPC carries the same guards: the training must be over and the
-- satisfaction/performance analysis must have been explicitly reviewed by Selen.
create or replace function public.daily_close_session_dossier(
  p_session_id uuid,
  p_note text default null,
  p_validated_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.daily_session_dossiers%rowtype;
  closure_item public.daily_session_checklist_items%rowtype;
  session_end_date date;
  quality_status text;
  blocking_count integer;
begin
  select * into d
  from public.daily_session_dossiers
  where session_id = p_session_id
  for update;

  if not found then
    raise exception 'Daily session dossier not found';
  end if;

  select s.end_date into session_end_date
  from public.daily_sessions s
  where s.id = p_session_id;

  if not found then
    raise exception 'Daily session not found';
  end if;

  if session_end_date is null then
    raise exception 'Session dossier cannot be closed: session end date is missing';
  end if;

  if (now() at time zone 'Europe/Paris')::date <= session_end_date then
    raise exception 'Session dossier cannot be closed before the session has fully ended';
  end if;

  select * into closure_item
  from public.daily_session_checklist_items
  where session_id = p_session_id
    and item_key = 'selen_closure_review'
  for update;

  if not found then
    raise exception 'Selen closure review item not found';
  end if;

  select status into quality_status
  from public.daily_session_checklist_items
  where session_id = p_session_id
    and item_key = 'quality_analysis_review'
  for update;

  if not found then
    raise exception 'Selen quality analysis review item not found';
  end if;

  if quality_status <> 'validated' then
    raise exception 'Session dossier cannot be closed: satisfaction and performance analyses are not validated';
  end if;

  select count(*) into blocking_count
  from public.daily_session_checklist_items
  where session_id = p_session_id
    and item_key <> 'selen_closure_review'
    and status not in ('validated', 'not_applicable');

  if blocking_count > 0 then
    raise exception 'Session dossier cannot be closed: % checklist item(s) remain incomplete', blocking_count;
  end if;

  update public.daily_session_checklist_items
  set status = 'validated',
      note = nullif(btrim(p_note), ''),
      validated_by = p_validated_by
  where id = closure_item.id;

  update public.daily_session_dossiers
  set status = 'completed',
      completed_at = now()
  where session_id = p_session_id;
end;
$$;

revoke execute on function public.daily_close_session_dossier(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.daily_close_session_dossier(uuid, text, uuid) to service_role;
