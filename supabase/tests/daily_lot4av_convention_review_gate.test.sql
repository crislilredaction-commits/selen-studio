begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_function(
  'public',
  'daily_guard_convention_after_registration_review',
  array[]::text[],
  'Convention review guard function exists'
);

select has_trigger(
  'public',
  'daily_conventions',
  'daily_conventions_require_registration_review',
  'Daily conventions are protected by the registration review trigger'
);

select ok(
  position('summary_validated' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0,
  'Convention guard requires the Selen registration summary to be validated'
);

select ok(
  position('prerequisites_validated' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0,
  'Convention guard checks prerequisites when the formation declares them'
);

select ok(
  position('signature_signed_at IS NOT NULL' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0
  or position('signature_signed_at is not null' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0,
  'Convention guard requires a signed registration file'
);

select ok(
  position('maintained' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0
  and position('adapted' in pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure)) > 0,
  'Convention guard only allows maintained or adapted review decisions'
);

select is(
  (select count(*)::integer from public.daily_conventions),
  0,
  'The convention review gate migration creates no convention business data'
);

select * from finish();
rollback;
