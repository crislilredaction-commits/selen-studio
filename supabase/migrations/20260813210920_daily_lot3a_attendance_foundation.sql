-- Selen Daily Lot 3A - attendance slots, records and hashed access tokens.

create table public.daily_attendance_slots (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  slot_key text not null,
  slot_date date not null,
  starts_at time not null,
  ends_at time not null,
  mode text not null check (mode in ('presentiel','distanciel_synchrone','distanciel_asynchrone')),
  label text,
  status text not null default 'draft' check (status in ('draft','open','closed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,slot_key),
  check (ends_at > starts_at)
);

create index daily_attendance_slots_session_idx
  on public.daily_attendance_slots(session_id,slot_date,starts_at);

create table public.daily_attendance_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  slot_id uuid not null references public.daily_attendance_slots(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','present','absent','excused')),
  consent_text text,
  signature_storage_path text,
  signature_sha256 text check (signature_sha256 is null or signature_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  proof_sha256 text check (proof_sha256 is null or proof_sha256 ~ '^[A-Fa-f0-9]{64}$'),
  signed_at timestamptz,
  ip_address inet,
  user_agent text,
  evidence_metadata jsonb not null default '{}'::jsonb,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(slot_id,enrolment_id),
  check (
    status <> 'present'
    or (
      signed_at is not null
      and consent_text is not null
      and signature_storage_path is not null
      and signature_sha256 is not null
      and proof_sha256 is not null
    )
  )
);

create index daily_attendance_records_session_idx
  on public.daily_attendance_records(session_id,status);
create index daily_attendance_records_enrolment_idx
  on public.daily_attendance_records(enrolment_id,status);

create table public.daily_attendance_access_tokens (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  slot_id uuid not null references public.daily_attendance_slots(id) on delete cascade,
  enrolment_id uuid references public.daily_session_enrolments(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[A-Fa-f0-9]{64}$'),
  access_type text not null check (access_type in ('shared','individual')),
  channel text not null check (channel in ('qr','chat','link')),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (access_type='individual' and enrolment_id is not null)
    or (access_type='shared' and enrolment_id is null)
  )
);

create index daily_attendance_access_slot_idx
  on public.daily_attendance_access_tokens(slot_id,status,expires_at);

alter table public.daily_attendance_slots enable row level security;
alter table public.daily_attendance_records enable row level security;
alter table public.daily_attendance_access_tokens enable row level security;

create policy "Selen staff manage Daily attendance slots"
  on public.daily_attendance_slots for all to authenticated
  using (public.daily_is_selen_staff())
  with check (public.daily_is_selen_staff());
create policy "Session managers read Daily attendance slots"
  on public.daily_attendance_slots for select to authenticated
  using (public.can_manage_daily_sessions(organisation_id));

create policy "Selen staff manage Daily attendance records"
  on public.daily_attendance_records for all to authenticated
  using (public.daily_is_selen_staff())
  with check (public.daily_is_selen_staff());
create policy "Session managers read Daily attendance records"
  on public.daily_attendance_records for select to authenticated
  using (public.can_manage_daily_sessions(organisation_id));

create policy "Selen staff manage Daily attendance tokens"
  on public.daily_attendance_access_tokens for all to authenticated
  using (public.daily_is_selen_staff())
  with check (public.daily_is_selen_staff());
create policy "Session managers read Daily attendance tokens"
  on public.daily_attendance_access_tokens for select to authenticated
  using (public.can_manage_daily_sessions(organisation_id));

grant select on public.daily_attendance_slots,public.daily_attendance_records,public.daily_attendance_access_tokens to authenticated;
grant all on public.daily_attendance_slots,public.daily_attendance_records,public.daily_attendance_access_tokens to service_role;
