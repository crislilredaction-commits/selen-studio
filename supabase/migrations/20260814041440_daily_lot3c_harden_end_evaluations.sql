-- Selen Daily Lot 3C - tighten end-evaluation RLS and cover operational foreign keys.

create index if not exists daily_learning_assessments_org_idx
  on public.daily_learning_assessments(organisation_id, session_id);
create index if not exists daily_learning_assessments_enrolment_idx
  on public.daily_learning_assessments(enrolment_id);
create index if not exists daily_learning_assessments_assessed_by_idx
  on public.daily_learning_assessments(assessed_by) where assessed_by is not null;

create index if not exists daily_feedback_tokens_org_idx
  on public.daily_learner_feedback_tokens(organisation_id, session_id);
create index if not exists daily_feedback_tokens_enrolment_idx
  on public.daily_learner_feedback_tokens(enrolment_id);
create index if not exists daily_feedback_tokens_created_by_idx
  on public.daily_learner_feedback_tokens(created_by) where created_by is not null;

create index if not exists daily_feedback_responses_org_idx
  on public.daily_learner_feedback_responses(organisation_id, session_id);
create index if not exists daily_feedback_responses_enrolment_idx
  on public.daily_learner_feedback_responses(enrolment_id);

drop policy if exists "Selen staff manage Daily learning assessments" on public.daily_learning_assessments;
drop policy if exists "Session managers read Daily learning assessments" on public.daily_learning_assessments;
create policy "Authorised users read Daily learning assessments"
  on public.daily_learning_assessments for select to authenticated
  using (public.daily_is_selen_staff() or public.can_manage_daily_sessions(organisation_id));
create policy "Selen staff insert Daily learning assessments"
  on public.daily_learning_assessments for insert to authenticated
  with check (public.daily_is_selen_staff());
create policy "Selen staff update Daily learning assessments"
  on public.daily_learning_assessments for update to authenticated
  using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Selen staff delete Daily learning assessments"
  on public.daily_learning_assessments for delete to authenticated
  using (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage Daily feedback tokens" on public.daily_learner_feedback_tokens;
drop policy if exists "Session managers read Daily feedback tokens" on public.daily_learner_feedback_tokens;
create policy "Authorised users read Daily feedback tokens"
  on public.daily_learner_feedback_tokens for select to authenticated
  using (public.daily_is_selen_staff() or public.can_manage_daily_sessions(organisation_id));
create policy "Selen staff insert Daily feedback tokens"
  on public.daily_learner_feedback_tokens for insert to authenticated
  with check (public.daily_is_selen_staff());
create policy "Selen staff update Daily feedback tokens"
  on public.daily_learner_feedback_tokens for update to authenticated
  using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Selen staff delete Daily feedback tokens"
  on public.daily_learner_feedback_tokens for delete to authenticated
  using (public.daily_is_selen_staff());

drop policy if exists "Selen staff manage Daily feedback responses" on public.daily_learner_feedback_responses;
drop policy if exists "Session managers read Daily feedback responses" on public.daily_learner_feedback_responses;
create policy "Authorised users read Daily feedback responses"
  on public.daily_learner_feedback_responses for select to authenticated
  using (public.daily_is_selen_staff() or public.can_manage_daily_sessions(organisation_id));
create policy "Selen staff insert Daily feedback responses"
  on public.daily_learner_feedback_responses for insert to authenticated
  with check (public.daily_is_selen_staff());
create policy "Selen staff update Daily feedback responses"
  on public.daily_learner_feedback_responses for update to authenticated
  using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Selen staff delete Daily feedback responses"
  on public.daily_learner_feedback_responses for delete to authenticated
  using (public.daily_is_selen_staff());
