do $$
begin
  if to_regclass('public.preaudit_sessions') is not null then
    execute 'alter table public.preaudit_sessions enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'preaudit_sessions'
        and policyname = 'Clients can read their completed preaudit sessions'
    ) then
      execute $policy$
        create policy "Clients can read their completed preaudit sessions"
        on public.preaudit_sessions
        for select
        to authenticated
        using (
          user_id = auth.uid()
          and coalesce(status, '') in ('completed', 'done', 'finished', 'finalized', 'termine')
        )
      $policy$;
    end if;
  end if;

  if to_regclass('public.preaudit_indicator_results') is not null then
    execute 'alter table public.preaudit_indicator_results enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'preaudit_indicator_results'
        and policyname = 'Clients can read results for completed preaudit sessions'
    ) then
      execute $policy$
        create policy "Clients can read results for completed preaudit sessions"
        on public.preaudit_indicator_results
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.preaudit_sessions ps
            where ps.id = preaudit_indicator_results.session_id
              and ps.user_id = auth.uid()
              and coalesce(ps.status, '') in ('completed', 'done', 'finished', 'finalized', 'termine')
          )
        )
      $policy$;
    end if;
  end if;

  if to_regclass('public.preaudit_answers') is not null then
    execute 'alter table public.preaudit_answers enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'preaudit_answers'
        and policyname = 'Clients can read answers for completed preaudit sessions'
    ) then
      execute $policy$
        create policy "Clients can read answers for completed preaudit sessions"
        on public.preaudit_answers
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.preaudit_sessions ps
            where ps.id = preaudit_answers.session_id
              and ps.user_id = auth.uid()
              and coalesce(ps.status, '') in ('completed', 'done', 'finished', 'finalized', 'termine')
          )
        )
      $policy$;
    end if;
  end if;

  if to_regclass('public.preaudit_indicator_notes') is not null then
    execute 'alter table public.preaudit_indicator_notes enable row level security';

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'preaudit_indicator_notes'
        and policyname = 'Clients can read notes for completed preaudit sessions'
    ) then
      execute $policy$
        create policy "Clients can read notes for completed preaudit sessions"
        on public.preaudit_indicator_notes
        for select
        to authenticated
        using (
          exists (
            select 1
            from public.preaudit_sessions ps
            where ps.id = preaudit_indicator_notes.session_id
              and ps.user_id = auth.uid()
              and coalesce(ps.status, '') in ('completed', 'done', 'finished', 'finalized', 'termine')
          )
        )
      $policy$;
    end if;
  end if;
end $$;

