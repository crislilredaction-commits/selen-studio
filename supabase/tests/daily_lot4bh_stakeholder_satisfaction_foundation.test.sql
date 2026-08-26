begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  to_regclass('public.daily_stakeholder_satisfaction_responses') is not null,
  'Stakeholder satisfaction registry exists'
);
select is(
  (select relrowsecurity from pg_class where oid='public.daily_stakeholder_satisfaction_responses'::regclass),
  true,
  'RLS is enabled on stakeholder satisfaction'
);
select ok(
  not has_table_privilege('anon', 'public.daily_stakeholder_satisfaction_responses', 'SELECT,INSERT,UPDATE,DELETE'),
  'Anon has no direct DML privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.daily_stakeholder_satisfaction_responses', 'SELECT,INSERT,UPDATE,DELETE'),
  'Authenticated has no direct DML privileges'
);
select ok(
  has_table_privilege('service_role', 'public.daily_stakeholder_satisfaction_responses', 'SELECT,INSERT,UPDATE,DELETE'),
  'Service role can manage stakeholder satisfaction responses'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname='public'
      and tablename='daily_stakeholder_satisfaction_responses'
      and policyname='daily_stakeholder_satisfaction_service_role_all'
  ),
  'Explicit service-role policy exists'
);
select is(
  (select prosecdef from pg_proc where oid='public.daily_guard_stakeholder_satisfaction_scope()'::regprocedure),
  false,
  'Scope validator is SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'public.daily_guard_stakeholder_satisfaction_scope()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.daily_guard_stakeholder_satisfaction_scope()', 'EXECUTE'),
  'Client roles cannot call the internal scope validator'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid='public.daily_stakeholder_satisfaction_responses'::regclass
      and pg_get_constraintdef(oid) like '%stakeholder_type%'
  ),
  'Stakeholder type is constrained'
);
select is(
  (select count(*)::integer from public.daily_stakeholder_satisfaction_responses),
  0,
  'Foundation creates no business data'
);

select * from finish();
rollback;
