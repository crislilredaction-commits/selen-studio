-- Selen Daily Lot 3A - short-lived email-code verification for shared attendance links.

create table public.daily_attendance_verifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  slot_id uuid not null references public.daily_attendance_slots(id) on delete cascade,
  access_token_id uuid not null references public.daily_attendance_access_tokens(id) on delete cascade,
  enrolment_id uuid not null references public.daily_session_enrolments(id) on delete cascade,
  email_hash text not null,
  code_hash text not null,
  status text not null default 'pending' check (status in ('pending','verified','expired','locked')),
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 10),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create index daily_attendance_verifications_lookup_idx
  on public.daily_attendance_verifications(access_token_id,enrolment_id,status,expires_at desc);

alter table public.daily_attendance_verifications enable row level security;

create policy "Selen staff manage Daily attendance verifications"
  on public.daily_attendance_verifications for all to authenticated
  using (public.daily_is_selen_staff())
  with check (public.daily_is_selen_staff());

revoke all on public.daily_attendance_verifications from anon,authenticated;
grant all on public.daily_attendance_verifications to service_role;
