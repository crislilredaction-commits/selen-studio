# Plan de réalignement des migrations Supabase

Date : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Projet : **Selen Studio** (`pjbilmywwkpghhayftph`)
Statut : préparation locale uniquement

## Décisions

La période annuelle Selen Daily est une période glissante de douze mois
commençant à la souscription. La migration corrective locale
`20260729173634_realign_daily_and_satisfaction_access.sql` :

1. restaure `annual_period_start` et `annual_period_end` si nécessaire ;
2. initialise uniquement les bornes absentes ;
3. impose une durée exacte de douze mois ;
4. renouvelle la période lorsque son échéance est atteinte ;
5. compte les apprenants dans la seule période active ;
6. remplace les surcharges distantes à `p_year` par les signatures historiques
   à un argument ;
7. conserve `security invoker` et réserve l'exécution au `service_role` ;
8. restaure la politique SELECT Satisfaction déjà validée ;
9. ne modifie ni Billing, ni les statuts de facture, ni les douze tables sans
   RLS hors périmètre.

Aucune commande distante mutante n'a été exécutée.

## État distant vérifié

`daily_subscriptions` possède actuellement les colonnes :

`id`, `user_id`, `status`, `annual_learner_limit`,
`base_monthly_amount_cents`, `upper_monthly_amount_cents`, `current_tier`,
`tier_change_pending`, `tier_change_prepared_at`, les identifiants Stripe,
`pricing_rule_accepted_at`, `pricing_rule_accepted_version`, `created_at` et
`updated_at`.

Les colonnes `annual_period_start` et `annual_period_end` sont absentes.
Une seule ligne existe : elle est active, possède un abonnement et une session
Checkout Stripe, et ses dates locales de création et d'acceptation des règles
tarifaires sont toutes deux le 5 juillet 2026.

Le schéma ne conserve pas le `current_period_start` Stripe. La source locale
retenue pour la reprise est donc :

1. `pricing_rule_accepted_at` ramené à sa date UTC ;
2. à défaut, `created_at` ramené à sa date UTC ;
3. `current_date` uniquement comme dernier repli défensif.

Pour les futures souscriptions, le workflow serveur devra renseigner
explicitement `annual_period_start` avec la date d'activation Stripe. Les
valeurs par défaut ne sont qu'un filet de sécurité.

## Modèle annuel glissant

L'intervalle actif est semi-ouvert :

```text
[annual_period_start, annual_period_end)
```

`annual_period_end` vaut exactement `annual_period_start + 1 year`. À
l'échéance, `daily_refresh_subscription_period(uuid)` verrouille l'abonnement
actif et avance les deux bornes par pas d'un an jusqu'à ce que la date courante
soit dans la nouvelle période. Cette boucle couvre aussi plusieurs échéances
manquées. Le changement de palier en attente est remis à zéro uniquement quand
une période a réellement avancé.

`daily_annual_learner_count(uuid)` rafraîchit d'abord la période, puis compte
chaque session non archivée ayant au moins un bloc planifié dans l'intervalle
actif. Les dates JSON invalides sont ignorées. La fonction ne prend plus
`p_year`.

`daily_prepare_upper_tier_if_needed(uuid)` utilise ce compte et met à jour le
palier de l'abonnement actif.

## Idempotence et traitement des lignes existantes

- `add column if not exists` restaure les bornes manquantes ;
- les `update` ciblent exclusivement les valeurs nulles et n'écrasent aucune
  paire existante ;
- une paire existante différente de douze mois provoque un arrêt explicite ;
- les colonnes deviennent ensuite `not null` ;
- la contrainte nommée est créée uniquement si elle est absente ;
- les fonctions sont recréées avec `create or replace` ;
- les surcharges `(uuid, integer)` sont supprimées conditionnellement.

L'application future modifiera nécessairement l'unique ligne existante pour
ajouter ses deux bornes. Elle ne modifie aucune autre donnée métier.

## Sécurité et appels

Les trois fonctions sont `security invoker` avec un `search_path` vide.
L'exécution est révoquée à `PUBLIC`, `anon` et `authenticated`, puis accordée
uniquement à `service_role`. Ce choix est nécessaire car le rafraîchissement et
la préparation du palier écrivent dans `daily_subscriptions` sous RLS.

Aucun appel RPC Daily annuel n'existe actuellement dans le dépôt. Un futur
appel doit passer par une route serveur authentifiée et autorisée avant
d'utiliser le client service-role.

La politique Satisfaction reste restaurée pour les profils Studio actifs
`agent` ou `admin`, car la page navigateur lit directement
`satisfaction_surveys`. Billing reste accessible uniquement par ses routes
serveur propriétaires et n'est pas modifié.

## Ordre recommandé de réalignement

1. Effectuer et tester une sauvegarde du schéma, des données et de
   `supabase_migrations.schema_migrations`.
2. Relire les 29 migrations historiques classées intégralement présentes dans
   `supabase-migration-history-audit.md`.
3. Décider humainement du traitement des migrations partielles Satisfaction,
   Billing et Daily.
4. Appliquer séparément la migration corrective, jamais par un `db push`
   global tant que l'historique est désynchronisé.
5. Vérifier les bornes Daily, les trois fonctions, les grants et la politique
   Satisfaction.
6. Seulement après validation, proposer les commandes `migration repair`
   unitaires documentées dans l'audit.
7. Relancer `migration list`, puis `db push --dry-run`. La seule migration
   proposée devra être `20260729183000_create_forge_persistence.sql`.

Les commandes mutantes ci-dessous sont proposées pour une étape future et
n'ont pas été exécutées :

```powershell
npx.cmd supabase db query --linked --file supabase/migrations/20260729173634_realign_daily_and_satisfaction_access.sql
npx.cmd supabase migration repair <version-validée> --status applied
```

## Vérifications post-application futures

- bornes présentes, non nulles et séparées de douze mois ;
- ligne existante initialisée au 5 juillet 2026 sans autre donnée modifiée ;
- période active correcte avant, pendant et après une échéance ;
- rattrapage correct après plusieurs années ;
- comptage excluant les blocs avant le début et à partir de la fin ;
- absence des signatures `(uuid, integer)` ;
- trois signatures `(uuid)` en `security invoker` ;
- exécution interdite à `PUBLIC`, `anon` et `authenticated` ;
- exécution accordée seulement à `service_role` ;
- politique Satisfaction présente ;
- aucun changement Billing ou sur les tables hors périmètre.

## Plan de retour arrière

Avant toute application : dump restaurable, export séparé de
`daily_subscriptions`, capture des fonctions, politiques et grants, et test de
restauration sur une cible isolée.

En cas d'échec après application :

1. restaurer les définitions et grants précédents depuis la sauvegarde ;
2. restaurer la ligne `daily_subscriptions` exportée ;
3. ne supprimer les colonnes ajoutées qu'après preuve qu'aucun consommateur ne
   les utilise et validation explicite ;
4. annuler individuellement un éventuel marquage historique avec
   `migration repair <version> --status reverted`, jamais avec `db reset`.

## Risques restants

1. La date Stripe d'activation exacte n'est pas stockée : le 5 juillet 2026 est
   une approximation locale étayée, pas une preuve du timestamp Stripe.
2. Le futur webhook ou workflow de souscription doit écrire explicitement les
   bornes à partir de Stripe.
3. Des consommateurs externes au dépôt pourraient utiliser les surcharges
   `p_year` ou compter sur un grant `authenticated`.
4. Le comptage additionne les bénéficiaires d'une session une fois dès qu'au
   moins un bloc tombe dans la période ; une session chevauchant deux périodes
   relève donc de la période de chacun de ses blocs lors du calcul.
5. Aucun SQL de correction ne doit être appliqué avant sauvegarde et validation
   humaine du réalignement global.

## Garanties de cette étape

- la migration passe le parseur PostgreSQL (`libpg-query`, 19 instructions) ;
- `npm.cmd run lint` réussit avec 0 erreur et 18 avertissements préexistants ;
- `npm.cmd run build` réussit, avec les avertissements préexistants
  `pdfjs/canvas` et Next.js `middleware` ;
- aucun `db push`, `migration repair` ou reset ;
- aucun objet ni donnée distante modifié ;
- aucun SQL historique modifié ;
- aucun changement Satisfaction/Billing au-delà des décisions validées ;
- aucun merge et aucun déploiement de production.
