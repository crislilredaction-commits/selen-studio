-- Atomic Stripe -> canonical Lil invoice issuance.
-- IMPORTANT: reviewed/tested migration only; never deploy to production without
-- confirming Stripe tax, service periods, and billing identity.
create or replace function public.issue_paid_daily_lil_invoice(
  p_stripe_invoice_id text,
  p_stripe_subscription_id text,
  p_period_start timestamptz,
  p_period_end_exclusive timestamptz,
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
    or p_period_start is null
    or p_period_end_exclusive is null
    or p_period_end_exclusive <= p_period_start
    or nullif(btrim(p_recipient_name), '') is null
    or p_amount_cents is null or p_amount_cents <= 0
    or p_invoice_date is null
    or p_recipient_email is null or position('@' in p_recipient_email) < 2
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) <> 1
    or (p_lines -> 0 ->> 'totalAmountCents') is null
    or (p_lines -> 0 ->> 'totalAmountCents') !~ '^[0-9]+$'
    or (p_lines -> 0 ->> 'totalAmountCents')::numeric <> p_amount_cents
    or (p_lines -> 0 ->> 'quantity') is null
    or (p_lines -> 0 ->> 'quantity') !~ '^[0-9]+$'
    or (p_lines -> 0 ->> 'quantity')::numeric <> 1
    or (p_lines -> 0 ->> 'unitAmountCents') is null
    or (p_lines -> 0 ->> 'unitAmountCents') !~ '^[0-9]+$'
    or (p_lines -> 0 ->> 'unitAmountCents')::numeric <> p_amount_cents
    or jsonb_typeof(p_metadata) is distinct from 'object'
    or coalesce(p_metadata ->> 'payment_verified', '') <> 'true'
  then
    raise exception 'Invalid Daily invoice payload' using errcode = '22023';
  end if;

  -- Validate a single full-period line against the amount actually collected.
  -- Discounts, credits, prorations and refunds require a separate reviewed path.
  -- Serialise repeated Stripe events on the same period.
  perform pg_advisory_xact_lock(
    hashtextextended('daily:' || p_stripe_subscription_id || ':' || p_period_start::text || ':' || p_period_end_exclusive::text, 0)
  );

  select * into v_link
    from public.lil_daily_invoice_links
   where stripe_invoice_id = p_stripe_invoice_id
      or (stripe_subscription_id = p_stripe_subscription_id and period_start = p_period_start and period_end_exclusive = p_period_end_exclusive)
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

  -- Reject overlapping service periods, even if Stripe changes cycle boundaries.
  if exists (
    select 1 from public.lil_daily_invoice_links l
    where l.stripe_subscription_id = p_stripe_subscription_id
      and l.period_start < p_period_end_exclusive
      and l.period_end_exclusive > p_period_start
  ) then
    raise exception 'Overlapping Daily subscription billing period requires reconciliation'
      using errcode = '23505';
  end if;

  -- Detect manual invoices already issued for this customer/period.
  if exists (
    select 1 from public.lil_invoices i
     where i.invoice_type = 'daily_subscription'
       and i.status <> 'cancelled'
       and lower(btrim(i.recipient_name)) = lower(btrim(p_recipient_name))
       and (i.metadata ->> 'daily_period_start') <= to_char((p_period_end_exclusive at time zone 'UTC') - interval '1 day', 'YYYY-MM-DD')
       and (i.metadata ->> 'daily_period_end') >= to_char(p_period_start at time zone 'UTC', 'YYYY-MM-DD')
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
    subtotal_cents, tax_cents, total_cents, lines, metadata, issued_at, paid_at
  ) values (
    v_number.invoice_number, v_number.sequence_number, p_invoice_date,
    btrim(p_recipient_name), nullif(btrim(p_recipient_email), ''),
    nullif(btrim(p_recipient_address), ''), 'daily_subscription',
    'paid', 'eur', p_amount_cents, 0, p_amount_cents, p_lines,
    (p_metadata - 'daily_billing_month' - 'daily_period_start' - 'daily_period_end') ||
      jsonb_build_object(
        'daily_period_start', to_char(p_period_start at time zone 'UTC', 'YYYY-MM-DD'),
        'daily_period_end', to_char((p_period_end_exclusive at time zone 'UTC') - interval '1 day', 'YYYY-MM-DD'),
        'stripe_invoice_id', p_stripe_invoice_id,
        'stripe_subscription_id', p_stripe_subscription_id,
        'vat_exemption_mention', 'TVA non applicable, art. 293 B du CGI',
        'payment_method', 'Stripe',
        'payment_terms', 'Facture acquittee - paiement recu par Stripe',
        'due_date', p_invoice_date::text
      ),
    now(), now()
  ) returning * into v_issued;

  insert into public.lil_daily_invoice_links (
    stripe_invoice_id, stripe_subscription_id, period_start, period_end_exclusive,
    lil_invoice_id, payment_status, email_status
  ) values (
    p_stripe_invoice_id, p_stripe_subscription_id, p_period_start, p_period_end_exclusive,
    v_issued.id, 'paid', 'pending'
  );

  return v_issued;
end;
$$;

revoke all on function public.issue_paid_daily_lil_invoice(
  text,text,timestamptz,timestamptz,text,text,text,integer,date,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.issue_paid_daily_lil_invoice(
  text,text,timestamptz,timestamptz,text,text,text,integer,date,jsonb,jsonb
) to service_role;