do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'external_audits_status_check'
      and conrelid = 'public.external_audits'::regclass
  ) then
    alter table public.external_audits
      drop constraint external_audits_status_check;
  end if;

  alter table public.external_audits
    add constraint external_audits_status_check
    check (status in ('planned', 'confirmed', 'completed', 'to_invoice', 'cancelled'));
end;
$$;

create index if not exists external_audits_to_invoice_due_idx
  on public.external_audits (audit_date, status)
  where status in ('planned', 'confirmed', 'completed');

create index if not exists external_audits_metadata_archived_idx
  on public.external_audits ((metadata ->> 'archived'));
