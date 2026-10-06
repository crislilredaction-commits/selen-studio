-- A8: a cancelled or abandoned enrolment must be able to revoke its learner
-- portal immediately. The application already rejects revoked tokens; this
-- aligns the database invariant without deleting access history.
alter table public.daily_portal_access_tokens
  drop constraint if exists daily_portal_access_tokens_status_check;

alter table public.daily_portal_access_tokens
  add constraint daily_portal_access_tokens_status_check
  check (status in ('pending', 'viewed', 'revoked', 'expired'));

comment on column public.daily_portal_access_tokens.status is
  'A8 portal lifecycle: pending/viewed remain active; revoked/expired are denied and renewable without duplicating the access row.';
