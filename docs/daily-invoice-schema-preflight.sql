-- Read-only preflight for Selen Daily invoicing.
-- Safe to execute against Studio production; never creates, changes or numbers invoices.
-- Run BEFORE applying either 20261118 Daily migration in a separate sandbox.
select
  to_regclass('public.lil_invoices') is not null as invoices_table_exists,
  to_regclass('public.lil_invoice_sequence') is not null as shared_sequence_exists,
  to_regprocedure('public.next_lil_invoice_number()') is not null as shared_allocator_exists,
  to_regclass('public.lil_daily_invoice_links') is not null as daily_ledger_already_exists;

select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'lil_invoices'
  and column_name in (
    'id', 'invoice_number', 'sequence_number', 'invoice_date',
    'recipient_name', 'recipient_email', 'recipient_address',
    'invoice_type', 'status', 'currency', 'subtotal_cents',
    'tax_cents', 'total_cents', 'lines', 'metadata', 'issued_at', 'paid_at'
  )
order by column_name;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = to_regclass('public.lil_invoices')
  and contype = 'c'
order by conname;

select
  has_function_privilege('anon', 'public.next_lil_invoice_number()', 'EXECUTE') as anon_can_allocate,
  has_function_privilege('authenticated', 'public.next_lil_invoice_number()', 'EXECUTE') as authenticated_can_allocate;

-- A separate, dedicated sandbox is required for transaction/replay tests.
-- Do NOT run the issuance RPC here.
