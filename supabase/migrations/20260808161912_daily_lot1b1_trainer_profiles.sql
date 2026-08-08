-- Selen Daily Lot 1B.1 - organisation-scoped trainer profiles and staff-only internal notes.

create table if not exists public.daily_trainer_profiles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  membership_id uuid null references public.organisation_memberships(id) on delete restrict,
  user_id uuid null references auth.users(id) on delete set null,
  professional_email text null,
  display_name text not null,
  phone text null,
  biography text null,
  specialties text[] not null default '{}'::text[],
  engagement_type text not null default 'external',
  status text not null default 'draft',
  active boolean not null default true,
  submitted_at timestamptz null,
  selen_validated_at timestamptz null,
  selen_validated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_profiles_identity_check
    check (membership_id is not null or user_id is not null or professional_email is not null),
  constraint daily_trainer_profiles_email_check
    check (professional_email is null or professional_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint daily_trainer_profiles_engagement_type_check
    check (engagement_type in ('internal', 'employee', 'subcontractor', 'external')),
  constraint daily_trainer_profiles_status_check
    check (status in ('draft', 'pending_selen_review', 'validated', 'rejected', 'archived')),
  constraint daily_trainer_profiles_validation_state_check
    check (
      (status = 'validated' and selen_validated_at is not null and selen_validated_by is not null)
      or (status <> 'validated' and selen_validated_at is null and selen_validated_by is null)
    )
);

create unique index if not exists daily_trainer_profiles_org_membership_unique_idx
  on public.daily_trainer_profiles (organisation_id, membership_id)
  where membership_id is not null;

create unique index if not exists daily_trainer_profiles_org_user_unique_idx
  on public.daily_trainer_profiles (organisation_id, user_id)
  where user_id is not null;

create unique index if not exists daily_trainer_profiles_org_email_unique_idx
  on public.daily_trainer_profiles (organisation_id, lower(professional_email))
  where professional_email is not null;

create index if not exists daily_trainer_profiles_org_status_idx
  on public.daily_trainer_profiles (organisation_id, status, active);

create or replace function public.validate_daily_trainer_profile_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  membership_record public.organisation_memberships%rowtype;
begin
  if new.membership_id is not null then
    select * into membership_record
    from public.organisation_memberships
    where id = new.membership_id;

    if not found then raise exception 'trainer membership not found'; end if;
    if membership_record.organisation_id <> new.organisation_id then
      raise exception 'trainer membership belongs to another organisation';
    end if;

    if new.user_id is null then
      new.user_id := membership_record.user_id;
    elsif new.user_id <> membership_record.user_id then
      raise exception 'trainer user_id does not match membership user_id';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_daily_trainer_profile_identity()
  from public, anon, authenticated;
grant execute on function public.validate_daily_trainer_profile_identity()
  to service_role;

drop trigger if exists daily_trainer_profiles_validate_identity on public.daily_trainer_profiles;
create trigger daily_trainer_profiles_validate_identity
before insert or update of organisation_id, membership_id, user_id
on public.daily_trainer_profiles
for each row execute function public.validate_daily_trainer_profile_identity();

drop trigger if exists daily_trainer_profiles_set_updated_at on public.daily_trainer_profiles;
create trigger daily_trainer_profiles_set_updated_at
before update on public.daily_trainer_profiles
for each row execute function public.daily_set_updated_at();

create table if not exists public.daily_trainer_profile_internal_notes (
  id uuid primary key default gen_random_uuid(),
  trainer_profile_id uuid not null references public.daily_trainer_profiles(id) on delete restrict,
  validation_notes text null,
  internal_metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_trainer_profile_internal_notes_metadata_object_check
    check (jsonb_typeof(internal_metadata) = 'object'),
  constraint daily_trainer_profile_internal_notes_no_secret_check
    check (internal_metadata::text !~* '(raw_token|access_token|refresh_token|secret|password)')
);

create index if not exists daily_trainer_profile_internal_notes_profile_idx
  on public.daily_trainer_profile_internal_notes (trainer_profile_id, created_at desc);

drop trigger if exists daily_trainer_profile_internal_notes_set_updated_at
  on public.daily_trainer_profile_internal_notes;
create trigger daily_trainer_profile_internal_notes_set_updated_at
before update on public.daily_trainer_profile_internal_notes
for each row execute function public.daily_set_updated_at();

alter table public.daily_trainer_profiles enable row level security;
alter table public.daily_trainer_profile_internal_notes enable row level security;

revoke all on table public.daily_trainer_profiles from public, anon, authenticated;
revoke all on table public.daily_trainer_profile_internal_notes from public, anon, authenticated;

comment on table public.daily_trainer_profiles is
  'Daily Lot 1B.1: organisation-scoped trainer profile. Personal identity stays in Auth/client profile; final Selen validation is stored here.';
comment on table public.daily_trainer_profile_internal_notes is
  'Daily Lot 1B.1: staff-only trainer validation notes and internal metadata, deliberately separated from the Vitrine-readable trainer profile.';
