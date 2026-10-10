-- Harden the client-facing audit blanc summary view without changing business data.
--
-- The backing tables already have RLS policies for agents and for clients reading
-- only their own audit blanc case / visible documents. PostgreSQL views run with
-- the owner's privileges by default, which bypasses those caller-level RLS checks.
-- `security_invoker = true` makes the view obey the querying role and the backing
-- tables' RLS policies.

alter view public.audit_blanc_client_summary
  set (security_invoker = true);

-- This aggregate view is read-only by design. Keep only the privilege needed by
-- the application and remove inherited default privileges that have no purpose.
revoke insert, update, delete, truncate, references, trigger
  on public.audit_blanc_client_summary
  from anon, authenticated;

-- Preserve SELECT for authenticated clients/agents. Anonymous callers have no
-- legitimate authenticated audit-blanc ownership context, so remove direct access.
revoke select
  on public.audit_blanc_client_summary
  from anon;

grant select
  on public.audit_blanc_client_summary
  to authenticated;
