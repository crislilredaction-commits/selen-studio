create unique index if not exists daily_learning_assessment_evidence_current_unique
  on public.daily_documents (organisation_id, session_id, enrolment_id)
  where document_type = 'learning_assessment_evidence'
    and is_current = true
    and archived_at is null;

create unique index if not exists daily_learning_assessment_reminder_active_unique
  on public.daily_communications (organisation_id, session_id, lower(recipient_email), (metadata ->> 'automation_day'))
  where communication_type = 'learning_assessment_reminder'
    and status in ('queued', 'sent', 'delivered');

create or replace function public.daily_replace_learning_assessment_evidence(
  p_document_id uuid, p_organisation_id uuid, p_session_id uuid, p_enrolment_id uuid,
  p_logical_name text, p_storage_path text, p_mime_type text, p_size_bytes bigint,
  p_sha256 text, p_actor_id uuid, p_metadata jsonb default '{}'::jsonb
) returns public.daily_documents
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.daily_sessions%rowtype;
  v_enrolment public.daily_session_enrolments%rowtype;
  v_existing public.daily_documents%rowtype;
  v_previous public.daily_documents%rowtype;
  v_result public.daily_documents%rowtype;
  v_version integer;
begin
  if p_document_id is null or p_actor_id is null then raise exception 'document_id_and_actor_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organisation_id::text || ':' || p_session_id::text || ':' || p_enrolment_id::text || ':learning_assessment_evidence', 0));
  select * into v_session from public.daily_sessions where id=p_session_id and organisation_id=p_organisation_id and coalesce(status,'') not in ('archived','cancelled');
  if not found then raise exception 'session_not_active'; end if;
  select * into v_enrolment from public.daily_session_enrolments where id=p_enrolment_id and organisation_id=p_organisation_id and session_id=p_session_id and coalesce(status,'') not in ('declined','cancelled','abandoned');
  if not found then raise exception 'enrolment_not_active'; end if;
  select * into v_existing from public.daily_documents where id=p_document_id;
  if found then
    if v_existing.organisation_id<>p_organisation_id or v_existing.session_id<>p_session_id or v_existing.enrolment_id<>p_enrolment_id or v_existing.document_type<>'learning_assessment_evidence' or v_existing.sha256<>p_sha256 then raise exception 'document_id_conflict'; end if;
    return v_existing;
  end if;
  select * into v_previous from public.daily_documents where organisation_id=p_organisation_id and session_id=p_session_id and enrolment_id=p_enrolment_id and document_type='learning_assessment_evidence' and is_current=true and archived_at is null order by version desc,created_at desc limit 1 for update;
  select coalesce(max(version),0)+1 into v_version from public.daily_documents where organisation_id=p_organisation_id and session_id=p_session_id and enrolment_id=p_enrolment_id and document_type='learning_assessment_evidence';
  update public.daily_documents set is_current=false,updated_by=p_actor_id,updated_at=now() where organisation_id=p_organisation_id and session_id=p_session_id and enrolment_id=p_enrolment_id and document_type='learning_assessment_evidence' and is_current=true and archived_at is null;
  insert into public.daily_documents (id,organisation_id,document_type,linked_object_type,linked_object_id,formation_id,session_id,learner_id,enrolment_id,version,status,logical_name,bucket,storage_path,mime_type,size_bytes,sha256,created_by,updated_by,is_current,previous_document_id,metadata)
  values (p_document_id,p_organisation_id,'learning_assessment_evidence','enrolment',p_enrolment_id,v_session.formation_id,p_session_id,v_enrolment.learner_id,p_enrolment_id,v_version,'to_check',p_logical_name,'documents',p_storage_path,p_mime_type,p_size_bytes,p_sha256,p_actor_id,p_actor_id,true,v_previous.id,coalesce(p_metadata,'{}'::jsonb)) returning * into v_result;
  return v_result;
end;
$$;
revoke all on function public.daily_replace_learning_assessment_evidence(uuid,uuid,uuid,uuid,text,text,text,bigint,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.daily_replace_learning_assessment_evidence(uuid,uuid,uuid,uuid,text,text,text,bigint,text,uuid,jsonb) to service_role;
