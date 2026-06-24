do $$
begin
  if to_regclass('public.appointment_requests') is not null then
    execute 'alter table public.appointment_requests enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'appointment_requests'
        and policyname = 'Studio staff can read appointment requests'
    ) then
      execute $policy$
        create policy "Studio staff can read appointment requests"
        on public.appointment_requests
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.agent_profiles ap
            where ap.is_active = true
              and ap.role in ('agent', 'admin')
              and (
                ap.user_id = auth.uid()
                or lower(ap.email) = lower(auth.jwt() ->> 'email')
              )
          )
        )
      $policy$;
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'appointment_requests'
        and policyname = 'Studio staff can update appointment request follow-up'
    ) then
      execute $policy$
        create policy "Studio staff can update appointment request follow-up"
        on public.appointment_requests
        for update
        to authenticated
        using (
          exists (
            select 1
            from public.agent_profiles ap
            where ap.is_active = true
              and ap.role in ('agent', 'admin')
              and (
                ap.user_id = auth.uid()
                or lower(ap.email) = lower(auth.jwt() ->> 'email')
              )
          )
        )
        with check (
          exists (
            select 1
            from public.agent_profiles ap
            where ap.is_active = true
              and ap.role in ('agent', 'admin')
              and (
                ap.user_id = auth.uid()
                or lower(ap.email) = lower(auth.jwt() ->> 'email')
              )
          )
        )
      $policy$;
    end if;
  end if;

  if to_regclass('public.satisfaction_surveys') is not null then
    execute 'alter table public.satisfaction_surveys enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'satisfaction_surveys'
        and policyname = 'Studio staff can read satisfaction surveys'
    ) then
      execute $policy$
        create policy "Studio staff can read satisfaction surveys"
        on public.satisfaction_surveys
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.agent_profiles ap
            where ap.is_active = true
              and ap.role in ('agent', 'admin')
              and (
                ap.user_id = auth.uid()
                or lower(ap.email) = lower(auth.jwt() ->> 'email')
              )
          )
        )
      $policy$;
    end if;
  end if;
end $$;
