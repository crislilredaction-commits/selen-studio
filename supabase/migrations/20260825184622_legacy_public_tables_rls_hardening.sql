-- Harden the ten legacy public tables identified by the August 2026 security audit.
-- Client-facing NDA flows use verified server routes backed by service_role.
-- Direct browser access to legacy business tables is reserved to Studio staff.

alter table public.profiles enable row level security;
alter table public.dossiers enable row level security;
alter table public.dossier_assignments enable row level security;
alter table public.formations enable row level security;
alter table public.documents enable row level security;
alter table public.nda_variables enable row level security;
alter table public.messages enable row level security;
alter table public.internal_messages enable row level security;
alter table public.program_ai_analyses enable row level security;
alter table public.dossier_program_versions enable row level security;

revoke all privileges on table public.profiles from anon;
revoke all privileges on table public.dossiers from anon;
revoke all privileges on table public.dossier_assignments from anon;
revoke all privileges on table public.formations from anon;
revoke all privileges on table public.documents from anon;
revoke all privileges on table public.nda_variables from anon;
revoke all privileges on table public.messages from anon;
revoke all privileges on table public.internal_messages from anon;
revoke all privileges on table public.program_ai_analyses from anon;
revoke all privileges on table public.dossier_program_versions from anon;

revoke truncate, references, trigger on table public.profiles from authenticated;
revoke truncate, references, trigger on table public.dossiers from authenticated;
revoke truncate, references, trigger on table public.dossier_assignments from authenticated;
revoke truncate, references, trigger on table public.formations from authenticated;
revoke truncate, references, trigger on table public.documents from authenticated;
revoke truncate, references, trigger on table public.nda_variables from authenticated;
revoke truncate, references, trigger on table public.messages from authenticated;
revoke truncate, references, trigger on table public.internal_messages from authenticated;
revoke truncate, references, trigger on table public.program_ai_analyses from authenticated;
revoke truncate, references, trigger on table public.dossier_program_versions from authenticated;

drop policy if exists legacy_profiles_self_select on public.profiles;
drop policy if exists legacy_profiles_staff_all on public.profiles;

create policy legacy_profiles_self_select
on public.profiles
for select
to authenticated
using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

create policy legacy_profiles_staff_all
on public.profiles
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_dossiers_staff_all on public.dossiers;
create policy legacy_dossiers_staff_all
on public.dossiers
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_dossier_assignments_staff_all on public.dossier_assignments;
create policy legacy_dossier_assignments_staff_all
on public.dossier_assignments
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_formations_staff_all on public.formations;
create policy legacy_formations_staff_all
on public.formations
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_documents_staff_all on public.documents;
create policy legacy_documents_staff_all
on public.documents
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_nda_variables_staff_all on public.nda_variables;
create policy legacy_nda_variables_staff_all
on public.nda_variables
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_messages_staff_all on public.messages;
create policy legacy_messages_staff_all
on public.messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_internal_messages_staff_all on public.internal_messages;
create policy legacy_internal_messages_staff_all
on public.internal_messages
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_program_ai_analyses_staff_all on public.program_ai_analyses;
create policy legacy_program_ai_analyses_staff_all
on public.program_ai_analyses
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists legacy_program_versions_staff_all on public.dossier_program_versions;
create policy legacy_program_versions_staff_all
on public.dossier_program_versions
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());
