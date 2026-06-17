alter table public.nda_variables
  add column if not exists cv_manual_text text,
  add column if not exists program_manual_text text;
