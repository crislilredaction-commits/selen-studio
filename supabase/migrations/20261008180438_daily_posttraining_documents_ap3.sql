-- AP3 — atomic, idempotent registration of post-training documents.

with ranked as (
  select id,
         row_number() over (
           partition by organisation_id, document_type, linked_object_type, linked_object_id, logical_name
           order by version desc, created_at desc, id desc
         ) as position
  from public.daily_documents
  where is_current = true
    and document_type in ('attendance_summary', 'completion_certificate')
)
update public.daily_documents d
set is_current = false,
    updated_at = now()
from ranked r
where d.id = r.id
  and r.position > 1;

create unique index if not exists daily_posttraining_document_current_scope_unique
on public.daily_documents (
  organisation_id,
  document_type,
  linked_object_type,
  linked_object_id,
  logical_name
)
where is_current = true
  and document_type in ('attendance_summary', 'completion_certificate');

create or replace function public.daily_register_posttraining_document(
  p_document_id uuid,
  p_organisation_id uuid,
  p_document_type text,
  p_linked_object_type text,
  p_linked_object_id uuid,
  p_logical_name text,
  p_storage_path text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_actor_id uuid,
  p_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.daily_sessions%rowtype;
  v_enrolment public.daily_session_enrolments%rowtype;
  v_previous public.daily_documents%rowtype;
  v_inserted public.daily_documents%rowtype;
  v_version integer;
  v_fingerprint text := nullif(coalesce(p_metadata->>'source_fingerprint', ''), '');
begin
  if p_document_type not in ('attendance_summary', 'completion_certificate') then
    raise exception 'Unsupported Daily post-training document type';
  end if;
  if v_fingerprint is null then
    raise exception 'A source fingerprint is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    concat_ws(':', p_organisation_id, p_document_type, p_linked_object_type, p_linked_object_id, p_logical_name),
    0
  ));

  if p_document_type = 'attendance_summary' then
    if p_linked_object_type <> 'session' then raise exception 'Attendance summary must link to a session'; end if;
    select * into v_session
    from public.daily_sessions
    where id = p_linked_object_id
      and organisation_id = p_organisation_id
      and status not in ('cancelled', 'archived');
    if not found then raise exception 'Active Daily session not found'; end if;
  else
    if p_linked_object_type <> 'enrolment' then raise exception 'Completion certificate must link to an enrolment'; end if;
    select * into v_enrolment
    from public.daily_session_enrolments
    where id = p_linked_object_id
      and organisation_id = p_organisation_id
      and status not in ('declined', 'cancelled', 'abandoned');
    if not found then raise exception 'Active Daily enrolment not found'; end if;
    select * into v_session
    from public.daily_sessions
    where id = v_enrolment.session_id
      and organisation_id = p_organisation_id
      and status not in ('cancelled', 'archived');
    if not found then raise exception 'Active Daily session not found'; end if;
  end if;

  select * into v_previous
  from public.daily_documents
  where organisation_id = p_organisation_id
    and document_type = p_document_type
    and linked_object_type = p_linked_object_type
    and linked_object_id = p_linked_object_id
    and logical_name = p_logical_name
    and is_current = true
  order by version desc, created_at desc
  limit 1
  for update;

  if v_previous.id is not null
     and v_previous.metadata->>'source_fingerprint' = v_fingerprint then
    return jsonb_build_object('id', v_previous.id, 'version', v_previous.version, 'created', false);
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.daily_documents
  where organisation_id = p_organisation_id
    and document_type = p_document_type
    and linked_object_type = p_linked_object_type
    and linked_object_id = p_linked_object_id
    and logical_name = p_logical_name;

  update public.daily_documents
  set is_current = false,
      updated_by = p_actor_id,
      updated_at = now()
  where organisation_id = p_organisation_id
    and document_type = p_document_type
    and linked_object_type = p_linked_object_type
    and linked_object_id = p_linked_object_id
    and logical_name = p_logical_name
    and is_current = true;

  insert into public.daily_documents (
    id, organisation_id, document_type, linked_object_type, linked_object_id,
    formation_id, session_id, learner_id, enrolment_id, version, status,
    logical_name, bucket, storage_path, mime_type, size_bytes, sha256,
    created_by, updated_by, is_current, previous_document_id, metadata
  ) values (
    p_document_id, p_organisation_id, p_document_type, p_linked_object_type, p_linked_object_id,
    v_session.formation_id, v_session.id, v_enrolment.learner_id,
    case when p_document_type = 'completion_certificate' then v_enrolment.id else null end,
    v_version, 'to_check', p_logical_name, 'documents', p_storage_path, p_mime_type,
    p_size_bytes, p_sha256, p_actor_id, p_actor_id, true, v_previous.id, coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_inserted;

  return jsonb_build_object('id', v_inserted.id, 'version', v_inserted.version, 'created', true);
end;
$$;

revoke all on function public.daily_register_posttraining_document(
  uuid, uuid, text, text, uuid, text, text, text, bigint, text, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.daily_register_posttraining_document(
  uuid, uuid, text, text, uuid, text, text, text, bigint, text, uuid, jsonb
) to service_role;
