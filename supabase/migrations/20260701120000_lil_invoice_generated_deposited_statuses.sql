alter table public.lil_invoices
  add column if not exists deposited_at timestamptz;

update public.lil_invoices
set status = 'generated'
where status = 'issued';

update public.lil_invoices
set status = 'deposited',
    deposited_at = coalesce(deposited_at, sent_at, email_sent_at, issued_at)
where status = 'sent';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lil_invoices_status_check'
      and conrelid = 'public.lil_invoices'::regclass
  ) then
    alter table public.lil_invoices
      drop constraint lil_invoices_status_check;
  end if;

  alter table public.lil_invoices
    add constraint lil_invoices_status_check
    check (status in ('draft', 'generated', 'deposited', 'paid', 'cancelled'));
end;
$$;

create index if not exists lil_invoices_deposited_at_idx
  on public.lil_invoices (deposited_at desc)
  where deposited_at is not null;
