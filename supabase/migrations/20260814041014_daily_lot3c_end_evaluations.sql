-- Selen Daily Lot 3C - end-of-training learning assessment and learner feedback.

create table public.daily_learning_assessments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  outcome text not null default 'pending' check (outcome in ('pending','achieved','partially_achieved','not_achieved','not_applicable')),
  score numeric(6,2),
  score_max numeric(6,2),
  method text,
  notes text,
  assessed_by uuid references auth.users(id) on delete set null,
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,enrolment_id),
  check ((score is null and score_max is null) or (score is not null and score_max is not null and score_max > 0 and score >= 0 and score <= score_max))
);

create table public.daily_learner_feedback_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Fa-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active','submitted','revoked','expired')),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.daily_learner_feedback_responses (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  objectives_rating smallint not null check (objectives_rating between 1 and 5),
  trainer_rating smallint check (trainer_rating between 1 and 5),
  organisation_rating smallint check (organisation_rating between 1 and 5),
  content_rating smallint check (content_rating between 1 and 5),
  pace_rating smallint check (pace_rating between 1 and 5),
  would_recommend boolean,
  strengths text,
  improvements text,
  adaptation_feedback text,
  free_comment text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(session_id,enrolment_id)
);

create index daily_learning_assessments_session_idx on public.daily_learning_assessments(session_id,outcome);
create index daily_feedback_tokens_session_idx on public.daily_learner_feedback_tokens(session_id,status,expires_at);
create index daily_feedback_responses_session_idx on public.daily_learner_feedback_responses(session_id,submitted_at desc);

alter table public.daily_learning_assessments enable row level security;
alter table public.daily_learner_feedback_tokens enable row level security;
alter table public.daily_learner_feedback_responses enable row level security;

create policy "Selen staff manage Daily learning assessments" on public.daily_learning_assessments for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Session managers read Daily learning assessments" on public.daily_learning_assessments for select to authenticated
using (public.can_manage_daily_sessions(organisation_id));

create policy "Selen staff manage Daily feedback tokens" on public.daily_learner_feedback_tokens for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Session managers read Daily feedback tokens" on public.daily_learner_feedback_tokens for select to authenticated
using (public.can_manage_daily_sessions(organisation_id));

create policy "Selen staff manage Daily feedback responses" on public.daily_learner_feedback_responses for all to authenticated
using (public.daily_is_selen_staff()) with check (public.daily_is_selen_staff());
create policy "Session managers read Daily feedback responses" on public.daily_learner_feedback_responses for select to authenticated
using (public.can_manage_daily_sessions(organisation_id));

revoke all on public.daily_learning_assessments,public.daily_learner_feedback_tokens,public.daily_learner_feedback_responses from anon,authenticated;
grant select on public.daily_learning_assessments,public.daily_learner_feedback_tokens,public.daily_learner_feedback_responses to authenticated;
grant all on public.daily_learning_assessments,public.daily_learner_feedback_tokens,public.daily_learner_feedback_responses to service_role;
