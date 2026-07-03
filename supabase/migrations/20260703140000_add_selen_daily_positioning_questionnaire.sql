alter table public.daily_formations
  add column if not exists positioning_mode text not null default 'off_platform' check (
    positioning_mode in ('off_platform', 'selen')
  ),
  add column if not exists positioning_questions jsonb not null default '[]'::jsonb;
