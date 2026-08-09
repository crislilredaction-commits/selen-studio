-- Selen Daily Lot 1B.2 - secure Studio notifications now that they carry agent-targeted Daily alerts.

alter table public.notifications enable row level security;

revoke all on table public.notifications from anon;
revoke all on table public.notifications from authenticated;
grant select, update on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

drop policy if exists notifications_studio_select on public.notifications;
create policy notifications_studio_select
on public.notifications
for select
to authenticated
using (
  public.daily_is_selen_staff()
  and (
    source_kind is null
    or source_kind not in ('daily_checklist','daily_trainer_certification')
    or target_user_id = (select auth.uid())
    or target_agent_profile_id in (
      select ap.id
      from public.agent_profiles ap
      where ap.is_active = true
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      (
        target_role = 'admin'
        and target_agent_profile_id is null
      )
      and (
        exists (
          select 1 from public.agent_profiles ap
          where ap.is_active = true
            and ap.role = 'admin'
            and (
              ap.user_id = (select auth.uid())
              or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
        or exists (
          select 1 from public.selen_admin_users sau
          where sau.is_active = true
            and sau.role = 'admin'
            and (
              sau.user_id = (select auth.uid())
              or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
      )
    )
    or (
      source_kind = 'daily_checklist'
      and escalation_at <= now()
      and (
        exists (
          select 1 from public.agent_profiles ap
          where ap.is_active = true
            and ap.role = 'admin'
            and (
              ap.user_id = (select auth.uid())
              or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
        or exists (
          select 1 from public.selen_admin_users sau
          where sau.is_active = true
            and sau.role = 'admin'
            and (
              sau.user_id = (select auth.uid())
              or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
      )
    )
  )
);

drop policy if exists notifications_studio_update on public.notifications;
create policy notifications_studio_update
on public.notifications
for update
to authenticated
using (
  public.daily_is_selen_staff()
  and (
    source_kind is null
    or source_kind not in ('daily_checklist','daily_trainer_certification')
    or target_user_id = (select auth.uid())
    or target_agent_profile_id in (
      select ap.id
      from public.agent_profiles ap
      where ap.is_active = true
        and (
          ap.user_id = (select auth.uid())
          or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
        )
    )
    or (
      source_kind = 'daily_checklist'
      and escalation_at <= now()
      and (
        exists (
          select 1 from public.agent_profiles ap
          where ap.is_active = true
            and ap.role = 'admin'
            and (
              ap.user_id = (select auth.uid())
              or lower(ap.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
        or exists (
          select 1 from public.selen_admin_users sau
          where sau.is_active = true
            and sau.role = 'admin'
            and (
              sau.user_id = (select auth.uid())
              or lower(sau.email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
            )
        )
      )
    )
  )
)
with check (
  public.daily_is_selen_staff()
);
