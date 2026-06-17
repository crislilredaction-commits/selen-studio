alter table public.nda_variables
  add column if not exists nda_phase_validations jsonb not null default '{}'::jsonb;
