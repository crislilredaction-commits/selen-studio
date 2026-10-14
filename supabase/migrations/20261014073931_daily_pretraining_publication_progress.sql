begin;
create or replace function public.daily_pretraining_document_progress(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
with session_scope as(select id,organisation_id from public.daily_sessions where id=p_session_id),
enrolments as(select e.* from public.daily_session_enrolments e join session_scope s on s.id=e.session_id and s.organisation_id=e.organisation_id where e.status not in ('declined','cancelled','abandoned')),
required as(
 select t.type,'session'::text as scope,s.id as linked_id,null::text as company from session_scope s cross join (values('training_program'),('welcome_booklet'),('internal_regulations')) t(type)
 union all select t.type,'enrolment',e.id,null from enrolments e cross join (values('convocation'),('registration_positioning')) t(type)
 union all select 'training_contract','enrolment',e.id,null from enrolments e where e.contracting_party_type='individual'
 union all select distinct 'training_agreement','session',p_session_id,btrim(e.company_name) from enrolments e where e.contracting_party_type='company' and nullif(btrim(e.company_name),'') is not null
), readiness as(
 select r.type,r.scope,r.linked_id,r.company,
   bool_or(d.id is not null) as prepared,
   bool_or(d.status in ('validated','published','signed')) as reviewed,
   bool_or(d.status in ('published','signed')) as published
 from required r join session_scope s on true
 left join lateral (select d.* from public.daily_documents d where d.organisation_id=s.organisation_id and d.is_current and d.status<>'archived'
   and d.document_type=r.type and d.linked_object_type=r.scope and d.linked_object_id=r.linked_id
   and (r.company is null or btrim(d.metadata->>'company_name')=r.company)
   order by d.version desc,d.created_at desc limit 1) d on true
 group by r.type,r.scope,r.linked_id,r.company
), totals as(
 select count(*)::int as expected_count,count(*) filter(where prepared)::int as prepared_count,
 count(*) filter(where reviewed)::int as reviewed_count,count(*) filter(where published)::int as published_count from readiness
), invalid_parties as(select count(*)::int as n from enrolments where contracting_party_type is null or (contracting_party_type='company' and nullif(btrim(company_name),'') is null))
select jsonb_build_object('expected_count',t.expected_count,'prepared_count',t.prepared_count,'reviewed_count',t.reviewed_count,'published_count',t.published_count,
 'status',case when i.n>0 then 'blocked' when t.published_count=t.expected_count and t.expected_count>0 then 'validated' when t.prepared_count=0 then 'todo' when t.prepared_count<t.expected_count then 'in_progress' else 'to_review' end,
 'requires_publication',t.reviewed_count=t.expected_count and t.published_count<t.expected_count)
from totals t cross join invalid_parties i;
$$;
revoke all on function public.daily_pretraining_document_progress(uuid) from public,anon,authenticated;
grant execute on function public.daily_pretraining_document_progress(uuid) to service_role;

-- Keep generic completed tasks monotone. Only the server may recompute the
-- document task from actual publication, retaining prior completion evidence.
create or replace function public.daily_maintain_session_checklist_timestamps()
returns trigger language plpgsql security invoker set search_path='' as $$
declare document_sync boolean:=false;
begin
  new.updated_at:=now();
  if new.item_key='pretraining_documents' and new.status<>'not_applicable' then
    if current_user in ('postgres','supabase_admin','service_role') then
      new.status:=public.daily_pretraining_document_progress(new.session_id)->>'status';
      document_sync:=true;
    elsif new.status='validated' then
      raise exception 'document publication workflow required' using errcode='42501';
    end if;
  end if;
  if tg_op='INSERT' then
    if new.signaled_at is null then new.signaled_at:=now(); end if;
    if new.status='in_progress' and new.started_at is null then new.started_at:=now(); end if;
    if new.status in ('validated','not_applicable') then
      if new.completed_at is null then new.completed_at:=now(); end if;
      new.validated_by:=coalesce(new.validated_by,auth.uid());
    end if;
    return new;
  end if;
  if old.status in ('validated','not_applicable') and new.status not in ('validated','not_applicable') then
    new.completed_at:=old.completed_at;
    new.validated_by:=old.validated_by;
    new.signaled_at:=old.signaled_at;
    if not (document_sync and old.status='validated' and old.item_key='pretraining_documents'
      and new.session_id=old.session_id and new.organisation_id=old.organisation_id) then
      new.status:=old.status;
      return new;
    end if;
  end if;
  if new.status is distinct from old.status then
    if new.status='in_progress' and new.started_at is null then new.started_at:=now(); end if;
    if new.status in ('validated','not_applicable') then
      new.completed_at:=coalesce(old.completed_at,now());
      new.validated_by:=coalesce(new.validated_by,auth.uid(),old.validated_by);
    end if;
  elsif new.status in ('validated','not_applicable') then
    new.completed_at:=coalesce(new.completed_at,old.completed_at,now());
    new.validated_by:=coalesce(new.validated_by,old.validated_by,auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.daily_maintain_session_checklist_timestamps() from public,anon,authenticated;
grant execute on function public.daily_maintain_session_checklist_timestamps() to service_role;

create or replace function public.daily_sync_session_pretraining_checklist(p_session_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_progress jsonb; v_item_id uuid;
begin
 if p_session_id is null then return; end if;
 v_progress:=public.daily_pretraining_document_progress(p_session_id);
 update public.daily_session_checklist_items set status=v_progress->>'status', signaled_at=coalesce(signaled_at,clock_timestamp()),
 note=(v_progress->>'published_count')||'/'||(v_progress->>'expected_count')||' documents préformation publiés ; '||(v_progress->>'reviewed_count')||' relus et validés.'
 where session_id=p_session_id and item_key='pretraining_documents' and status<>'not_applicable';
 -- The live checklist table has no automatic notification trigger. Keep the
 -- notice and task transition in the same document transaction.
 for v_item_id in select id from public.daily_session_checklist_items where session_id=p_session_id and item_key='pretraining_documents' loop
   perform public.daily_sync_session_checklist_notification(v_item_id);
 end loop;
end;
$$;
revoke all on function public.daily_sync_session_pretraining_checklist(uuid) from public,anon,authenticated;
grant execute on function public.daily_sync_session_pretraining_checklist(uuid) to service_role;

create or replace function public.daily_pretraining_document_session_id(p_document_type text,p_linked_object_type text,p_linked_object_id uuid)
returns uuid language sql stable security definer set search_path='' as $$
select case
 when p_document_type in ('training_program','training_agreement','welcome_booklet','internal_regulations') and p_linked_object_type='session' then p_linked_object_id
 when p_document_type in ('training_contract','convocation','registration_positioning') and p_linked_object_type='enrolment' then(select session_id from public.daily_session_enrolments where id=p_linked_object_id)
 else null end;
$$;
revoke all on function public.daily_pretraining_document_session_id(text,text,uuid) from public,anon,authenticated;
grant execute on function public.daily_pretraining_document_session_id(text,text,uuid) to service_role;

create or replace function public.daily_validate_pretraining_document_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare linked_org uuid;
begin
  if new.document_type not in ('training_program','training_agreement','training_contract','convocation','registration_positioning','welcome_booklet','internal_regulations') then return new; end if;
  if new.document_type in ('training_program','training_agreement','welcome_booklet','internal_regulations') then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then raise exception 'Daily session pretraining document must link to a session'; end if;
    select s.organisation_id into linked_org from public.daily_sessions s where s.id=new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then raise exception 'Daily learner pretraining document must link to an enrolment'; end if;
    select e.organisation_id into linked_org from public.daily_session_enrolments e where e.id=new.linked_object_id;
  end if;
  if linked_org is null then raise exception 'Daily pretraining linked object not found'; end if;
  if linked_org<>new.organisation_id then raise exception 'Daily pretraining document organisation mismatch'; end if;
  return new;
end;
$$;
revoke all on function public.daily_validate_pretraining_document_scope() from public,anon,authenticated;
grant execute on function public.daily_validate_pretraining_document_scope() to service_role;

-- Preserve the notification circuit and its history for accepted historical sessions.
CREATE OR REPLACE FUNCTION public.daily_sync_session_checklist_notification(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  item public.daily_session_checklist_items%rowtype;
  session_row public.daily_sessions%rowtype;
  formation_row public.daily_formations%rowtype;
  org_name text;
  source_key_value text;
  assignment_agent_id uuid;
  assignment_user_id uuid;
  link_path_value text;
  parent_active boolean := false;
  candidature_accepted boolean := false;
  is_attention boolean := false;
begin
  select * into item from public.daily_session_checklist_items where id = p_item_id;
  if not found then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = 'daily_session_checklist:' || p_item_id::text;
    return;
  end if;

  source_key_value := 'daily_session_checklist:' || item.id::text;
  select * into session_row from public.daily_sessions where id = item.session_id;
  if found then
    select * into formation_row from public.daily_formations where id = session_row.formation_id;
    parent_active := found
      and session_row.organisation_id = item.organisation_id
      and formation_row.organisation_id = item.organisation_id
      and coalesce(lower(session_row.status), '') not in ('archived','cancelled','canceled','deleted','removed','obsolete','abandoned','completed','done','closed')
      and (coalesce(lower(formation_row.status), '') not in ('archived','cancelled','canceled','deleted','removed','obsolete','abandoned','completed','done','closed') or (item.item_key='pretraining_documents' and formation_row.status='archived'))
      and public.daily_a11_organisation_is_active(item.organisation_id);
  end if;

  if parent_active and item.item_key = 'pretraining_documents' then
    select exists (
      select 1 from public.daily_formation_registration_requests r
      where r.attached_session_id = item.session_id
        and r.formation_id = session_row.formation_id
        and r.decision_status = 'accepted'
    ) into candidature_accepted;
  else
    candidature_accepted := true;
  end if;

  is_attention := parent_active
    and item.status in ('todo','in_progress','to_review','blocked')
    and item.responsibility in ('selen','shared')
    and item.signaled_at is not null
    and (item.item_key='pretraining_documents' or public.daily_session_checklist_phase_available(item.session_id, item.phase))
    and candidature_accepted;

  if not is_attention then
    update public.notifications
    set dismissed_at = coalesce(dismissed_at, now()), read_at = coalesce(read_at, now())
    where source_key = source_key_value;
    return;
  end if;

  select o.name into org_name from public.organisations o where o.id = item.organisation_id;
  select a.agent_profile_id, ap.user_id into assignment_agent_id, assignment_user_id
  from public.daily_organisation_assignments a
  join public.agent_profiles ap on ap.id = a.agent_profile_id and ap.is_active = true
  where a.organisation_id = item.organisation_id;

  link_path_value := case item.item_key
    when 'pretraining_documents' then '/agent/daily/pretraining-documents?session=' || item.session_id::text
    when 'trainer_assignment' then '/agent/daily/sessions/' || item.session_id::text
    when 'training_ready' then '/agent/daily/session-dossiers/' || item.session_id::text
    when 'attendance_followup' then '/agent/daily/sessions/' || item.session_id::text
    when 'posttraining_documents' then '/agent/daily/posttraining-documents'
    when 'quality_analysis_review' then '/agent/daily/session-dossiers/' || item.session_id::text || '/followup'
    when 'selen_closure_review' then '/agent/daily/session-dossiers/' || item.session_id::text || '/closure'
    else '/agent/daily/session-dossiers/' || item.session_id::text || '/full'
  end;

  insert into public.notifications(
    type,title,content,organisation_name,link_path,target_role,target_user_id,
    target_agent_profile_id,pinned,read_at,dismissed_at,escalation_at,created_at,
    source_key,source_kind
  ) values (
    'daily_session_checklist', item.label,
    coalesce(formation_row.title,'Session Daily') || case when nullif(btrim(item.description), '') is not null then ' · ' || item.description else '' end,
    org_name, link_path_value,
    case when assignment_agent_id is null then 'admin' else 'agent' end,
    assignment_user_id, assignment_agent_id, false, null, null,
    item.signaled_at + interval '24 hours', item.signaled_at,
    source_key_value, 'daily_session_checklist'
  )
  on conflict (source_key) where source_key is not null do update
  set title = excluded.title, content = excluded.content,
      organisation_name = excluded.organisation_name, link_path = excluded.link_path,
      target_role = excluded.target_role, target_user_id = excluded.target_user_id,
      target_agent_profile_id = excluded.target_agent_profile_id,
      escalation_at = excluded.escalation_at, created_at = excluded.created_at,
      dismissed_at = null,
      read_at = case
        when public.notifications.dismissed_at is not null
          or public.notifications.target_agent_profile_id is distinct from excluded.target_agent_profile_id
          or public.notifications.title is distinct from excluded.title
          or public.notifications.content is distinct from excluded.content
          or public.notifications.link_path is distinct from excluded.link_path
        then null else public.notifications.read_at end;
end;
$function$;
revoke all on function public.daily_sync_session_checklist_notification(uuid) from public,anon,authenticated;
grant execute on function public.daily_sync_session_checklist_notification(uuid) to service_role;
commit;
