-- Daily Lot 4AU — timestamped finger signature for public registration files
-- Additive only. Reuses the audit fields already used by Daily convention signatures.

alter table public.daily_registration_responses
  add column if not exists signature_consent_text text,
  add column if not exists signature_data text,
  add column if not exists signature_proof_hash text,
  add column if not exists signature_signed_at timestamptz,
  add column if not exists signature_ip_address text,
  add column if not exists signature_user_agent text;

alter table public.daily_formation_registration_requests
  add column if not exists signature_consent_text text,
  add column if not exists signature_data text,
  add column if not exists signature_proof_hash text,
  add column if not exists signature_signed_at timestamptz,
  add column if not exists signature_ip_address text,
  add column if not exists signature_user_agent text;

comment on column public.daily_registration_responses.signature_consent_text is
  'Consent text accepted by the applicant when signing the registration file.';
comment on column public.daily_registration_responses.signature_data is
  'Finger signature image captured as a PNG data URL by the controlled public registration route.';
comment on column public.daily_registration_responses.signature_proof_hash is
  'SHA-256 proof hash covering the registration target, applicant, timestamp, consent text and signature.';
comment on column public.daily_registration_responses.signature_signed_at is
  'Timestamp recorded when the applicant signed the registration file.';
comment on column public.daily_registration_responses.signature_ip_address is
  'Request IP address retained as part of the registration signature proof.';
comment on column public.daily_registration_responses.signature_user_agent is
  'Request user agent retained as part of the registration signature proof.';

comment on column public.daily_formation_registration_requests.signature_consent_text is
  'Consent text accepted by the applicant when signing the spontaneous registration file.';
comment on column public.daily_formation_registration_requests.signature_data is
  'Finger signature image captured as a PNG data URL by the controlled public registration route.';
comment on column public.daily_formation_registration_requests.signature_proof_hash is
  'SHA-256 proof hash covering the registration target, applicant, timestamp, consent text and signature.';
comment on column public.daily_formation_registration_requests.signature_signed_at is
  'Timestamp recorded when the applicant signed the spontaneous registration file.';
comment on column public.daily_formation_registration_requests.signature_ip_address is
  'Request IP address retained as part of the registration signature proof.';
comment on column public.daily_formation_registration_requests.signature_user_agent is
  'Request user agent retained as part of the registration signature proof.';
