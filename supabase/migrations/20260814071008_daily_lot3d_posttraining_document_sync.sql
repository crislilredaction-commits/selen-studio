-- Selen Daily Lot 3D - canonical post-training document scope and checklist synchronisation.
-- Reconciliation after migration 20260814070026. Additive only: no business data or storage object is deleted.

create or replace function public.daily_validate_posttraining_document_scope()
returns trigger language plpgsql security definer set search_path=public as $$
declare linked_org uuid;
begin
  if new.document_type not in ('attendance_summary','completion_certificate') then return new; end if;
  if new.document_type='attendance_summary' then
    if new.linked_object_type is distinct from 'session' or new.linked_object_id is null then raise exception 'Daily attendance summary must link to a session'; end if;
    select organisation_id into linked_org from public.daily_sessions where id=new.linked_object_id;
  else
    if new.linked_object_type is distinct from 'enrolment' or new.linked_object_id is null then raise exception 'Daily completion certificate must link to an enrolment'; end if;
    select organisation_id into linked_org from public.daily_session_enrolments where id=new.linked_object_id;
  end if;
  if linked_org is null then raise exception 'Daily post-training linked object not found'; end if;
  if linked_org<>new.organisation_id then raise exception 'Daily post-training document organisation mismatch'; end if;
  return new;
end;$$;
revoke execute on function public.daily_validate_posttraining_document_scope() from public,anon,authenticated;
grant execute on function public.daily_validate_posttraining_document_scope() to service_role;
drop trigger if exists daily_documents_validate_posttraining_scope on public.daily_documents;
create trigger daily_documents_validate_posttraining_scope before insert or update of organisation_id,document_type,linked_object_type,linked_object_id on public.daily_documents for each row execute function public.daily_validate_posttraining_document_scope();

create or replace function public.daily_posttraining_document_session_id(p_document_type text,p_linked_object_type text,p_linked_object_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
select case when p_document_type='attendance_summary' and p_linked_object_type='session' then p_linked_object_id when p_document_type='completion_certificate' and p_linked_object_type='enrolment' then (select session_id from public.daily_session_enrolments where id=p_linked_object_id) else null end;$$;
revoke execute on function public.daily_posttraining_document_session_id(text,text,uuid) from public,anon,authenticated;
grant execute on function public.daily_posttraining_document_session_id(text,text,uuid) to service_role;

create or replace function public.daily_sync_session_posttraining_checklist(p_session_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare active_enrolments integer:=0;active_slots integer:=0;settled_records integer:=0;expected_records integer:=0;eligible_certificates integer:=0;expected_documents integer:=0;current_documents integer:=0;validated_documents integer:=0;target_status text;target_note text;
begin
  if p_session_id is null then return; end if;
  select count(*) into active_enrolments from public.daily_session_enrolments where session_id=p_session_id and status not in ('declined','cancelled');
  select count(*) into active_slots from public.daily_attendance_slots where session_id=p_session_id and status<>'cancelled';
  expected_records:=active_enrolments*active_slots;
  select count(*) into settled_records from public.daily_attendance_records r join public.daily_session_enrolments e on e.id=r.enrolment_id join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and e.session_id=p_session_id and e.status not in ('declined','cancelled') and s.session_id=p_session_id and s.status<>'cancelled' and r.status<>'pending';
  if expected_records>0 and settled_records=expected_records then
    select count(distinct e.id) into eligible_certificates from public.daily_session_enrolments e where e.session_id=p_session_id and e.status not in ('declined','cancelled') and exists(select 1 from public.daily_attendance_records r join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and r.enrolment_id=e.id and s.session_id=p_session_id and s.status<>'cancelled' and r.status='present');
  end if;
  expected_documents:=case when active_slots>0 then 1+eligible_certificates else 0 end;
  with required_docs as (
    select d.id,d.status from public.daily_documents d where d.is_current=true and d.document_type='attendance_summary' and d.linked_object_type='session' and d.linked_object_id=p_session_id
    union all
    select d.id,d.status from public.daily_documents d join public.daily_session_enrolments e on e.id=d.linked_object_id where d.is_current=true and d.document_type='completion_certificate' and d.linked_object_type='enrolment' and e.session_id=p_session_id and e.status not in ('declined','cancelled') and exists(select 1 from public.daily_attendance_records r join public.daily_attendance_slots s on s.id=r.slot_id where r.session_id=p_session_id and r.enrolment_id=e.id and s.session_id=p_session_id and s.status<>'cancelled' and r.status='present')
  ) select count(*),count(*) filter(where status in ('validated','published','signed','active')) into current_documents,validated_documents from required_docs;
  if active_slots=0 then target_status:='todo';target_note:='Aucun créneau de présence disponible pour préparer les documents de fin.';
  elsif expected_records>0 and settled_records<expected_records then target_status:=case when settled_records>0 or current_documents>0 then 'in_progress' else 'todo' end;target_note:=settled_records::text||'/'||expected_records::text||' présence(s) finalisée(s) avant génération des documents de fin.';
  elsif current_documents=0 then target_status:='todo';target_note:=expected_documents::text||' document(s) de fin attendu(s).';
  elsif current_documents<expected_documents then target_status:='in_progress';target_note:=current_documents::text||'/'||expected_documents::text||' document(s) de fin préparé(s).';
  elsif validated_documents<expected_documents then target_status:='to_review';target_note:=current_documents::text||'/'||expected_documents::text||' document(s) de fin préparé(s), contrôle Selen requis.';
  else target_status:='validated';target_note:=expected_documents::text||' document(s) de fin validé(s).'; end if;
  update public.daily_session_checklist_items set status=target_status,note=target_note where session_id=p_session_id and item_key='posttraining_documents' and status<>'not_applicable' and (status is distinct from target_status or note is distinct from target_note);
end;$$;
revoke execute on function public.daily_sync_session_posttraining_checklist(uuid) from public,anon,authenticated;
grant execute on function public.daily_sync_session_posttraining_checklist(uuid) to service_role;

create or replace function public.daily_sync_posttraining_document_checklist_trigger() returns trigger language plpgsql security definer set search_path=public as $$ declare old_session uuid;new_session uuid;begin if tg_op<>'INSERT' then old_session:=public.daily_posttraining_document_session_id(old.document_type,old.linked_object_type,old.linked_object_id);end if;if tg_op<>'DELETE' then new_session:=public.daily_posttraining_document_session_id(new.document_type,new.linked_object_type,new.linked_object_id);end if;if old_session is not null then perform public.daily_sync_session_posttraining_checklist(old_session);end if;if new_session is not null and new_session is distinct from old_session then perform public.daily_sync_session_posttraining_checklist(new_session);end if;if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke execute on function public.daily_sync_posttraining_document_checklist_trigger() from public,anon,authenticated;grant execute on function public.daily_sync_posttraining_document_checklist_trigger() to service_role;
drop trigger if exists daily_documents_sync_posttraining_checklist on public.daily_documents;create trigger daily_documents_sync_posttraining_checklist after insert or update or delete on public.daily_documents for each row execute function public.daily_sync_posttraining_document_checklist_trigger();

create or replace function public.daily_sync_posttraining_attendance_checklist_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin if tg_op<>'INSERT' then perform public.daily_sync_session_posttraining_checklist(old.session_id);end if;if tg_op<>'DELETE' and (tg_op='INSERT' or new.session_id is distinct from old.session_id or new.status is distinct from old.status) then perform public.daily_sync_session_posttraining_checklist(new.session_id);end if;if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke execute on function public.daily_sync_posttraining_attendance_checklist_trigger() from public,anon,authenticated;grant execute on function public.daily_sync_posttraining_attendance_checklist_trigger() to service_role;
drop trigger if exists daily_attendance_records_sync_posttraining_checklist on public.daily_attendance_records;create trigger daily_attendance_records_sync_posttraining_checklist after insert or update or delete on public.daily_attendance_records for each row execute function public.daily_sync_posttraining_attendance_checklist_trigger();

create or replace function public.daily_sync_posttraining_enrolment_checklist_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin if tg_op<>'INSERT' then perform public.daily_sync_session_posttraining_checklist(old.session_id);end if;if tg_op<>'DELETE' and (tg_op='INSERT' or new.session_id is distinct from old.session_id or new.status is distinct from old.status) then perform public.daily_sync_session_posttraining_checklist(new.session_id);end if;if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke execute on function public.daily_sync_posttraining_enrolment_checklist_trigger() from public,anon,authenticated;grant execute on function public.daily_sync_posttraining_enrolment_checklist_trigger() to service_role;
drop trigger if exists daily_session_enrolments_sync_posttraining_checklist on public.daily_session_enrolments;create trigger daily_session_enrolments_sync_posttraining_checklist after insert or update or delete on public.daily_session_enrolments for each row execute function public.daily_sync_posttraining_enrolment_checklist_trigger();

create or replace function public.daily_sync_posttraining_slot_checklist_trigger() returns trigger language plpgsql security definer set search_path=public as $$ begin if tg_op<>'INSERT' then perform public.daily_sync_session_posttraining_checklist(old.session_id);end if;if tg_op<>'DELETE' and (tg_op='INSERT' or new.session_id is distinct from old.session_id or new.status is distinct from old.status) then perform public.daily_sync_session_posttraining_checklist(new.session_id);end if;if tg_op='DELETE' then return old;end if;return new;end;$$;
revoke execute on function public.daily_sync_posttraining_slot_checklist_trigger() from public,anon,authenticated;grant execute on function public.daily_sync_posttraining_slot_checklist_trigger() to service_role;
drop trigger if exists daily_attendance_slots_sync_posttraining_checklist on public.daily_attendance_slots;create trigger daily_attendance_slots_sync_posttraining_checklist after insert or update or delete on public.daily_attendance_slots for each row execute function public.daily_sync_posttraining_slot_checklist_trigger();

create policy "Session managers read Daily post-training documents" on public.daily_documents for select to authenticated using(document_type in ('attendance_summary','completion_certificate') and public.can_manage_daily_sessions(organisation_id));
