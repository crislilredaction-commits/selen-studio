# Ordonnancement Supabase Cron du worker Telegram Forge

## Résultat

Branche : `feature/forge-telegram-supabase-cron`.

La migration `20260730150000_schedule_forge_telegram_worker.sql` installe
`pg_cron` 1.6.4 et `pg_net` 0.20.0, ajoute un historique métier protégé et
prépare le job `forge-telegram-worker-every-5-minutes`.

Le secret partagé existant de Vercel Production a été copié vers Supabase Vault
sous le nom `forge_telegram_worker_secret`. Sa valeur n’a jamais été affichée,
journalisée ou ajoutée au dépôt. Le job cible uniquement :

`https://studio.selen-editions.fr/agent/api/jobs/forge-telegram-alerts`

## État opérationnel

Le job a été créé avec la fréquence `*/5 * * * *`. Sa première exécution
`pg_cron` a réussi à mettre la requête `pg_net` en file, mais la production a
répondu HTTP `405`, car le nouveau worker n’est pas encore présent sur
`main`/Production.

Conformément à l’interdiction de merger ou déployer manuellement en production,
aucun déploiement Production n’a été déclenché. Le job a été immédiatement rendu
inactif avec `cron.alter_job(..., active := false)`. Il reste enregistré avec sa
fréquence et son historique, prêt à être réactivé après un futur déploiement
Production autorisé de ce code.

Le canal métier `forge_telegram_settings.enabled` est resté à `false`. Aucun
message Telegram réel n’a été envoyé.

## Sauvegardes PostgreSQL natives

Dossier Git ignoré :
`supabase/.temp/backups/20260730-forge-telegram-supabase-cron-valid`.

| Archive | Début | Fin | Taille | Entrées | SHA-256 | `pg_restore --list` |
|---|---|---|---:|---:|---|---|
| public-schema | 2026-07-30 13:27:44 +02:00 | 13:28:00 | 607 724 octets | 1 001 | `35D42A6BE5D400D94CC9AF2CDEECBC323C3C055EC1A6A5847D2653B4B7312F29` | succès |
| public-data | 2026-07-30 13:28:00 +02:00 | 13:37:33 | 754 788 206 octets | 103 | `14E9B4F3BF85EF12F28BF47E225572011C76F8B60C03D00432A6934F11B96ED7` | succès |
| migration-history-schema | 2026-07-30 13:37:42 +02:00 | 13:37:56 | 2 231 octets | 3 | `6AF3045DFD292504096ABF3C55A7A86A9BA3D61844A0A9342C67547A85B09946` | succès |
| migration-history-data | 2026-07-30 13:37:56 +02:00 | 13:38:10 | 34 738 octets | 1 | `E219FAE9A8FF1299668B9DDBFCA5F3C2F363A51E3FABFCECDDC9551FB474C378` | succès |

Chaque archive a utilisé un rôle temporaire renouvelé. Les quatre processus se
sont terminés avec succès et aucune archive vide n’a été acceptée.

## Objets et intégrité

- table `public.forge_telegram_worker_runs`, RLS activée ;
- lecture réservée aux administrateurs Forge ;
- aucune permission `anon` ;
- aucune écriture directe pour `authenticated` ;
- fonctions de début et fin réservées à `service_role` ;
- fonction d’installation du job inaccessible à `anon`, `authenticated` et
  `service_role` ;
- index unique de clé d’invocation ;
- index partiel garantissant une seule exécution `running` ;
- bail obsolète automatiquement clôturé après quinze minutes ;
- file Telegram existante toujours dédupliquée par alerte ;
- sérialisation native des occurrences d’un même job par `pg_cron`.

Les historiques restent disponibles dans `public.forge_telegram_worker_runs`,
`cron.job_run_details` et, pour les réponses réseau récentes,
`net._http_response`.

## Validations

- dry-run initial : uniquement `20260730150000`, aucun seed, aucun rôle ;
- migration appliquée avec succès ;
- historique local/distant aligné jusqu’à `20260730150000` ;
- dry-run final : vide ;
- tests PostgreSQL transactionnels avec `ROLLBACK` :
  création, refus d’un doublon, refus d’une exécution concurrente, finalisation
  et absence de donnée persistante ;
- tests Telegram mockés : 3/3 réussis, aucun réseau réel ;
- lint complet : succès, 18 avertissements préexistants hors périmètre ;
- TypeScript `tsc --noEmit` : succès ;
- build Next.js complet : succès ;
- avertissements préexistants `canvas`/PDF et `middleware`, sans échec.

## Worker

La route refuse toute exécution lorsque `VERCEL_ENV` n’est pas `production`.
Elle exige :

- le secret Bearer Production ;
- une clé d’invocation ;
- l’acquisition du verrou PostgreSQL.

Le mode `x-forge-dry-run: true` journalise une exécution mockée sans traiter la
file ni appeler Telegram. Ce mode ne pourra être validé contre la Production
qu’après le déploiement normal du worker.

## Prochaine étape obligatoire

Après une mission distincte autorisant le merge et le déploiement Production :

1. appeler le worker Production avec le secret Vault et
   `x-forge-dry-run: true` ;
2. vérifier HTTP 200 et l’historique `manual_mock` ;
3. vérifier une seconde invocation avec la même clé, qui doit être ignorée ;
4. réactiver le job avec `cron.alter_job(..., active := true)` ;
5. observer au moins une exécution HTTP 200 ;
6. conserver le canal métier Telegram désactivé jusqu’à une autorisation
   explicite d’envoyer un vrai message.

## Retour arrière

Le retour immédiat et non destructif est l’état actuel : job inactif. Une
suppression éventuelle doit utiliser `cron.unschedule` dans une mission
autorisée. Ne pas supprimer les extensions, car leur utilisation future ou par
d’autres intégrations doit d’abord être auditée.
