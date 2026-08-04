-- Selen Daily Lot 1A - targeted organisations access hardening.
-- Does not alter historical tables dossiers, documents, formations, or nda_variables.

revoke all on table public.organisations from anon;
revoke truncate, references, trigger on table public.organisations from authenticated;

grant select, insert, update, delete on table public.organisations to authenticated;

alter table public.organisations enable row level security;

drop policy if exists "Selen staff can manage organisations" on public.organisations;
create policy "Selen staff can manage organisations"
on public.organisations
for all
to authenticated
using (public.daily_is_selen_staff())
with check (public.daily_is_selen_staff());

drop policy if exists "Active managers can read their organisation legal profile" on public.organisations;
create policy "Active managers can read their organisation legal profile"
on public.organisations
for select
to authenticated
using (public.has_organisation_role(id, 'manager'));

comment on table public.organisation_memberships is
  'Selen Daily Lot 1A foundation: links auth.users to canonical public.organisations without duplicating personal profile data.';

comment on table public.organisation_membership_roles is
  'Selen Daily Lot 1A foundation: cumulative organisation roles manager, trainer, admin_assistant.';

comment on table public.organisation_membership_permission_blocks is
  'Selen Daily Lot 1A foundation: additional coarse permission blocks for V1, not microscopic permissions.';

comment on table public.daily_audit_logs is
  'Selen Daily Lot 1A foundation: append-only audit journal for sensitive Daily actions.';

comment on table public.daily_documents is
  'Selen Daily Lot 1A foundation: versioned metadata for Daily documents stored in Supabase Storage.';

comment on table public.organisations is
  'Canonical organisation table reused by Selen Daily. One row represents one legal entity; no parallel daily_organisations table. In Lot 1A, full row access is limited to Selen staff and active managers; reduced views for trainers/admin assistants may be introduced later.';
