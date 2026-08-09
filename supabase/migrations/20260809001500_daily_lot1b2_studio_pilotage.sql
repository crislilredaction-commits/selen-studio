-- Selen Daily Lot 1B.2 - Studio pilotage foundations.
-- Internal organisation assignment/checklist + trainer certification expiry tracking.

create table if not exists public.daily_organisation_assignments (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  agent_profile_id uuid not null references public.agent_profiles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_organisation_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  item_key text not null,
  category text not null default 'organisation',
  label text not null,
  description text,
  status text not null default 'todo',
  signaled_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  validated_by uuid references auth.users(id) on delete set null,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_organisation_checklist_status_check
    check (status in ('todo','in_progress','to_review','validated','blocked','not_applicable')),
  constraint daily_organisation_checklist_item_unique unique (organisation_id, item_key)
);

create index if not exists daily_organisation_checklist_attention_idx
  on public.daily_organisation_checklist_items(organisation_id, status, signaled_at);

create table if not exists public.daily_trainer_certifications (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete cascade,
  title text not null,
  issuer text,
  reference text,
  obtained_on date,
  validity_mode text not null default 'unknown',
  valid_until date,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_certifications_title_check check (length(btrim(title)) > 0),
  constraint daily_trainer_certifications_validity_mode_check
    check (validity_mode in ('lifetime','limited','unknown')),
  constraint daily_trainer_certifications_validity_dates_check
    check (
      (validity_mode = 'limited' and valid_until is not null)
      or (validity_mode = 'lifetime' and valid_until is null)
      or validity_mode = 'unknown'
    ),
  constraint daily_trainer_certifications_date_order_check
    check (valid_until is null or obtained_on is null or valid_until >= obtained_on)
);

create index if not exists daily_trainer_certifications_profile_idx
  on public.daily_trainer_certifications(trainer_profile_id);
create index if not exists daily_trainer_certifications_expiry_idx
  on public.daily_trainer_certifications(valid_until)
  where validity_mode = 'limited';

create or replace function public.daily_seed_organisation_checklist(p_organisation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.daily_organisation_checklist_items(
    organisation_id, item_key, category, label, description, position
  ) values
    (p_organisation_id, 'legal_identity', 'organisation', 'Vérifier l’identité juridique', 'Raison sociale, forme juridique, SIRET et représentant légal.', 10),
    (p_organisation_id, 'administrative_contact', 'organisation', 'Vérifier les coordonnées administratives', 'Email, téléphone et adresse utilisés pour le suivi Daily.', 20),
    (p_organisation_id, 'nda', 'conformity', 'Vérifier la situation NDA', 'Numéro de déclaration d’activité et statut administratif.', 30),
    (p_organisation_id, 'qualiopi', 'conformity', 'Vérifier la situation Qualiopi', 'Statut, catégories et période de validité lorsqu’elles existent.', 40),
    (p_organisation_id, 'users', 'access', 'Vérifier les utilisateurs et accès', 'Responsables, rôles, permissions et invitations en attente.', 50),
    (p_organisation_id, 'trainers', 'trainers', 'Vérifier les formateurs', 'Profils formateurs, relation avec l’OF et validation Selen.', 60),
    (p_organisation_id, 'trainer_certifications', 'trainers', 'Vérifier les certifications formateurs', 'Certifications à vie, à durée limitée ou dont la durée est inconnue.', 70)
  on conflict (organisation_id, item_key) do nothing;
end;
$$;

revoke execute on function public.daily_seed_organisation_checklist(uuid)
  from public, anon, authenticated;
grant execute on function public.daily_seed_organisation_checklist(uuid)
  to service_role;

create or replace function public.daily_seed_organisation_checklist_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.daily_seed_organisation_checklist(new.id);
  return new;
end;
$$;

revoke execute on function public.daily_seed_organisation_checklist_trigger()
  from public, anon, authenticated;
grant execute on function public.daily_seed_organisation_checklist_trigger()
  to service_role;

drop trigger if exists organisations_seed_daily_checklist on public.organisations;
create trigger organisations_seed_daily_checklist
after insert on public.organisations
for each row execute function public.daily_seed_organisation_checklist_trigger();

create or replace function public.daily_maintain_checklist_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();

  if tg_op = 'INSERT' then
    if new.signaled_at is null then new.signaled_at := now(); end if;
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status in ('validated','not_applicable') and new.completed_at is null then new.completed_at := now(); end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;

    if new.status in ('validated','not_applicable') then
      new.completed_at := now();
    elsif old.status in ('validated','not_applicable') then
      new.completed_at := null;
      new.signaled_at := now();
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_maintain_checklist_timestamps()
  from public, anon, authenticated;
grant execute on function public.daily_maintain_checklist_timestamps()
  to service_role;

drop trigger if exists daily_organisation_checklist_timestamps on public.daily_organisation_checklist_items;
create trigger daily_organisation_checklist_timestamps
before insert or update on public.daily_organisation_checklist_items
for each row execute function public.daily_maintain_checklist_timestamps();

create trigger daily_organisation_assignments_updated_at
before update on public.daily_organisation_assignments
for each row execute function public.daily_set_updated_at();

create trigger daily_trainer_certifications_updated_at
before update on public.daily_trainer_certifications
for each row execute function public.daily_set_updated_at();

alter table public.daily_organisation_assignments enable row level security;
alter table public.daily_organisation_checklist_items enable row level security;
alter table public.daily_trainer_certifications enable row level security;

revoke all on table public.daily_organisation_assignments from public, anon, authenticated;
revoke all on table public.daily_organisation_checklist_items from public, anon, authenticated;
revoke all on table public.daily_trainer_certifications from public, anon, authenticated;

grant select, insert, update, delete on table public.daily_organisation_assignments to service_role;
grant select, insert, update, delete on table public.daily_organisation_checklist_items to service_role;
grant select, insert, update, delete on table public.daily_trainer_certifications to service_role;

grant select, insert, update on table public.daily_trainer_certifications to authenticated;

drop policy if exists daily_organisation_assignments_staff_all on public.daily_organisation_assignments;
create policy daily_organisation_assignments_staff_all
on public.daily_organisation_assignments
for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists daily_organisation_checklist_staff_all on public.daily_organisation_checklist_items;
create policy daily_organisation_checklist_staff_all
on public.daily_organisation_checklist_items
for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists daily_trainer_certifications_staff_all on public.daily_trainer_certifications;
create policy daily_trainer_certifications_staff_all
on public.daily_trainer_certifications
for all to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists daily_trainer_certifications_manager_select on public.daily_trainer_certifications;
create policy daily_trainer_certifications_manager_select
on public.daily_trainer_certifications
for select to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
);

drop policy if exists daily_trainer_certifications_manager_insert on public.daily_trainer_certifications;
create policy daily_trainer_certifications_manager_insert
on public.daily_trainer_certifications
for insert to authenticated
with check (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
);

drop policy if exists daily_trainer_certifications_manager_update on public.daily_trainer_certifications;
create policy daily_trainer_certifications_manager_update
on public.daily_trainer_certifications
for update to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
)
with check (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and public.can_manage_daily_trainers(dtp.organisation_id)
  )
);

drop policy if exists daily_trainer_certifications_own_select on public.daily_trainer_certifications;
create policy daily_trainer_certifications_own_select
on public.daily_trainer_certifications
for select to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and dtp.user_id = (select auth.uid())
  )
);

drop policy if exists daily_trainer_certifications_own_insert on public.daily_trainer_certifications;
create policy daily_trainer_certifications_own_insert
on public.daily_trainer_certifications
for insert to authenticated
with check (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and dtp.user_id = (select auth.uid())
  )
);

drop policy if exists daily_trainer_certifications_own_update on public.daily_trainer_certifications;
create policy daily_trainer_certifications_own_update
on public.daily_trainer_certifications
for update to authenticated
using (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and dtp.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.daily_trainer_profiles dtp
    where dtp.id = trainer_profile_id
      and dtp.user_id = (select auth.uid())
  )
);

-- Seed the internal checklist for organisations that already exist.
select public.daily_seed_organisation_checklist(id) from public.organisations;
