begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  to_regclass('public.daily_communications') is not null,
  'Daily communication registry exists'
);
select ok(
  to_regclass('public.daily_communication_documents') is not null,
  'Daily communication document snapshots exist'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_communications'::regclass),
  true,
  'RLS is enabled on Daily communications'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.daily_communication_documents'::regclass),
  true,
  'RLS is enabled on Daily communication documents'
);

select ok(
  not has_table_privilege('anon', 'public.daily_communications', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.daily_communications', 'SELECT,INSERT,UPDATE,DELETE'),
  'client roles have no direct DML privilege on Daily communications'
);
select ok(
  not has_table_privilege('anon', 'public.daily_communication_documents', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.daily_communication_documents', 'SELECT,INSERT,UPDATE,DELETE'),
  'client roles have no direct DML privilege on Daily communication documents'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_communications'
      and policyname = 'Service role manages Daily communications'
      and cmd = 'ALL'
      and roles = array['service_role']::name[]
  ),
  1,
  'Daily communications are managed only through the explicit service-role policy'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_communication_documents'
      and policyname = 'Service role manages Daily communication documents'
      and cmd = 'ALL'
      and roles = array['service_role']::name[]
  ),
  1,
  'Daily communication documents are managed only through the explicit service-role policy'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_communications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%channel%email%'
  ),
  'communication channel remains constrained to email in V1'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_communications'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%queued%sent%delivered%bounced%failed%'
  ),
  'communication status remains constrained to the evidence lifecycle'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_communications'::regclass
      and conname = 'daily_communications_sent_state'
  ),
  'sent-state consistency constraint remains present'
);
select ok(
  to_regclass('public.daily_communications_provider_message_uidx') is not null,
  'provider message identifiers remain unique when present'
);

select * from finish();
rollback;
