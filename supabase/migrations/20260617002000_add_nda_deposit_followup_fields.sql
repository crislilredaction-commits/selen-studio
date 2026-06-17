alter table public.nda_variables
  add column if not exists nda_deposit_specific_code text,
  add column if not exists nda_deposit_specific_code_label text,
  add column if not exists nda_deposit_status text,
  add column if not exists nda_deposit_submitted_at timestamptz,
  add column if not exists nda_deposit_refusal_received_at timestamptz,
  add column if not exists nda_obtained_at timestamptz;
