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
  v_settings public.lil_invoice_settings%rowtype;
begin
  -- SECURITY: service_role only, not callable from authenticated/anon clients.
  if coalesce(nullif(current_setting('request.jwt.claim.role', true),''),
              nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'role','') <> 'service_role' then
    raise exception 'service_role required' using errcode = '42501';
  end if;
  if p_stripe_invoice_id is null or p_stripe_subscription_id is null
    or p_stripe_invoice_id !~ '^in_[A-Za-z0-9]+$'
    or p_stripe_subscription_id !~ '^sub_[A-Za-z0-9]+$'
    or p_period_start is null
    or p_period_end_exclusive is null
    or p_period_end_exclusive <= p_period_start
    or nullif(btrim(p_recipient_name), '') is null
    or p_amount_cents is null or p_amount_cents <= 0
    or nullif(btrim(p_recipient_address),'') is null
    or nullif(p_metadata ->> 'stripe_paid_at','') is null
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
    hashtextextended('daily:' || p_stripe_subscription_id, 0)
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
      if v_link.stripe_subscription_id <> p_stripe_subscription_id
        or v_link.period_start <> p_period_start or v_link.period_end_exclusive <> p_period_end_exclusive
        or v_existing.total_cents <> p_amount_cents or v_existing.status <> 'paid' then
        raise exception 'Changed paid invoice requires reconciliation';
      end if;
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
       and (i.metadata ->> 'daily_period_start') <= to_char((p_period_end_exclusive at time zone 'Europe/Paris') - interval '1 day', 'YYYY-MM-DD')
       and (i.metadata ->> 'daily_period_end') >= to_char(p_period_start at time zone 'Europe/Paris', 'YYYY-MM-DD')
  ) then
    raise exception 'Existing manual Daily invoice requires reconciliation'
      using errcode = '23505';
  end if;

  if exists (select 1 from public.lil_daily_prior_payments
     where stripe_invoice_hash = encode(sha256(convert_to(p_stripe_invoice_id,'UTF8')),'hex')
       or (stripe_subscription_hash = encode(sha256(convert_to(p_stripe_subscription_id,'UTF8')),'hex')
       and period_start < p_period_end_exclusive and period_end_exclusive > p_period_start)) then
    raise exception 'Historical Daily payment already invoiced';
  end if;
  -- Existing RPC and invoice insert are part of the SAME Postgres transaction.
  -- Any error rolls back the number increment as well.
  if (select last_number from public.lil_invoice_sequence where id for update) < 437
     or not exists (select 1 from public.lil_invoice_sequence where id) then
    raise exception 'Reconcile shared sequence through F000437 before issuing';
  end if;
  select * into strict v_settings from public.lil_invoice_settings where id;
  if nullif(btrim(v_settings.address),'') is null or nullif(btrim(v_settings.siren_siret),'') is null then
    raise exception 'Issuer legal identity incomplete';
  end if;
  if v_settings.vat_status !~* '293[[:space:]]*B' then
    raise exception 'Configured VAT regime needs reconciliation';
  end if;
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
        'issuer_settings', to_jsonb(v_settings),
        'daily_period_start', to_char(p_period_start at time zone 'Europe/Paris', 'YYYY-MM-DD'),
        'daily_period_end', to_char((p_period_end_exclusive at time zone 'Europe/Paris') - interval '1 day', 'YYYY-MM-DD'),
        'stripe_invoice_id', p_stripe_invoice_id,
        'stripe_subscription_id', p_stripe_subscription_id,
        'vat_exemption_mention', 'TVA non applicable, art. 293 B du CGI',
        'payment_method', 'Stripe',
        'payment_terms', 'Facture acquittee - paiement recu par Stripe',
        'due_date', p_invoice_date::text
      ),
    now(), (p_metadata ->> 'stripe_paid_at')::timestamptz
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
create function public.mark_daily_invoice_sent(p_invoice uuid,p_provider_id text) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.lil_daily_invoice_links set email_provider_id=coalesce(email_provider_id,p_provider_id),email_status='sent',email_sent_at=coalesce(email_sent_at,now())
    where lil_invoice_id=p_invoice and email_status in ('sending','sent');
  if not found then raise exception 'Daily delivery claim missing'; end if;
  update public.lil_invoices set email_sent_at=coalesce(email_sent_at,now()),sent_at=coalesce(sent_at,now())
    where id=p_invoice;
end;
$$;
revoke all on function public.mark_daily_invoice_sent(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_daily_invoice_sent(uuid,text) to service_role;
