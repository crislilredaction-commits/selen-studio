begin;

select plan(8);

select ok(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'audit_blanc_client_summary'
      and c.relkind = 'v'
      and coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true']
  ),
  'audit_blanc_client_summary is security_invoker'
);

select ok(
  has_table_privilege('authenticated', 'public.audit_blanc_client_summary', 'SELECT'),
  'authenticated keeps SELECT on audit_blanc_client_summary'
);

select ok(
  not has_table_privilege('anon', 'public.audit_blanc_client_summary', 'SELECT'),
  'anon cannot SELECT audit_blanc_client_summary'
);

select ok(
  not has_table_privilege('anon', 'public.audit_blanc_client_summary', 'INSERT'),
  'anon cannot INSERT into audit_blanc_client_summary'
);

select ok(
  not has_table_privilege('anon', 'public.audit_blanc_client_summary', 'UPDATE'),
  'anon cannot UPDATE audit_blanc_client_summary'
);

select ok(
  not has_table_privilege('anon', 'public.audit_blanc_client_summary', 'DELETE'),
  'anon cannot DELETE from audit_blanc_client_summary'
);

select ok(
  not has_table_privilege('authenticated', 'public.audit_blanc_client_summary', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated has no write or structural privileges on audit_blanc_client_summary'
);

select ok(
  (select relrowsecurity
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'audit_blanc_cases'),
  'audit_blanc_cases backing table keeps RLS enabled'
);

select * from finish();
rollback;
