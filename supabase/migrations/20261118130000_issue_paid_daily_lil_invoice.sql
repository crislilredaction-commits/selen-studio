-- Atomic Stripe -> canonical Lil invoice issuance.
-- IMPORTANT: reviewed/tested migration only; never deploy to production without
-- confirming Stripe tax, service periods, and billing identity.
create or replace function public.issue_paid_daily_lil_invoice(
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_billing_month date,
  p_recipient_name text,
  p_recipient_email text,
  p_recipient_address text,
  p_amount_cents integer,
  p_invoice_date date,
  p_lines jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns public.lil_invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.lil_invoices%rowtype;
  v_issued public.lil_invoices%rowtype;
  v_number record;
  v_link public.lil_daily_invoice_links%rowtype;
begin
  -- SECURITY: service_role only, not callable from authenticated/anon clients.
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_stripe_invoice_id !~ '^in_[A-Za-z0-9]+$'
    or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or p_billing_month is null
    or extract(day from p_billing_month) <> 1
    or nullif(btrim(p_recipient_name), '') is null
    or p_amount_cents is null or p_amount_cents < 0
    or p_invoice_date is null
    or p_recipient_email is null or position('@' in p_recipient_email) < 2
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) = 0
    or jsonb_typeof(p_metadata) is distinct from 'object'
    or coalesce(p_metadata ->> 'payment_verified', '') <> 'true'
  then
    raise exception 'Invalid Daily invoice payload' using errcode = '22023';
  end if;

  -- Serialise both repeated Stripe events and manual issuance on same period.
  perform pg_advisory_xact_lock(
    hashtextextended('daily:' || p_stripe_subscription_id || ':' || p_billing_month::text, 0)
  );

  select * into v_link
    from public.lil_daily_invoice_links
   where stripe_invoice_id = p_stripe_invoice_id
      or (stripe_subscription_id = p_stripe_subscription_id and billing_month = p_billing_month)
   for update;

  if found then
    if v_link.stripe_invoice_id is distinct from p_stripe_invoice_id then
      raise exception 'Billing period already linked to a different Stripe invoice'
        using errcode = '23505';
    end if;
    if v_link.lil_invoice_id is not null then
      select * into strict v_existing from public.lil_invoices where id = v_link.lil_invoice_id;
      return v_existing;
    end if;
    raise exception 'Incomplete Daily billing link requires reconciliation'
      using errcode = '23505';
  end if;

  -- Detect manual invoices already issued for this customer/month.
  if exists (
    select 1 from public.lil_invoices i
     where i.invoice_type = 'daily_subscription'
       and i.status <> 'cancelled'
       and lower(btrim(i.recipient_name)) = lower(btrim(p_recipient_name))
       and i.metadata ->> 'daily_billing_month' = to_char(p_billing_month, 'YYYY-MM')
  ) then
    raise exception 'Existing manual Daily invoice requires reconciliation'
      using errcode = '23505';
  end if;

  -- Existing RPC and invoice insert are part of the SAME Postgres transaction.
  -- Any error rolls back the number increment as well.
  select * into strict v_number from public.next_lil_invoice_number();

  insert into public.lil_invoices (
    invoice_number, sequence_number, invoice_date, recipient_name,
    recipient_email, recipient_address, invoice_type, status, currency,
    subtotal_cents, tax_cents, total_cents, lines, metadata, issued_at
  ) values (
    v_number.invoice_number, v_number.sequence_number, p_invoice_date,
    btrim(p_recipient_name), nullif(btrim(p_recipient_email), ''),
    nullif(btrim(p_recipient_address), ''), 'daily_subscription',
    'paid', 'eur', p_amount_cents, 0, p_amount_cents, p_lines,
    (p_metadata - 'daily_billing_month') ||
      jsonb_build_object(
        'daily_billing_month', to_char(p_billing_month, 'YYYY-MM'),
        'stripe_invoice_id', p_stripe_invoice_id,
        'stripe_subscription_id', p_stripe_subscription_id
      ),
    now()
  ) returning * into v_issued;

  insert into public.lil_daily_invoice_links (
    stripe_invoice_id, stripe_subscription_id, billing_month,
    lil_invoice_id, payment_status, email_status
  ) values (
    p_stripe_invoice_id, p_stripe_subscription_id, p_billing_month,
    v_issued.id, 'paid', 'pending'
  );

  return v_issued;
end;
$$;

revoke all on function public.issue_paid_daily_lil_invoice(
  text,text,date,text,text,text,integer,date,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.issue_paid_daily_lil_invoice(
  text,text,date,text,text,text,integer,date,jsonb,jsonb
) to service_role;
