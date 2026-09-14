-- Selen Daily / Studio — Priorité 3A
-- La checklist est la source de vérité métier : une validation acquise ne doit
-- jamais être effacée par une resynchronisation automatique.
-- La preuve de validation (date + utilisateur lorsqu'il existe) reste portée
-- directement par la ligne canonique de checklist.

create or replace function public.daily_maintain_session_checklist_timestamps()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.signaled_at is null then new.signaled_at := now(); end if;
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status in ('validated','not_applicable') then
      if new.completed_at is null then new.completed_at := now(); end if;
      new.validated_by := coalesce(new.validated_by, auth.uid());
    end if;
    return new;
  end if;

  -- Une tâche terminée est monotone. Les synchronisations métier peuvent
  -- continuer à mettre à jour libellé, responsabilité, échéance ou note, mais
  -- elles ne rouvrent jamais silencieusement une validation déjà acquise.
  if old.status in ('validated','not_applicable')
     and new.status not in ('validated','not_applicable') then
    new.status := old.status;
    new.completed_at := old.completed_at;
    new.validated_by := old.validated_by;
    new.signaled_at := old.signaled_at;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;

    if new.status in ('validated','not_applicable') then
      new.completed_at := coalesce(old.completed_at, now());
      new.validated_by := coalesce(new.validated_by, auth.uid(), old.validated_by);
    end if;
  elsif new.status in ('validated','not_applicable') then
    -- Une mise à jour annexe ne doit pas effacer la preuve de clôture.
    new.completed_at := coalesce(new.completed_at, old.completed_at, now());
    new.validated_by := coalesce(new.validated_by, old.validated_by, auth.uid());
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_maintain_session_checklist_timestamps()
  from public, anon, authenticated;
grant execute on function public.daily_maintain_session_checklist_timestamps()
  to service_role;

create or replace function public.daily_maintain_checklist_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.signaled_at is null then new.signaled_at := now(); end if;
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status in ('validated','not_applicable') then
      if new.completed_at is null then new.completed_at := now(); end if;
      new.validated_by := coalesce(new.validated_by, auth.uid());
    end if;
    return new;
  end if;

  if old.status in ('validated','not_applicable')
     and new.status not in ('validated','not_applicable') then
    new.status := old.status;
    new.completed_at := old.completed_at;
    new.validated_by := old.validated_by;
    new.signaled_at := old.signaled_at;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;

    if new.status in ('validated','not_applicable') then
      new.completed_at := coalesce(old.completed_at, now());
      new.validated_by := coalesce(new.validated_by, auth.uid(), old.validated_by);
    end if;
  elsif new.status in ('validated','not_applicable') then
    new.completed_at := coalesce(new.completed_at, old.completed_at, now());
    new.validated_by := coalesce(new.validated_by, old.validated_by, auth.uid());
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_maintain_checklist_timestamps()
  from public, anon, authenticated;
grant execute on function public.daily_maintain_checklist_timestamps()
  to service_role;

-- Le paramétrage session appartenant à l'OF reste auto-validé quand la donnée
-- métier existe, mais une correction ultérieure incomplète ne ressuscite pas
-- une tâche terminée. Le trigger de timestamp ci-dessus garantit cette règle.
create or replace function public.daily_sync_session_setup_checklist()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  schedule_blocks_json jsonb := coalesce(to_jsonb(new.schedule_blocks), '[]'::jsonb);
  trainer_ids_json jsonb := coalesce(to_jsonb(new.trainer_ids), '[]'::jsonb);
  schedule_ready boolean;
  trainer_ready boolean;
begin
  schedule_ready := new.start_date is not null
    and new.end_date is not null
    and jsonb_typeof(schedule_blocks_json) = 'array'
    and jsonb_array_length(schedule_blocks_json) > 0
    and case
      when new.modality = 'presentiel' then nullif(btrim(coalesce(new.location_address, '')), '') is not null
      when new.modality = 'distanciel' then nullif(btrim(coalesce(new.remote_url, '')), '') is not null
      when new.modality = 'mixte' then nullif(btrim(coalesce(new.location_address, '')), '') is not null
        and nullif(btrim(coalesce(new.remote_url, '')), '') is not null
      else false
    end;

  trainer_ready := jsonb_typeof(trainer_ids_json) = 'array'
    and jsonb_array_length(trainer_ids_json) > 0;

  update public.daily_session_checklist_items
  set responsibility = 'client',
      label = 'Dates, horaires et lieu définis par l’OF',
      description = 'Ces éléments sont validés automatiquement lors de l’enregistrement de la session.',
      status = case
        when status in ('validated','not_applicable') then status
        when schedule_ready then 'validated'
        else 'todo'
      end
  where session_id = new.id
    and item_key = 'schedule_location';

  update public.daily_session_checklist_items
  set responsibility = 'client',
      label = 'Formateur défini par l’OF',
      description = 'L’affectation du formateur est validée automatiquement dès son enregistrement par l’OF.',
      status = case
        when status in ('validated','not_applicable') then status
        when trainer_ready then 'validated'
        else 'todo'
      end
  where session_id = new.id
    and item_key = 'trainer_assignment';

  return new;
end;
$$;
