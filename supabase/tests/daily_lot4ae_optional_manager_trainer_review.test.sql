begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='manager_appreciation'),
  'Annual reviews support an optional manager appreciation'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='manager_improvement_areas'),
  'Annual reviews support optional manager improvement areas'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='manager_actions'),
  'Annual reviews support optional manager actions'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='manager_completed_at'),
  'Annual reviews track manager contribution time when present'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='daily_trainer_annual_reviews' and column_name='manager_completed_by'),
  'Annual reviews track the manager who saved a contribution'
);

select is(
  (select relrowsecurity from pg_class where oid='public.daily_trainer_annual_reviews'::regclass),
  true,
  'RLS remains enabled on annual trainer reviews'
);
select ok(
  not has_table_privilege('anon', 'public.daily_trainer_annual_reviews', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.daily_trainer_annual_reviews', 'SELECT,INSERT,UPDATE,DELETE'),
  'Client roles still have no direct DML privileges on annual trainer reviews'
);
select is(
  (select count(*)::integer from public.daily_trainer_annual_reviews),
  0,
  'The additive manager contribution migration created no business data'
);

select * from finish();
rollback;
