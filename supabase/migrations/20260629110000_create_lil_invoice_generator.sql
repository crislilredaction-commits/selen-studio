create table if not exists public.lil_invoice_settings (
  id boolean primary key default true,
  business_name text not null default 'Pascale Barthaux',
  activity text not null default 'Auditrice Qualiopi',
  address text,
  siren_siret text,
  rcs_rm_exemption text,
  phone text,
  email text not null default 'hello@selen-editions.fr',
  paypal_email text,
  iban text,
  bic text,
  vat_status text not null default 'TVA non applicable, art. 293 B du CGI',
  late_penalty_rate text not null default 'Taux legal en vigueur',
  recovery_fee_cents integer not null default 4000,
  payment_terms text not null default 'Paiement a reception de facture',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lil_invoice_settings_singleton check (id = true),
  constraint lil_invoice_settings_recovery_fee_check check (recovery_fee_cents >= 0)
);

insert into public.lil_invoice_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.lil_invoice_sequence (
  id boolean primary key default true,
  last_number integer not null default 415,
  updated_at timestamptz not null default now(),
  constraint lil_invoice_sequence_singleton check (id = true),
  constraint lil_invoice_sequence_min_check check (last_number >= 415)
);

insert into public.lil_invoice_sequence (id, last_number)
values (true, 415)
on conflict (id) do nothing;

create table if not exists public.lil_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text unique,
  sequence_number integer unique,
  invoice_date date not null default current_date,
  recipient_name text not null,
  recipient_address text,
  recipient_email text,
  invoice_type text not null default 'certifopac_single_audit',
  status text not null default 'draft',
  currency text not null default 'eur',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  pdf_bucket text,
  pdf_path text,
  pdf_url text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  created_by_email text,
  updated_by_email text,
  lines jsonb not null default '[]'::jsonb,
  linked_audit_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lil_invoices_status_check check (
    status in ('draft', 'issued', 'cancelled')
  ),
  constraint lil_invoices_type_check check (
    invoice_type in ('certifopac_single_audit', 'icpf_monthly', 'manual')
  ),
  constraint lil_invoices_amounts_check check (
    subtotal_cents >= 0 and tax_cents >= 0 and total_cents >= 0
  )
);

create index if not exists lil_invoices_invoice_date_idx
  on public.lil_invoices (invoice_date desc);

create index if not exists lil_invoices_status_idx
  on public.lil_invoices (status);

create index if not exists lil_invoices_type_idx
  on public.lil_invoices (invoice_type);

create or replace function public.set_lil_invoice_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_lil_invoice_settings_updated_at on public.lil_invoice_settings;
create trigger trg_lil_invoice_settings_updated_at
before update on public.lil_invoice_settings
for each row
execute function public.set_lil_invoice_updated_at();

drop trigger if exists trg_lil_invoices_updated_at on public.lil_invoices;
create trigger trg_lil_invoices_updated_at
before update on public.lil_invoices
for each row
execute function public.set_lil_invoice_updated_at();

create or replace function public.next_lil_invoice_number()
returns table(sequence_number integer, invoice_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  insert into public.lil_invoice_sequence (id, last_number)
  values (true, 415)
  on conflict (id) do nothing;

  update public.lil_invoice_sequence
  set last_number = last_number + 1,
      updated_at = now()
  where id = true
  returning last_number into next_number;

  sequence_number := next_number;
  invoice_number := 'F' || lpad(next_number::text, 6, '0');
  return next;
end;
$$;

alter table public.lil_invoice_settings enable row level security;
alter table public.lil_invoice_sequence enable row level security;
alter table public.lil_invoices enable row level security;

drop policy if exists "Lil owner can manage invoice settings" on public.lil_invoice_settings;
create policy "Lil owner can manage invoice settings"
on public.lil_invoice_settings
for all
to authenticated
using (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr')
with check (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');

drop policy if exists "Lil owner can read invoice sequence" on public.lil_invoice_sequence;
create policy "Lil owner can read invoice sequence"
on public.lil_invoice_sequence
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');

drop policy if exists "Lil owner can manage invoices" on public.lil_invoices;
create policy "Lil owner can manage invoices"
on public.lil_invoices
for all
to authenticated
using (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr')
with check (lower(auth.jwt() ->> 'email') = 'hello@selen-editions.fr');
