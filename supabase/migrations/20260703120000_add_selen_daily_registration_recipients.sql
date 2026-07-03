create table if not exists public.daily_registration_recipients (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('beneficiary', 'company', 'client_contact')),
  recipient_key text not null,
  recipient_name text,
  recipient_email text,
  company_name text,
  public_path text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error', 'skipped')),
  last_error text,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  resend_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, recipient_type, recipient_key)
);

create index if not exists daily_registration_recipients_session_idx
  on public.daily_registration_recipients(session_id, status, recipient_type);

drop trigger if exists daily_registration_recipients_set_updated_at on public.daily_registration_recipients;
create trigger daily_registration_recipients_set_updated_at
before update on public.daily_registration_recipients
for each row execute function public.set_daily_updated_at();

alter table public.daily_registration_recipients enable row level security;

drop policy if exists "Clients can read their Daily registration recipients" on public.daily_registration_recipients;
create policy "Clients can read their Daily registration recipients"
on public.daily_registration_recipients for select
to authenticated
using (auth.uid() = user_id);
