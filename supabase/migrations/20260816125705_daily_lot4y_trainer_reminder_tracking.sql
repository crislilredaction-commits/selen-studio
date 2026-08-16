-- Daily Lot 4Y — annual trainer reminder tracking
-- Additive only. Extends the existing annual-review foundation without sending reminders.

alter table public.daily_trainer_profiles
  add column if not exists cv_last_reminder_at timestamptz,
  add column if not exists cv_reminder_count integer not null default 0,
  add column if not exists cv_next_reminder_at timestamptz,
  add constraint daily_trainer_profiles_cv_reminder_count_check
    check (cv_reminder_count >= 0);

create index if not exists daily_trainer_profiles_cv_reminder_due_idx
  on public.daily_trainer_profiles (cv_next_reminder_at)
  where cv_next_reminder_at is not null;

comment on column public.daily_trainer_profiles.cv_last_reminder_at is
  'Timestamp of the latest annual CV refresh reminder sent to this trainer.';
comment on column public.daily_trainer_profiles.cv_reminder_count is
  'Number of annual CV refresh reminders recorded for the current due cycle.';
comment on column public.daily_trainer_profiles.cv_next_reminder_at is
  'Next eligible reminder timestamp for the annual CV refresh workflow. Scheduling is handled separately.';
