-- P0 Studio: atomic delegated imports, versioned replacement and tenant-safe links.

create or replace function public.daily_register_delegated_document(
  p_document_id uuid,
  p_organisation_id uuid,
  p_logical_name text,
  p_bucket text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_actor uuid,
  p_agent_profile_id uuid,
  p_metadata jsonb,
  p_replaces_document_id uuid,
  p_expected_updated_at timestamptz,
  p_links jsonb
) returns public.daily_documents
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_previous public.daily_documents%rowtype;
  v_result public.daily_documents%rowtype;
  v_version integer;
  v_logical_name text := btrim(coalesce(p_logical_name, ''));
begin
  if v_logical_name = '' or p_bucket <> 'documents' or p_size_bytes <= 0
     or p_sha256 !~ '^[A-Fa-f0-9]{64}$' or jsonb_typeof(coalesce(p_links, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid delegated document payload';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'daily-delegated:' || p_organisation_id::text || ':' || lower(v_logical_name), 0
  ));

  if p_replaces_document_id is not null then
    select * into v_previous
    from public.daily_documents
    where id = p_replaces_document_id
      and organisation_id = p_organisation_id
      and document_type = 'delegated_upload'
      and linked_object_type = 'organisation'
      and linked_object_id = p_organisation_id
      and is_current = true
      and metadata ->> 'source' = 'studio_delegation'
    for update;

    if not found or p_expected_updated_at is null or v_previous.updated_at <> p_expected_updated_at then
      raise exception 'delegated document changed before replacement';
    end if;
    v_logical_name := v_previous.logical_name;
    v_version := v_previous.version + 1;
    update public.daily_documents
      set is_current = false, status = 'archived', archived_at = now(), updated_by = p_actor
      where id = v_previous.id;
  else
    if exists (
      select 1 from public.daily_documents
      where organisation_id = p_organisation_id and document_type = 'delegated_upload'
        and linked_object_type = 'organisation' and linked_object_id = p_organisation_id
        and logical_name = v_logical_name and is_current = true
    ) then
      raise exception 'a current delegated document with this name already exists';
    end if;
    select coalesce(max(version), 0) + 1 into v_version
    from public.daily_documents
    where organisation_id = p_organisation_id and document_type = 'delegated_upload'
      and linked_object_type = 'organisation' and linked_object_id = p_organisation_id
      and logical_name = v_logical_name;
  end if;

  insert into public.daily_documents (
    id, organisation_id, document_type, linked_object_type, linked_object_id,
    version, status, logical_name, bucket, storage_path, mime_type, size_bytes, sha256,
    created_by, updated_by, is_current, previous_document_id, metadata
  ) values (
    p_document_id, p_organisation_id, 'delegated_upload', 'organisation', p_organisation_id,
    v_version, 'draft', v_logical_name, p_bucket, p_storage_path, p_mime_type, p_size_bytes, p_sha256,
    p_actor, p_actor, true, v_previous.id,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('versioned_at', now(), 'replaced_document_id', v_previous.id)
  ) returning * into v_result;

  if p_replaces_document_id is not null and jsonb_array_length(coalesce(p_links, '[]'::jsonb)) = 0 then
    insert into public.daily_document_links (
      document_id, organisation_id, entity_type, entity_id, created_by_agent_profile_id, metadata
    )
    select p_document_id, p_organisation_id, entity_type, entity_id, p_agent_profile_id,
      coalesce(metadata, '{}'::jsonb) || jsonb_build_object('source', 'studio_delegation', 'copied_from_document_id', v_previous.id)
    from public.daily_document_links where document_id = v_previous.id;
  else
    insert into public.daily_document_links (
      document_id, organisation_id, entity_type, entity_id, created_by_agent_profile_id, metadata
    )
    select p_document_id, p_organisation_id, requested.entity_type, requested.entity_id,
      p_agent_profile_id, jsonb_build_object('source', 'studio_delegation')
    from (
      select distinct item ->> 'entity_type' as entity_type, (item ->> 'entity_id')::uuid as entity_id
      from jsonb_array_elements(coalesce(p_links, '[]'::jsonb)) item
      union
      select 'organisation', p_organisation_id
    ) requested;
  end if;

  return v_result;
end;
$$;

revoke all on function public.daily_register_delegated_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,jsonb,uuid,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.daily_register_delegated_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,jsonb,uuid,timestamptz,jsonb) to service_role;

comment on function public.daily_register_delegated_document(uuid,uuid,text,text,text,text,bigint,text,uuid,uuid,jsonb,uuid,timestamptz,jsonb)
is 'Registers or atomically replaces a Studio delegated Daily document; tenant links are validated by daily_document_links trigger.';
