begin;

select plan(12);

select ok(
  (select proconfig @> array['search_path=""']
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_updated_at' and pg_get_function_identity_arguments(p.oid) = ''),
  'set_updated_at pins an empty search_path'
);

select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_updated_at_column' and pg_get_function_identity_arguments(p.oid)=''), 'update_updated_at_column pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_appointment_requests_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_appointment_requests_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_client_reminders_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_client_reminders_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_external_audits_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_external_audits_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='selion_set_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'selion_set_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_lil_invoice_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_lil_invoice_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_articles_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_articles_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_daily_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_daily_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_lil_billing_profiles_updated_at' and pg_get_function_identity_arguments(p.oid)=''), 'set_lil_billing_profiles_updated_at pins an empty search_path');
select ok((select proconfig @> array['search_path=""'] from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='daily_registration_response_summary' and pg_get_function_identity_arguments(p.oid)='p_session_id uuid'), 'daily_registration_response_summary pins an empty search_path');

select ok(
  public.daily_registration_response_summary('00000000-0000-0000-0000-000000000000'::uuid) ? 'response_count',
  'daily_registration_response_summary still executes with the hardened search_path'
);

select * from finish();
rollback;
