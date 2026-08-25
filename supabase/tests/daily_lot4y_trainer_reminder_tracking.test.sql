begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_profiles' and column_name='cv_last_reminder_at'
  ),
  'Trainer profiles track the latest CV reminder'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_profiles' and column_name='cv_reminder_count'
  ),
  'Trainer profiles track the CV reminder count'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_profiles' and column_name='cv_next_reminder_at'
  ),
  'Trainer profiles track the next CV reminder time'
);
select is(
  (
    select column_default::text
    from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_profiles' and column_name='cv_reminder_count'
  ),
  '0'::text,
  'CV reminder count defaults to zero'
);
select is(
  (
    select is_nullable::text
    from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_profiles' and column_name='cv_reminder_count'
  ),
  'NO'::text,
  'CV reminder count cannot be null'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid='public.daily_trainer_profiles'::regclass
      and conname='daily_trainer_profiles_cv_reminder_count_check'
  ),
  'CV reminder count cannot be negative'
);
select ok(
  to_regclass('public.daily_trainer_profiles_cv_reminder_due_idx') is not null,
  'Due CV reminders are indexed'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='next_reminder_at'
  ),
  'Annual review reminder scheduling remains available'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='reminder_count'
  ),
  'Annual review reminder count remains available'
);

select * from finish();
rollback;
