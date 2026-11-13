-- Daily Lot 4U — annual trainer review foundation
-- Additive only. No existing rows are modified beyond nullable/defaulted columns.

alter table public.daily_trainer_profiles
  add column if not exists cv_updated_at timestamptz,
  add column if not exists cv_review_due_at timestamptz;

create table if not exists public.daily_trainer_annual_reviews (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete cascade,
  review_year integer not null,
  status text not null default 'draft',
  strengths text,
  weaknesses text,
  improvement_areas text,
  proposed_solutions text,
  submitted_at timestamptz,
  manager_notified_at timestamptz,
  last_reminder_at timestamptz,
  reminder_count integer not null default 0,
  next_reminder_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_annual_reviews_year_check check (review_year between 2020 and 2100),
  constraint daily_trainer_annual_reviews_status_check check (status in ('draft', 'submitted')),
  constraint daily_trainer_annual_reviews_reminder_count_check check (reminder_count >= 0),
  constraint daily_trainer_annual_reviews_unique_year unique (trainer_profile_id, review_year),
  constraint daily_trainer_annual_reviews_submission_check check (
    (status = 'draft' and submitted_at is null)
    or (status = 'submitted' and submitted_at is not null)
  )
);

create index if not exists daily_trainer_annual_reviews_status_idx
  on public.daily_trainer_annual_reviews (status, next_reminder_at);

create index if not exists daily_trainer_annual_reviews_trainer_idx
  on public.daily_trainer_annual_reviews (trainer_profile_id, review_year desc);

create table if not exists public.daily_trainer_annual_review_trainings (
  id uuid primary key default gen_random_uuid(),
  annual_review_id uuid not null references public.daily_trainer_annual_reviews(id) on delete cascade,
  training_kind text not null,
  title text not null,
  provider text,
  completed_on date,
  attestation_document_id uuid references public.daily_documents(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_annual_review_trainings_kind_check check (training_kind in ('completed', 'planned')),
  constraint daily_trainer_annual_review_trainings_completion_check check (
    training_kind <> 'completed' or completed_on is not null
  )
);

create index if not exists daily_trainer_annual_review_trainings_review_idx
  on public.daily_trainer_annual_review_trainings (annual_review_id, training_kind, created_at);

alter table public.daily_trainer_annual_reviews enable row level security;
alter table public.daily_trainer_annual_review_trainings enable row level security;

revoke all on table public.daily_trainer_annual_reviews from anon, authenticated;
revoke all on table public.daily_trainer_annual_review_trainings from anon, authenticated;

grant select, insert, update, delete on table public.daily_trainer_annual_reviews to service_role;
grant select, insert, update, delete on table public.daily_trainer_annual_review_trainings to service_role;

drop policy if exists "service role manages trainer annual reviews" on public.daily_trainer_annual_reviews;
create policy "service role manages trainer annual reviews"
  on public.daily_trainer_annual_reviews
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "service role manages trainer annual review trainings" on public.daily_trainer_annual_review_trainings;
create policy "service role manages trainer annual review trainings"
  on public.daily_trainer_annual_review_trainings
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.daily_trainer_annual_reviews is
  'Annual mandatory trainer self-assessments for Daily: strengths, weaknesses, improvement areas, solutions and reminder/manager-notification tracking.';
comment on table public.daily_trainer_annual_review_trainings is
  'Training completed or planned from a trainer annual self-assessment. Completed training can reference its attestation in daily_documents.';
