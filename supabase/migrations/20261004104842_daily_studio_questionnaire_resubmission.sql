-- Resubmit corrected questionnaire sources through the existing review state.
create or replace function public.daily_save_formation_review_sources(
  p_formation_id uuid, p_organisation_id uuid, p_expected_updated_at timestamptz,
  p_expected_status text, p_actor uuid, p_patch jsonb, p_sources jsonb
) returns public.daily_formations
language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  f public.daily_formations; next_f public.daily_formations; prior public.daily_documents;
  item jsonb; kind text; doc_type text; reference text; doc_id uuid; source_count int;
begin
  select * into f from public.daily_formations
    where id=p_formation_id and organisation_id=p_organisation_id for update;
  if not found or f.status not in ('draft','review','correction_requested','validated')
    or f.status is distinct from p_expected_status or f.updated_at is distinct from p_expected_updated_at then
    raise exception 'formation_changed' using errcode='P0001';
  end if;
  if p_actor is null or jsonb_typeof(p_patch) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_patch) k where k not in (
      'title','global_objective','learning_objectives','target_audience','detailed_program','prerequisites',
      'duration_hours','duration_days','modality','access_delays','registration_methods','price',
      'pedagogical_methods','pedagogical_resources','evaluation_methods','accessibility','disability_referent',
      'contact_phone','contact_email','contact_website','updated_at','positioning_questions',
      'learning_assessment_questions','learning_assessment_instructions','status','validation_note','agent_review_signaled_at'
    )) then raise exception 'invalid_review_patch' using errcode='22023'; end if;
  if f.status='validated' and exists (select 1 from jsonb_object_keys(p_patch) k where k not in (
    'updated_at','positioning_questions','learning_assessment_questions','learning_assessment_instructions',
    'status','validation_note','agent_review_signaled_at'
  )) then raise exception 'validated_program_is_readonly' using errcode='22023'; end if;
  if jsonb_typeof(p_sources) is distinct from 'array' or jsonb_array_length(p_sources) not between 1 and 2 then
    raise exception 'invalid_sources' using errcode='22023';
  end if;
  select count(distinct x->>'kind') into source_count from jsonb_array_elements(p_sources) x;
  if source_count<>jsonb_array_length(p_sources) then raise exception 'duplicate_source_kind' using errcode='22023'; end if;
  select * into next_f from jsonb_populate_record(f,p_patch);
  -- Neither a file replacement nor this internal helper can validate a programme.
  next_f.status := case when f.status in ('validated','correction_requested') then 'review' else f.status end;
  next_f.validation_note := case when f.status in ('validated','correction_requested') then null else f.validation_note end;
  next_f.agent_review_signaled_at := case when f.status in ('validated','correction_requested') then now() else f.agent_review_signaled_at end;
  for item in select * from jsonb_array_elements(p_sources) loop
    kind:=item->>'kind'; doc_id:=(item->>'id')::uuid;
    if kind='positioning' and f.positioning_mode='off_platform' then
      doc_type:='positioning_questionnaire_source'; reference:=f.positioning_questionnaire_document_url;
    elsif kind='assessment' and f.learning_assessment_mode='external' then
      doc_type:='learning_assessment_source'; reference:=f.learning_assessment_document_url;
    else raise exception 'source_mode_changed' using errcode='P0001'; end if;
    if item->>'storage_path' is distinct from 'daily/'||f.organisation_id::text||'/formation-sources/'||f.id::text||'/'||kind||'/'||doc_id::text
      or coalesce(item->>'sha256','') !~ '^[a-f0-9]{64}$'
      or coalesce(item->>'mime_type','') not in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      or coalesce((item->>'size_bytes')::bigint,0) not between 1 and 10485760
      or nullif(btrim(item->>'name'),'') is null then raise exception 'invalid_source' using errcode='22023'; end if;
    prior:=null;
    if nullif(reference,'') is not null then
      if reference !~* '^/api/client/daily/uploads[?]id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'invalid_previous_source' using errcode='P0001';
      end if;
      select * into prior from public.daily_documents where id=split_part(reference,'=',2)::uuid
        and organisation_id=f.organisation_id and document_type=doc_type
        and linked_object_type='organisation' and linked_object_id=f.organisation_id
        and (formation_id is null or formation_id=f.id) and bucket='documents' for update;
      if not found then raise exception 'previous_source_changed' using errcode='P0001'; end if;
      -- Shared originals (e.g. duplicated formations) and signed history stay usable.
      if prior.status<>'signed' and not exists (
        select 1 from public.daily_formations other where other.id<>f.id and other.status<>'archived'
          and (other.positioning_questionnaire_document_url=reference or other.learning_assessment_document_url=reference)
      ) then update public.daily_documents set is_current=false,updated_by=p_actor where id=prior.id; end if;
    end if;
    insert into public.daily_documents (
      id,organisation_id,document_type,linked_object_type,linked_object_id,version,status,logical_name,
      bucket,storage_path,mime_type,size_bytes,sha256,created_by,updated_by,is_current,previous_document_id,metadata
    ) values (
      doc_id,f.organisation_id,doc_type,'organisation',f.organisation_id,coalesce(prior.version,0)+1,'to_check',
      doc_type||'-'||f.id::text||'-'||doc_id::text,'documents',item->>'storage_path',item->>'mime_type',
      (item->>'size_bytes')::bigint,item->>'sha256',p_actor,p_actor,true,prior.id,
      jsonb_build_object('original_filename',item->>'name','upload_kind',doc_type,'source','daily_studio','source_formation_id',f.id)
    );
    if kind='positioning' then next_f.positioning_questionnaire_document_url:='/api/client/daily/uploads?id='||doc_id::text;
    else next_f.learning_assessment_document_url:='/api/client/daily/uploads?id='||doc_id::text; end if;
  end loop;
  update public.daily_formations set
    title=next_f.title,global_objective=next_f.global_objective,learning_objectives=next_f.learning_objectives,
    target_audience=next_f.target_audience,detailed_program=next_f.detailed_program,prerequisites=next_f.prerequisites,
    duration_hours=next_f.duration_hours,duration_days=next_f.duration_days,modality=next_f.modality,
    access_delays=next_f.access_delays,registration_methods=next_f.registration_methods,price=next_f.price,
    pedagogical_methods=next_f.pedagogical_methods,pedagogical_resources=next_f.pedagogical_resources,
    evaluation_methods=next_f.evaluation_methods,accessibility=next_f.accessibility,disability_referent=next_f.disability_referent,
    contact_phone=next_f.contact_phone,contact_email=next_f.contact_email,contact_website=next_f.contact_website,
    positioning_questions=next_f.positioning_questions,learning_assessment_questions=next_f.learning_assessment_questions,
    learning_assessment_instructions=next_f.learning_assessment_instructions,
    positioning_questionnaire_document_url=next_f.positioning_questionnaire_document_url,
    learning_assessment_document_url=next_f.learning_assessment_document_url,
    status=next_f.status,validation_note=next_f.validation_note,agent_review_signaled_at=next_f.agent_review_signaled_at,updated_at=clock_timestamp()
    where id=f.id returning * into next_f;
  return next_f;
end;
$$;
revoke all on function public.daily_save_formation_review_sources(uuid,uuid,timestamptz,text,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.daily_save_formation_review_sources(uuid,uuid,timestamptz,text,uuid,jsonb,jsonb) to service_role;
