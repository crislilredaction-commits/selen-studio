-- Lock source references inside the actual catalogue transaction, so an old
-- original cannot be restored while another save retires its last reference.
create or replace function public.daily_guard_formation_source_references()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare item record; source public.daily_documents; old_refs text[]; new_refs text[];
  pattern constant text := '^/api/client/daily/uploads[?]id=[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  new_refs:=array[new.detailed_program_document_url,new.positioning_questionnaire_document_url,new.learning_assessment_document_url];
  old_refs:=case when tg_op='UPDATE' then array[old.detailed_program_document_url,old.positioning_questionnaire_document_url,old.learning_assessment_document_url] else array[null::text,null::text,null::text] end;
  if tg_op='UPDATE' and new_refs is not distinct from old_refs and new.organisation_id=old.organisation_id then return new; end if;
  -- Lock in a stable order, including predecessors, to avoid lock inversions.
  perform 1 from public.daily_documents d where d.id in (
    select split_part(reference,'=',2)::uuid from unnest(old_refs||new_refs) reference where reference~pattern
  ) and (d.organisation_id=new.organisation_id or (tg_op='UPDATE' and d.organisation_id=old.organisation_id)) order by d.id for update;
  for item in select * from (values
    ('training_program_source',new_refs[1],old_refs[1]),
    ('positioning_questionnaire_source',new_refs[2],old_refs[2]),
    ('learning_assessment_source',new_refs[3],old_refs[3])
  ) refs(kind,reference,previous) loop
    if tg_op='UPDATE' and item.reference is not distinct from item.previous and new.organisation_id=old.organisation_id then continue; end if;
    -- Historical external programme references keep their established path.
    if item.reference is null or item.reference='' or item.reference !~ '^/api/client/daily/uploads' then continue; end if;
    if item.reference !~ pattern then raise exception 'Le document original a changé. Rechargez la formation avant de réessayer.' using errcode='PSE01'; end if;
    select * into source from public.daily_documents where id=split_part(item.reference,'=',2)::uuid
      and organisation_id=new.organisation_id and document_type=item.kind and linked_object_type='organisation'
      and linked_object_id=new.organisation_id and bucket='documents' and (formation_id is null or formation_id=new.id)
      and is_current and archived_at is null and status<>'archived';
    if not found then raise exception 'Le document original a changé. Rechargez la formation avant de réessayer.' using errcode='PSE01'; end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.daily_guard_formation_source_references() from public,anon,authenticated;
grant execute on function public.daily_guard_formation_source_references() to service_role;
create trigger daily_formations_guard_source_references before insert or update of
  organisation_id,detailed_program_document_url,positioning_questionnaire_document_url,learning_assessment_document_url
on public.daily_formations for each row execute function public.daily_guard_formation_source_references();

create or replace function public.daily_retire_unreferenced_formation_sources()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
declare item record;
begin
  for item in select * from (values
    ('training_program_source',old.detailed_program_document_url,new.detailed_program_document_url),
    ('positioning_questionnaire_source',old.positioning_questionnaire_document_url,new.positioning_questionnaire_document_url),
    ('learning_assessment_source',old.learning_assessment_document_url,new.learning_assessment_document_url)
  ) refs(kind,previous,reference) loop
    if item.previous is not distinct from item.reference or coalesce(item.previous,'') !~* '^/api/client/daily/uploads[?]id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    update public.daily_documents d set is_current=false where d.id=split_part(item.previous,'=',2)::uuid
      and d.organisation_id=old.organisation_id and d.document_type=item.kind
      and d.linked_object_type='organisation' and d.linked_object_id=old.organisation_id and d.bucket='documents'
      and (d.formation_id is null or d.formation_id=old.id) and d.is_current and d.signed_at is null and d.status<>'signed'
      and not exists (select 1 from public.daily_formations f where f.organisation_id=d.organisation_id and f.status<>'archived'
        and item.previous in (f.detailed_program_document_url,f.positioning_questionnaire_document_url,f.learning_assessment_document_url));
  end loop;
  return new;
end;
$$;
revoke all on function public.daily_retire_unreferenced_formation_sources() from public,anon,authenticated;
grant execute on function public.daily_retire_unreferenced_formation_sources() to service_role;
create trigger daily_formations_retire_unreferenced_sources after update of
  detailed_program_document_url,positioning_questionnaire_document_url,learning_assessment_document_url
on public.daily_formations for each row execute function public.daily_retire_unreferenced_formation_sources();
