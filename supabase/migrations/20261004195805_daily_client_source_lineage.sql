-- Bind source history to the opened catalogue formation or its unattached upload slot.
-- Private originals are registered only after their full file has been verified.
-- Their predecessor remains usable until the catalogue form actually saves;
-- cancelled edits, duplicates, and signed proofs must retain their original.
create or replace function public.daily_register_client_formation_source(
  p_organisation_id uuid, p_actor uuid, p_source jsonb
) returns public.daily_documents
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  doc_id uuid := (p_source->>'id')::uuid;
  prior_id uuid := nullif(p_source->>'previous_document_id','')::uuid;
  kind text := p_source->>'kind';
  source_formation_id uuid := nullif(p_source->>'source_formation_id','')::uuid;
  canonical_reference text;
  prior public.daily_documents;
  result public.daily_documents;
begin
  if p_organisation_id is null or p_actor is null or doc_id is null or jsonb_typeof(p_source)<>'object'
    or kind is null or kind not in ('training_program_source','positioning_questionnaire_source','learning_assessment_source')
    or (p_source->>'storage_path') is distinct from 'daily/'||p_organisation_id::text||'/catalogue-sources/'||kind||'/'||doc_id::text
    or coalesce(p_source->>'mime_type','') not in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or coalesce(p_source->>'sha256','') !~ '^[a-f0-9]{64}$'
    or coalesce((p_source->>'size_bytes')::bigint,0) not between 1 and 10485760
    or coalesce(p_source->>'name','')='' or length(p_source->>'name')>255
    or coalesce(p_source->>'slot','') !~ '^[a-zA-Z0-9._-]{1,80}$'
    or doc_id=prior_id then raise exception 'invalid_source' using errcode='22023'; end if;
  -- Replays and simultaneous confirmations share one private object/document.
  perform pg_advisory_xact_lock(hashtextextended('daily-client-source:'||doc_id::text,0));
  select * into result from public.daily_documents where id=doc_id;
  if found then
    if result.organisation_id is distinct from p_organisation_id or result.created_by is distinct from p_actor
      or result.document_type is distinct from kind or result.linked_object_type is distinct from 'organisation'
      or result.linked_object_id is distinct from p_organisation_id or result.bucket is distinct from 'documents'
      or result.storage_path is distinct from p_source->>'storage_path' or result.mime_type is distinct from p_source->>'mime_type'
      or result.sha256 is distinct from p_source->>'sha256' or result.size_bytes is distinct from (p_source->>'size_bytes')::bigint
      or result.previous_document_id is distinct from prior_id or result.metadata->>'original_filename' is distinct from p_source->>'name'
      or result.metadata->>'source_formation_id' is distinct from source_formation_id::text
      or result.metadata->>'canonical_source_reference' is distinct from p_source->>'expected_source_reference'
      or result.metadata->>'slot' is distinct from p_source->>'slot' or result.formation_id is not null
      or not result.is_current or result.archived_at is not null or result.status='archived' then
      raise exception 'source_changed' using errcode='P0001'; end if;
    return result;
  end if;
  if source_formation_id is not null then
    select case kind when 'training_program_source' then f.detailed_program_document_url
      when 'positioning_questionnaire_source' then f.positioning_questionnaire_document_url
      else f.learning_assessment_document_url end into canonical_reference
    from public.daily_formations f where f.id=source_formation_id and f.organisation_id=p_organisation_id and f.status<>'archived' for update;
    if not found or canonical_reference is distinct from p_source->>'expected_source_reference' then
      raise exception 'formation_source_changed' using errcode='P0001'; end if;
  elsif nullif(p_source->>'expected_source_reference','') is not null then
    raise exception 'invalid_source_binding' using errcode='22023';
  end if;
  if prior_id is not null then
    select * into prior from public.daily_documents where id=prior_id and organisation_id=p_organisation_id
      and document_type=kind and linked_object_type='organisation' and linked_object_id=p_organisation_id
      and bucket='documents' and (formation_id is null or formation_id=source_formation_id) and is_current and archived_at is null and status<>'archived' for update;
    if not found then raise exception 'previous_source_changed' using errcode='P0001'; end if;
    if source_formation_id is null or canonical_reference is distinct from '/api/client/daily/uploads?id='||prior.id::text then
      if prior.created_by is distinct from p_actor or prior.metadata->>'source' is distinct from 'daily_client'
        or prior.metadata->>'slot' is distinct from p_source->>'slot' or prior.status='signed' or prior.signed_at is not null
        or exists(select 1 from public.daily_formations f where f.organisation_id=p_organisation_id and f.status<>'archived'
          and '/api/client/daily/uploads?id='||prior.id::text in (f.detailed_program_document_url,f.positioning_questionnaire_document_url,f.learning_assessment_document_url)) then
        raise exception 'previous_source_binding_changed' using errcode='P0001'; end if;
    end if;
  end if;
  insert into public.daily_documents (
    id,organisation_id,document_type,linked_object_type,linked_object_id,logical_name,version,status,
    bucket,storage_path,mime_type,size_bytes,sha256,created_by,updated_by,is_current,previous_document_id,metadata
  ) values (
    doc_id,p_organisation_id,kind,'organisation',p_organisation_id,kind||'-'||doc_id::text,coalesce(prior.version,0)+1,'to_check',
    'documents',p_source->>'storage_path',p_source->>'mime_type',(p_source->>'size_bytes')::bigint,p_source->>'sha256',
    p_actor,p_actor,true,prior_id,jsonb_build_object('original_filename',p_source->>'name','upload_kind',kind,'slot',p_source->>'slot','source','daily_client','source_formation_id',source_formation_id,'canonical_source_reference',canonical_reference)
  ) returning * into result;
  return result;
end;
$$;
revoke all on function public.daily_register_client_formation_source(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.daily_register_client_formation_source(uuid,uuid,jsonb) to service_role;
