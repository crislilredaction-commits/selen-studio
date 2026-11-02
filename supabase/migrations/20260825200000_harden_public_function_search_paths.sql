-- Harden the search_path of public functions flagged by Supabase Security Advisor.
-- This migration intentionally changes only function configuration. It does not
-- alter function bodies, ownership, SECURITY DEFINER status, data, or grants.

alter function public.set_updated_at()
  set search_path = '';

alter function public.update_updated_at_column()
  set search_path = '';

alter function public.set_appointment_requests_updated_at()
  set search_path = '';

alter function public.set_client_reminders_updated_at()
  set search_path = '';

alter function public.set_external_audits_updated_at()
  set search_path = '';

alter function public.selion_set_updated_at()
  set search_path = '';

alter function public.set_lil_invoice_updated_at()
  set search_path = '';

alter function public.set_articles_updated_at()
  set search_path = '';

alter function public.set_daily_updated_at()
  set search_path = '';

alter function public.set_lil_billing_profiles_updated_at()
  set search_path = '';

alter function public.daily_normalize_subscription_price()
  set search_path = '';

alter function public.daily_registration_response_summary(uuid)
  set search_path = '';
