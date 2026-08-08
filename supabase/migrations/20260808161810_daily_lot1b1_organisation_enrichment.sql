-- Selen Daily Lot 1B.1 - additive organisation enrichment and safe manager updates.
-- Existing organisation rows are not backfilled or rewritten.

alter table public.organisations
  add column if not exists legal_name text,
  add column if not exists legal_form text,
  add column if not exists vat_number text,
  add column if not exists administrative_email text,
  add column if not exists administrative_phone text,
  add column if not exists administrative_address text,
  add column if not exists legal_representative_name text,
  add column if not exists legal_representative_email text,
  add column if not exists qualiopi_status text not null default 'unknown',
  add column if not exists qualiopi_valid_from date,
  add column if not exists qualiopi_valid_until date,
  add column if not exists qualiopi_categories text[] not null default '{}'::text[],
  add column if not exists nda_status text not null default 'unknown',
  add column if not exists nda_declared_at date,
  add column if not exists selen_validated_at timestamptz,
  add column if not exists selen_validated_by uuid references auth.users(id) on delete set null;

alter table public.organisations
  drop constraint if exists organisations_administrative_email_check,
  add constraint organisations_administrative_email_check
    check (administrative_email is null or administrative_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  drop constraint if exists organisations_legal_representative_email_check,
  add constraint organisations_legal_representative_email_check
    check (legal_representative_email is null or legal_representative_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  drop constraint if exists organisations_qualiopi_status_check,
  add constraint organisations_qualiopi_status_check
    check (qualiopi_status in ('unknown', 'not_applicable', 'not_certified', 'certified', 'suspended', 'expired')),
  drop constraint if exists organisations_qualiopi_dates_check,
  add constraint organisations_qualiopi_dates_check
    check (qualiopi_valid_until is null or qualiopi_valid_from is null or qualiopi_valid_until >= qualiopi_valid_from),
  drop constraint if exists organisations_nda_status_check,
  add constraint organisations_nda_status_check
    check (nda_status in ('unknown', 'not_declared', 'pending', 'registered', 'refused', 'inactive'));

create or replace function public.prevent_unsafe_daily_organisation_update()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('postgres', 'service_role') or public.daily_is_selen_staff() then
    return new;
  end if;

  if new.id is distinct from old.id
    or new.name is distinct from old.name
    or new.company_name is distinct from old.company_name
    or new.siret is distinct from old.siret
    or new.nda_number is distinct from old.nda_number
    or new.status is distinct from old.status
    or new.archived_at is distinct from old.archived_at
    or new.client_notifications_paused is distinct from old.client_notifications_paused
    or new.legal_name is distinct from old.legal_name
    or new.legal_form is distinct from old.legal_form
    or new.vat_number is distinct from old.vat_number
    or new.legal_representative_name is distinct from old.legal_representative_name
    or new.legal_representative_email is distinct from old.legal_representative_email
    or new.qualiopi_status is distinct from old.qualiopi_status
    or new.qualiopi_valid_from is distinct from old.qualiopi_valid_from
    or new.qualiopi_valid_until is distinct from old.qualiopi_valid_until
    or new.qualiopi_categories is distinct from old.qualiopi_categories
    or new.nda_status is distinct from old.nda_status
    or new.nda_declared_at is distinct from old.nda_declared_at
    or new.selen_validated_at is distinct from old.selen_validated_at
    or new.selen_validated_by is distinct from old.selen_validated_by
  then
    raise exception 'sensitive organisation fields require Selen review';
  end if;

  return new;
end;
$$;

revoke execute on function public.prevent_unsafe_daily_organisation_update()
  from public, anon, authenticated;
grant execute on function public.prevent_unsafe_daily_organisation_update()
  to service_role;

drop trigger if exists organisations_prevent_unsafe_daily_update on public.organisations;
create trigger organisations_prevent_unsafe_daily_update
before update on public.organisations
for each row execute function public.prevent_unsafe_daily_organisation_update();

comment on function public.prevent_unsafe_daily_organisation_update() is
  'Daily Lot 1B.1: managers may directly update only administrative contact fields; sensitive legal/NDA/Qualiopi/Selen fields require a reviewed change request.';
