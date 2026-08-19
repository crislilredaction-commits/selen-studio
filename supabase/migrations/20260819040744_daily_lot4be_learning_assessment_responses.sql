create table if not exists public.daily_learning_assessment_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  formation_id uuid not null references public.daily_formations(id) on delete restrict,
  question_snapshot jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  auto_score numeric,
  score_max numeric,
  requires_manual_review boolean not null default false,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_learning_assessment_responses_unique_enrolment unique (session_id, enrolment_id),
  constraint daily_learning_assessment_responses_questions_array check (jsonb_typeof(question_snapshot) = 'array'),
  constraint daily_learning_assessment_responses_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint daily_learning_assessment_responses_score_pair check (
    (auto_score is null and score_max is null)
    or (auto_score is not null and score_max is not null and auto_score >= 0 and score_max >= 0 and auto_score <= score_max)
  )
);

create index if not exists daily_learning_assessment_responses_org_session_idx
  on public.daily_learning_assessment_responses (organisation_id, session_id);

alter table public.daily_learning_assessment_responses enable row level security;

revoke all on table public.daily_learning_assessment_responses from anon, authenticated;
grant select, insert, update, delete on table public.daily_learning_assessment_responses to service_role;

drop policy if exists "service_role manages daily learning assessment responses" on public.daily_learning_assessment_responses;
create policy "service_role manages daily learning assessment responses"
  on public.daily_learning_assessment_responses
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.daily_learning_assessment_responses is
  'V1: snapshot and learner answers for Selen-hosted end-of-training assessments. Portal access remains server-mediated.';
