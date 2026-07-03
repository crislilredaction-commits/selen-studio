alter table public.daily_sessions
  add column if not exists registration_token text,
  add column if not exists registration_status text not null default 'to_prepare' check (
    registration_status in (
      'to_prepare',
      'to_review',
      'ready_to_send',
      'sent',
      'responses_received',
      'summary_to_review',
      'summary_validated'
    )
  ),
  add column if not exists registration_summary jsonb not null default '{}'::jsonb,
  add column if not exists adaptation_needed boolean not null default false,
  add column if not exists registration_prepared_at timestamptz,
  add column if not exists registration_sent_at timestamptz,
  add column if not exists registration_responses_received_at timestamptz,
  add column if not exists registration_summary_validated_at timestamptz;

create unique index if not exists daily_sessions_registration_token_uidx
  on public.daily_sessions(registration_token)
  where registration_token is not null;

create table if not exists public.daily_registration_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response_type text not null check (response_type in ('beneficiary', 'company')),
  respondent_first_name text,
  respondent_last_name text,
  respondent_email text,
  company_name text,
  participants jsonb not null default '[]'::jsonb,
  need_answers jsonb not null default '{}'::jsonb,
  positioning_answers jsonb not null default '{}'::jsonb,
  adaptation_needed boolean not null default false,
  status text not null default 'submitted' check (status in ('draft', 'submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists daily_registration_responses_session_idx
  on public.daily_registration_responses(session_id, response_type, submitted_at desc);

drop trigger if exists daily_registration_responses_set_updated_at on public.daily_registration_responses;
create trigger daily_registration_responses_set_updated_at
before update on public.daily_registration_responses
for each row execute function public.set_daily_updated_at();

create or replace function public.daily_registration_response_summary(
  p_session_id uuid
)
returns jsonb as $$
declare
  summary jsonb;
begin
  select jsonb_build_object(
    'attentes', string_agg(coalesce(need_answers->>'expectations', ''), E'\n'),
    'motivations', string_agg(coalesce(need_answers->>'motivations', ''), E'\n'),
    'contraintes', string_agg(coalesce(need_answers->>'constraints', ''), E'\n'),
    'demandes_specifiques', string_agg(coalesce(need_answers->>'specific_requests', ''), E'\n'),
    'adaptations', string_agg(coalesce(need_answers->>'disability_or_adaptation', ''), E'\n'),
    'points_formateur', string_agg(coalesce(need_answers->>'trainer_attention_points', ''), E'\n'),
    'response_count', count(*),
    'generated_at', now()
  )
  into summary
  from public.daily_registration_responses
  where session_id = p_session_id
    and status = 'submitted';

  return coalesce(summary, '{}'::jsonb);
end;
$$ language plpgsql;

alter table public.daily_registration_responses enable row level security;

drop policy if exists "Clients can read their Daily registration responses" on public.daily_registration_responses;
create policy "Clients can read their Daily registration responses"
on public.daily_registration_responses for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Clients can create their Daily registration responses" on public.daily_registration_responses;
create policy "Clients can create their Daily registration responses"
on public.daily_registration_responses for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Clients can update their Daily registration responses" on public.daily_registration_responses;
create policy "Clients can update their Daily registration responses"
on public.daily_registration_responses for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
