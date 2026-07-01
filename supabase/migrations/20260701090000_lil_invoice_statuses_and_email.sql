alter table public.lil_invoices
  add column if not exists sent_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists email_sent_at timestamptz;

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
    check (status in ('draft', 'issued', 'sent', 'paid', 'cancelled'));
end;
$$;

create index if not exists lil_invoices_sent_at_idx
  on public.lil_invoices (sent_at desc)
  where sent_at is not null;

create index if not exists lil_invoices_paid_at_idx
  on public.lil_invoices (paid_at desc)
  where paid_at is not null;
