-- Daily Lot 4AE — optional manager contribution to annual trainer reviews
-- Additive only. Manager content is optional and must be omitted from generated documents when left empty.

alter table public.daily_trainer_annual_reviews
  add column if not exists manager_appreciation text,
  add column if not exists manager_improvement_areas text,
  add column if not exists manager_actions text,
  add column if not exists manager_completed_at timestamptz,
  add column if not exists manager_completed_by uuid references auth.users(id) on delete set null;

comment on column public.daily_trainer_annual_reviews.manager_appreciation is
  'Optional manager appreciation added after the trainer annual self-assessment. Omitted from generated documents when empty.';
comment on column public.daily_trainer_annual_reviews.manager_improvement_areas is
  'Optional manager adjustments or confirmation of improvement areas. Omitted from generated documents when empty.';
comment on column public.daily_trainer_annual_reviews.manager_actions is
  'Optional actions decided or proposed by the manager. Omitted from generated documents when empty.';
comment on column public.daily_trainer_annual_reviews.manager_completed_at is
  'Timestamp of the latest non-empty manager contribution.';
comment on column public.daily_trainer_annual_reviews.manager_completed_by is
  'Authenticated user who last saved a non-empty manager contribution.';
