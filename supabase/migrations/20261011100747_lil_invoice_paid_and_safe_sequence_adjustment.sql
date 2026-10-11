create table if not exists public.lil_invoice_sequence_adjustments (
  id uuid primary key default gen_random_uuid(),
  previous_last_number integer not null,
  new_last_number integer not null,
  requested_next_number integer not null,
  max_assigned_sequence integer not null,
  reason text not null,
  adjusted_by_email text not null,
  created_at timestamptz not null default now(),
  constraint lil_invoice_sequence_adjustments_numbers_check check (
    previous_last_number >= 415
    and new_last_number >= 415
    and requested_next_number = new_last_number + 1
    and requested_next_number > max_assigned_sequence
  ),
  constraint lil_invoice_sequence_adjustments_reason_check check (
    length(btrim(reason)) >= 8
  )
);

alter table public.lil_invoice_sequence_adjustments enable row level security;

revoke all on table public.lil_invoice_sequence_adjustments from public, anon, authenticated;
grant select, insert on table public.lil_invoice_sequence_adjustments to service_role;

create or replace function public.adjust_lil_next_invoice_number(
  p_next_number integer,
  p_expected_current_next_number integer,
  p_reason text,
  p_actor_email text
)
returns table (
  previous_last_number integer,
  new_last_number integer,
  next_number integer,
  max_assigned_sequence integer,
  adjusted boolean,
  adjustment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_last_number integer;
  v_new_last_number integer;
  v_max_assigned_sequence integer;
  v_adjustment_id uuid;
begin
  if p_next_number is null or p_next_number < 416 then
    raise exception 'Le prochain numero doit etre superieur ou egal a 416.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Un motif explicite de 8 caracteres minimum est requis.';
  end if;
  if lower(btrim(coalesce(p_actor_email, ''))) <> 'hello@selen-editions.fr' then
    raise exception 'Seule Lil peut ajuster le compteur de factures.';
  end if;

  insert into public.lil_invoice_sequence (id, last_number)
  values (true, 415)
  on conflict (id) do nothing;

  select sequence.last_number
  into v_previous_last_number
  from public.lil_invoice_sequence as sequence
  where sequence.id = true
  for update;

  if p_expected_current_next_number is null
    or p_expected_current_next_number <> v_previous_last_number + 1 then
    raise exception 'Le compteur a change. Rechargez les parametres avant de recommencer.';
  end if;

  select coalesce(max(invoice.sequence_number), 415)
  into v_max_assigned_sequence
  from public.lil_invoices as invoice;

  if p_next_number <= v_max_assigned_sequence then
    raise exception 'Le numero demande est deja attribue ou anterieur au dernier numero attribue.';
  end if;
  if p_next_number > v_previous_last_number + 1 then
    raise exception 'Une avance du compteur creerait un trou de numerotation.';
  end if;

  v_new_last_number := p_next_number - 1;
  if v_new_last_number = v_previous_last_number then
    return query
      select v_previous_last_number, v_new_last_number, p_next_number,
        v_max_assigned_sequence, false, null::uuid;
    return;
  end if;

  update public.lil_invoice_sequence
  set last_number = v_new_last_number,
      updated_at = now()
  where id = true;

  insert into public.lil_invoice_sequence_adjustments (
    previous_last_number,
    new_last_number,
    requested_next_number,
    max_assigned_sequence,
    reason,
    adjusted_by_email
  )
  values (
    v_previous_last_number,
    v_new_last_number,
    p_next_number,
    v_max_assigned_sequence,
    btrim(p_reason),
    lower(btrim(p_actor_email))
  )
  returning id into v_adjustment_id;

  return query
    select v_previous_last_number, v_new_last_number, p_next_number,
      v_max_assigned_sequence, true, v_adjustment_id;
end;
$$;

revoke execute on function public.adjust_lil_next_invoice_number(integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.adjust_lil_next_invoice_number(integer, integer, text, text)
  to service_role;

comment on function public.adjust_lil_next_invoice_number(integer, integer, text, text) is
  'Elimine uniquement un ecart final non attribue du compteur Lil, sous verrou, sans saut ni reutilisation d un numero existant.';
