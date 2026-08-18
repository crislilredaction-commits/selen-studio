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

select like(
  pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure),
  '%summary_validated%',
  'Convention guard requires the Selen registration summary to be validated'
);

select like(
  pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure),
  '%prerequisites_validated%',
  'Convention guard checks prerequisites when the formation declares them'
);

select like(
  pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure),
  '%signature_signed_at is not null%',
  'Convention guard requires a signed registration file'
);

select like(
  pg_get_functiondef('public.daily_guard_convention_after_registration_review()'::regprocedure),
  '%maintained%adapted%',
  'Convention guard only allows maintained or adapted review decisions'
);

select is(
  (select count(*)::integer from public.daily_conventions),
  0,
  'The convention review gate migration creates no convention business data'
);

select * from finish();
rollback;
