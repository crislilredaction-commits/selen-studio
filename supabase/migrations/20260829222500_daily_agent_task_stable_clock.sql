-- Selen Daily - stable 72h clock for agent tasks.
-- A formation edit while already in review must not restart the SLA.

alter table public.daily_formations
  add column if not exists agent_review_signaled_at timestamptz;

update public.daily_formations
set agent_review_signaled_at = coalesce(agent_review_signaled_at, updated_at, created_at, now())
where status = 'review'
  and agent_review_signaled_at is null;

create or replace function public.daily_maintain_formation_agent_review_signal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.status = 'review' then
    if tg_op = 'INSERT' or old.status is distinct from 'review' then
      new.agent_review_signaled_at := coalesce(new.agent_review_signaled_at, now());
    elsif new.agent_review_signaled_at is null then
      new.agent_review_signaled_at := coalesce(old.agent_review_signaled_at, old.updated_at, old.created_at, now());
    end if;
  else
    new.agent_review_signaled_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.daily_maintain_formation_agent_review_signal()
  from public, anon, authenticated;
grant execute on function public.daily_maintain_formation_agent_review_signal()
  to service_role;

drop trigger if exists daily_formations_agent_review_signal
  on public.daily_formations;
create trigger daily_formations_agent_review_signal
before insert or update of status, agent_review_signaled_at on public.daily_formations
for each row execute function public.daily_maintain_formation_agent_review_signal();
