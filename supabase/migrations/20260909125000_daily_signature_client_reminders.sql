-- Étend le moteur de relances existant aux signatures Daily.
-- Migration additive : aucun changement Auth/RLS, aucune suppression de données.

alter table public.client_reminders
  drop constraint if exists client_reminders_status_check;

alter table public.client_reminders
  add constraint client_reminders_status_check check (
    status in ('draft', 'ready', 'sent', 'ignored', 'postponed', 'resolved')
  );

alter table public.client_reminders
  drop constraint if exists client_reminders_type_check;

alter table public.client_reminders
  add constraint client_reminders_type_check check (
    reminder_type in (
      'preaudit_incomplete_15_days',
      'audit_blanc_booking_reminder_7_days',
      'audit_blanc_48h_reminder',
      'nda_inactive_9_days',
      'qualiopi_surveillance_window_open',
      'qualiopi_renewal_4_months',
      'qualiopi_certificate_expiry',
      'daily_signature_pending_72h'
    )
  );

comment on constraint client_reminders_type_check on public.client_reminders is
  'Types de relance reconnus, dont signature Daily en attente à H+72.';
