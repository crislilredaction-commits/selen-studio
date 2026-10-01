begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select ok(
  to_regclass('public.daily_trainer_annual_reviews') is not null,
  'Annual trainer review registry exists'
);
select ok(
  to_regclass('public.daily_trainer_annual_review_trainings') is not null,
  'Annual trainer review training registry exists'
);

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_trainer_profiles'
      and column_name = 'cv_updated_at'
  ),
  'Trainer profiles track the last CV update'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'daily_trainer_profiles'
      and column_name = 'cv_review_due_at'
  ),
  'Trainer profiles track the next CV review due date'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_trainer_annual_reviews'::regclass),
  true,
  'RLS is enabled on annual trainer reviews'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_trainer_annual_review_trainings'::regclass),
  true,
  'RLS is enabled on annual review trainings'
);

select ok(
  not has_table_privilege('anon', 'public.daily_trainer_annual_reviews', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.daily_trainer_annual_reviews', 'SELECT,INSERT,UPDATE,DELETE'),
  'client roles have no direct DML privilege on annual trainer reviews'
);
select ok(
  not has_table_privilege('anon', 'public.daily_trainer_annual_review_trainings', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.daily_trainer_annual_review_trainings', 'SELECT,INSERT,UPDATE,DELETE'),
  'client roles have no direct DML privilege on annual review trainings'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_trainer_annual_reviews'
      and policyname = 'service role manages trainer annual reviews'
      and cmd = 'ALL'
      and roles = array['service_role']::name[]
  ),
  1,
  'Annual reviews use the explicit service-role policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_trainer_annual_review_trainings'
      and policyname = 'service role manages trainer annual review trainings'
      and cmd = 'ALL'
      and roles = array['service_role']::name[]
  ),
  1,
  'Annual review trainings use the explicit service-role policy'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_trainer_annual_reviews'::regclass
      and conname = 'daily_trainer_annual_reviews_unique_year'
  ),
  'A trainer can have only one annual review per year'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_trainer_annual_reviews'::regclass
      and conname = 'daily_trainer_annual_reviews_submission_check'
  ),
  'Submitted annual reviews require a submission timestamp'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_trainer_annual_review_trainings'::regclass
      and conname = 'daily_trainer_annual_review_trainings_kind_check'
  ),
  'Annual review trainings distinguish completed and planned training'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_trainer_annual_review_trainings'::regclass
      and conname = 'daily_trainer_annual_review_trainings_completion_check'
  ),
  'Completed training requires a completion date'
);

select * from finish();
rollback;
