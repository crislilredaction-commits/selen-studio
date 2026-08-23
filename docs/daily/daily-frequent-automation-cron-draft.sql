-- Selen Daily — brouillon Supabase Cron pour les automatismes fréquents
-- Date : 2026-08-23
-- IMPORTANT : ce fichier est un brouillon d'infrastructure. Il ne doit pas être appliqué
-- tant que les secrets n'ont pas été provisionnés et que les URLs de production n'ont pas
-- été vérifiées. Aucun secret n'est stocké dans le dépôt.
--
-- Dépendances applicatives :
--   Vitrine : GET https://selen-editions.fr/api/cron/daily-frequent-automation
--             protégé par Authorization: Bearer <CRON_SECRET>
--   Studio  : GET https://studio.selen-editions.fr/agent/api/jobs/send-message-email-digests
--             protégé par Authorization: Bearer <CRON_SECRET>
--
-- Dépendances Supabase vérifiées sur Selen Studio le 2026-08-23 :
--   pg_cron 1.6.4
--   pg_net 0.20.0
--   supabase_vault 0.3.1
--
-- Secrets Vault attendus, à provisionner hors dépôt :
--   daily_attendance_cron_secret
--   daily_message_digest_cron_secret
--
-- Les deux jobs sont volontairement séparés : un échec du site ne doit pas empêcher
-- le rappel des messages Studio, et inversement.

-- 1. Émargements : exécution toutes les 10 minutes.
select cron.schedule(
  'daily-attendance-automation-every-10-minutes',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://selen-editions.fr/api/cron/daily-frequent-automation',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'daily_attendance_cron_secret'
          limit 1
        )
      ),
      timeout_milliseconds := 15000
    )
    where exists (
      select 1
      from vault.decrypted_secrets
      where name = 'daily_attendance_cron_secret'
    );
  $cron$
);

-- 2. Messages clients non lus : même cadence de 10 minutes.
select cron.schedule(
  'daily-message-digests-every-10-minutes',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := 'https://studio.selen-editions.fr/agent/api/jobs/send-message-email-digests',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'daily_message_digest_cron_secret'
          limit 1
        )
      ),
      timeout_milliseconds := 15000
    )
    where exists (
      select 1
      from vault.decrypted_secrets
      where name = 'daily_message_digest_cron_secret'
    );
  $cron$
);

-- Contrôle attendu après activation :
-- select jobid, jobname, schedule, active
-- from cron.job
-- where jobname in (
--   'daily-attendance-automation-every-10-minutes',
--   'daily-message-digests-every-10-minutes'
-- )
-- order by jobname;
--
-- Contrôle des exécutions :
-- select jobid, status, return_message, start_time, end_time
-- from cron.job_run_details
-- where jobid in (
--   select jobid from cron.job
--   where jobname in (
--     'daily-attendance-automation-every-10-minutes',
--     'daily-message-digests-every-10-minutes'
--   )
-- )
-- order by start_time desc
-- limit 20;
