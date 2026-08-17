begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  to_regclass('public.daily_stakeholder_feedback') is not null,
  'Stakeholder feedback registry exists'
);
select is(
  (select relrowsecurity from pg_class where oid='public.daily_stakeholder_feedback'::regclass),
  true,
  'RLS is enabled on stakeholder feedback'
);
select ok(
  not has_table_privilege('anon', 'public.daily_stakeholder_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'Anon has no direct DML privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.daily_stakeholder_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'Authenticated has no direct DML privileges'
);
select ok(
  has_table_privilege('service_role', 'public.daily_stakeholder_feedback', 'SELECT,INSERT,UPDATE,DELETE'),
  'Service role can manage the private Selen workflow'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='daily_stakeholder_feedback'
      and policyname='daily_stakeholder_feedback_service_role_all'
  ),
  'Explicit service-role policy exists'
);
select is(
  (select prosecdef from pg_proc where oid='public.validate_daily_stakeholder_feedback_scope()'::regprocedure),
  false,
  'Scope validator is SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'public.validate_daily_stakeholder_feedback_scope()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.validate_daily_stakeholder_feedback_scope()', 'EXECUTE'),
  'Client roles cannot call the internal scope validator'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid='public.daily_stakeholder_feedback'::regclass
      and conname='daily_stakeholder_feedback_forward_state_check'
  ),
  'Forwarding requires a prior Selen review'
);
select is(
  (select count(*)::integer from public.daily_stakeholder_feedback),
  0,
  'Foundation creates no business data'
);

select * from finish();
rollback;