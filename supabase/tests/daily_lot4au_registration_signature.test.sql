begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public' and table_name='daily_registration_responses'
     and column_name in ('signature_consent_text','signature_data','signature_proof_hash','signature_signed_at','signature_ip_address','signature_user_agent')),
  6,
  'Session registration responses expose the six signature proof fields'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema='public' and table_name='daily_formation_registration_requests'
     and column_name in ('signature_consent_text','signature_data','signature_proof_hash','signature_signed_at','signature_ip_address','signature_user_agent')),
  6,
  'Formation registration requests expose the six signature proof fields'
);
select is(
  (select data_type from information_schema.columns where table_schema='public' and table_name='daily_registration_responses' and column_name='signature_signed_at'),
  'timestamp with time zone',
  'Session registration signature timestamp is timezone-aware'
);
select is(
  (select data_type from information_schema.columns where table_schema='public' and table_name='daily_formation_registration_requests' and column_name='signature_signed_at'),
  'timestamp with time zone',
  'Formation registration signature timestamp is timezone-aware'
);
select is(
  (select relrowsecurity from pg_class where oid='public.daily_registration_responses'::regclass),
  true,
  'RLS remains enabled on session registration responses'
);
select is(
  (select relrowsecurity from pg_class where oid='public.daily_formation_registration_requests'::regclass),
  true,
  'RLS remains enabled on formation registration requests'
);
select is((select count(*)::integer from public.daily_registration_responses), 0,
  'The signature migration creates no session registration business data');
select is((select count(*)::integer from public.daily_formation_registration_requests), 0,
  'The signature migration creates no formation registration business data');

select * from finish();
rollback;
