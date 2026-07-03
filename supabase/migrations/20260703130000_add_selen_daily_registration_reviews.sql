create table if not exists public.daily_registration_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.daily_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prerequisites_expected text,
  beneficiary_elements text,
  prerequisites_validated boolean,
  prerequisites_comment text,
  positioning_result text,
  starting_level text,
  adaptation_required boolean not null default false,
  adaptation_details text,
  decision text check (decision in ('maintained', 'adapted', 'redirected')),
  justification text,
  validated_at timestamptz,
  evaluator_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id)
);

create index if not exists daily_registration_reviews_user_idx
  on public.daily_registration_reviews(user_id, updated_at desc);

drop trigger if exists daily_registration_reviews_set_updated_at on public.daily_registration_reviews;
create trigger daily_registration_reviews_set_updated_at
before update on public.daily_registration_reviews
for each row execute function public.set_daily_updated_at();

alter table public.daily_registration_reviews enable row level security;
