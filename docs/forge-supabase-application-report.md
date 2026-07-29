# Rapport d’application Supabase de La Forge

Date : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Statut : **arrêt contrôlé après dry-run, avant `db push`**

## Projet ciblé

- Nom confirmé par la CLI authentifiée : **Selen Studio**
- Référence : `pjbilmywwkpghhayftph`
- Région : `eu-west-2`
- État au moment du contrôle : `ACTIVE_HEALTHY`
- Migration Forge prévue :
  `supabase/migrations/20260729183000_create_forge_persistence.sql`

La sortie de `supabase projects list` associe explicitement cette référence au
projet Selen Studio. Deux autres projets accessibles ont des références
différentes et n’ont pas été liés.

## Commandes exécutées

```powershell
git branch --show-current
git status --short --branch
npx.cmd supabase projects list
npx.cmd supabase link --project-ref pjbilmywwkpghhayftph
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Résultats :

- branche active correcte ;
- CLI authentifiée ;
- cible Selen Studio confirmée ;
- liaison réussie avec `pjbilmywwkpghhayftph` ;
- historique local et distant comparé ;
- dry-run exécuté sans application de migration.

Aucun mot de passe, token ou clé n’a été transmis, affiché ou enregistré dans
le dépôt ou dans ce rapport.

## Résultat de l’historique des migrations

`supabase migration list` retourne 34 versions présentes localement et absentes
de l’historique distant. La colonne distante est vide pour chaque version, de
`20260616000000` à `20260729183000`.

L’historique local et l’historique distant ne sont donc pas synchronisés.
Aucune commande `migration repair` n’a été exécutée.

## Résultat du dry-run

Le dry-run a réussi techniquement, avec :

- `dryRun: true` ;
- `upToDate: false` ;
- aucune seed ;
- aucun rôle ;
- 34 migrations proposées.

Migrations que Supabase proposerait d’appliquer :

```text
20260616000000_create_articles.sql
20260617000000_add_nda_liste_formateurs_variables.sql
20260617001000_add_nda_phase_validations.sql
20260617002000_add_nda_deposit_followup_fields.sql
20260617003000_add_nda_manual_analysis_texts.sql
20260624000000_studio_read_vitrine_followup_tables.sql
20260625000000_create_client_reminders.sql
20260625001000_allow_completed_preaudit_results_after_access_expiration.sql
20260625002000_support_sav_v1.sql
20260626000000_create_external_audits_and_admin_refunds.sql
20260626001000_create_selen_payments_and_expenses.sql
20260626002000_support_reply_tokens_and_public_discount_codes.sql
20260626003000_seed_nda_tool_catalog.sql
20260629090000_external_audits_delivery_mode_reminders_and_meet.sql
20260629110000_create_lil_invoice_generator.sql
20260701090000_lil_invoice_statuses_and_email.sql
20260701100000_external_audit_lifecycle_to_invoice.sql
20260701110000_lil_billing_profiles.sql
20260701120000_lil_invoice_generated_deposited_statuses.sql
20260701130000_lil_invoice_settings_and_profile_details.sql
20260703090000_create_selen_daily_v1.sql
20260703100000_add_selen_daily_onboarding_and_subscription.sql
20260703110000_add_selen_daily_registration_flow.sql
20260703120000_add_selen_daily_registration_recipients.sql
20260703130000_add_selen_daily_registration_reviews.sql
20260703140000_add_selen_daily_positioning_questionnaire.sql
20260704100000_add_selen_daily_conventions.sql
20260704110000_add_selen_daily_convention_signatures.sql
20260704120000_add_selen_daily_portal_access_tokens.sql
20260704130000_add_selen_daily_before_training_documents.sql
20260705110000_stabilize_selen_daily_ux.sql
20260707100000_add_client_notification_pause.sql
20260707110000_create_agent_assistance_mode.sql
20260729183000_create_forge_persistence.sql
```

Le résultat ne satisfait pas la condition autorisant le vrai `db push`, car 33
migrations autres que celle de La Forge seraient également poussées.

## Migration appliquée

**Aucune migration appliquée.**

La commande suivante n’a pas été exécutée :

```powershell
npx.cmd supabase db push
```

Il n’y a eu ni `db reset`, ni suppression de table, ni `migration repair`.

## Objets créés

Aucun objet distant n’a été créé par cette intervention. Les quatre tables
`forge_*`, les fonctions Forge et leurs politiques RLS n’ont donc pas été
créées par cette tentative.

## Tests réalisés

### Contrôles réussis

- identité et état du projet ;
- correspondance entre le nom Selen Studio et la référence fournie ;
- liaison CLI ;
- lecture de l’historique des migrations ;
- dry-run non-mutant.

### Contrôles non réalisés

Les contrôles post-application ne sont pas applicables, puisque le push a été
interdit :

- présence des quatre tables `forge_*` ;
- présence de `forge_add_correction` et `forge_validate_mission` ;
- RLS activée et politiques présentes ;
- absence de données de démonstration ;
- preuve post-push qu’aucune autre table n’a été modifiée.

Les tests fonctionnels avec un compte Studio actif n’ont pas été exécutés :

- chargement de l’état vide ;
- création d’une première mission réelle ;
- modification et persistance de checklist ;
- correction, changement de statut et journal ;
- validation d’une mission.

URL de Preview testée : **aucune**.

## Anomalies

1. Les 33 migrations locales antérieures à La Forge sont absentes de
   l’historique distant retourné par la CLI.
2. Le dry-run propose donc 34 migrations au lieu de la seule migration Forge.
3. L’état réel de la base contient déjà des objets applicatifs observés lors de
   la revue préalable, ce qui suggère que le schéma et la table d’historique des
   migrations ont évolué par des chemins différents. Cette hypothèse doit être
   auditée ; elle ne justifie pas automatiquement un `migration repair`.

## Risques restants

- Un `db push` dans l’état actuel tenterait de rejouer 33 migrations
  historiques et pourrait échouer ou modifier des objets existants.
- Réparer l’historique sans preuve migration par migration pourrait marquer
  comme appliqué du SQL qui ne correspond pas exactement au schéma distant.
- Les douze tables existantes précédemment signalées sans RLS restent hors
  périmètre et n’ont pas été modifiées.
- La persistance Forge et son parcours Preview restent non testés.

## Reprise contrôlée recommandée

Avant toute nouvelle tentative, auditer séparément les 33 migrations
historiques et établir pour chacune si son effet est déjà présent sur la base.
Définir ensuite une stratégie d’alignement de l’historique explicitement validée.

Après cet alignement, reprendre par :

```powershell
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Ne lancer le vrai `db push` que si le nouveau dry-run désigne exclusivement :

```text
20260729183000_create_forge_persistence.sql
```

## Plan de retour arrière

Aucun retour arrière n’est requis pour cette tentative : le dry-run n’a produit
aucun changement distant.

Après une éventuelle application future, tout retour arrière devra passer par
une migration corrective dédiée et une sauvegarde préalable des données Forge.
Ne pas utiliser `db reset`, ne supprimer aucune table directement et ne pas
modifier les douze tables existantes signalées sans RLS.

## Garanties de périmètre

- aucun merge vers `main` ;
- aucun déploiement Vercel production ;
- aucune modification des douze tables existantes signalées sans RLS ;
- aucune suppression de table ;
- aucune migration appliquée.

## Tentative contrôlée du 29 juillet 2026 — arrêt sur sauvegarde

### Préconditions

- branche vérifiée : `feature/forge-cody-supabase` ;
- dépôt propre et synchronisé avec
  `origin/feature/forge-cody-supabase` avant la tentative ;
- projet lié : Selen Studio (`pjbilmywwkpghhayftph`) ;
- Supabase CLI : `2.110.0`.

La procédure imposait quatre sauvegardes valides avant toute modification
distante. Le dossier local choisi était :

```text
supabase/.temp/backups/20260729-forge-realignment/
```

Ce chemin est ignoré par Git. Aucun contenu de sauvegarde ni secret n'a été
affiché.

### Commandes de sauvegarde tentées

```powershell
npx.cmd supabase db dump --linked --schema public --file supabase/.temp/backups/20260729-forge-realignment/public-schema.sql
npx.cmd supabase db dump --linked --schema public --data-only --use-copy --file supabase/.temp/backups/20260729-forge-realignment/public-data.sql
npx.cmd supabase db dump --linked --schema supabase_migrations --file supabase/.temp/backups/20260729-forge-realignment/migration-history-schema.sql
npx.cmd supabase db dump --linked --schema supabase_migrations --data-only --use-copy --file supabase/.temp/backups/20260729-forge-realignment/migration-history-data.sql
```

Les quatre commandes ont échoué avec `LegacyDockerRunError` : Docker Desktop,
prérequis de `supabase db dump`, n'est pas disponible. Les quatre fichiers
créés par la CLI ont une taille de zéro octet et ne constituent donc pas des
sauvegardes valides.

La sauvegarde séparée des fonctions, politiques et grants concernés n'a pas été
tentée après cet échec, conformément à la consigne d'arrêt immédiat.

### État des opérations distantes

Aucune opération mutante n'a été exécutée :

- migration corrective
  `20260729173634_realign_daily_and_satisfaction_access.sql` non appliquée ;
- aucun `migration repair` ;
- aucun `db push` ;
- aucun objet ni donnée distante modifié.

Par conséquent, les vérifications post-application, `migration list` final et
`db push --dry-run` final n'ont pas été lancés. Il serait incorrect de prétendre
que seule Forge reste à appliquer tant que la sauvegarde, la correction et les
repairs validés n'ont pas abouti.

### Condition de reprise

Installer ou démarrer Docker Desktop, puis reprendre depuis le début des
sauvegardes. Les quatre dumps doivent terminer avec un code de sortie nul,
avoir une taille non nulle et recevoir une empreinte SHA-256 avant toute
application SQL. Les fichiers de zéro octet doivent être considérés comme
invalides et remplacés.

Alternative acceptable uniquement après validation humaine : produire des
sauvegardes restaurables équivalentes avec `pg_dump`/`psql` et une connexion
sécurisée, sans afficher ni enregistrer le mot de passe dans le dépôt ou le
rapport.

## Vérification et réalignement du 29 juillet 2026

### Contexte

Le correctif
`20260729173634_realign_daily_and_satisfaction_access.sql` a été exécuté
manuellement par l'utilisatrice dans le SQL Editor du projet Selen Studio. Le
SQL Editor a indiqué : `Success. No rows returned.`

La reprise décrite ci-dessous a commencé par une introspection exclusivement en
lecture seule. Aucun SQL métier supplémentaire n'a été appliqué.

### Vérifications post-correctif

Toutes les vérifications demandées sont conformes :

- `annual_period_start` et `annual_period_end` existent, sont de type `date`,
  non nulles et possèdent les valeurs par défaut attendues ;
- l'unique abonnement est toujours actif ;
- sa période est `2026-07-05` → `2027-07-05` ;
- `annual_period_end` est exactement douze mois après
  `annual_period_start` ;
- la contrainte
  `daily_subscriptions_annual_period_exact_year_check` est présente et
  validée ;
- les traces locales de création et d'acceptation tarifaire restent datées du
  5 juillet 2026 ;
- l'abonnement conserve son identifiant Stripe, sa session Checkout, le palier
  `base` et `tier_change_pending = false` ;
- la politique SELECT
  `Studio staff can read satisfaction surveys` existe pour `authenticated` ;
- aucune politique n'existe sur `lil_billing_profiles` ;
- aucune surcharge Daily `(uuid, integer)` ne subsiste ;
- les trois fonctions présentes ont uniquement la signature `(uuid)` :
  - `daily_refresh_subscription_period(uuid)` ;
  - `daily_annual_learner_count(uuid)` ;
  - `daily_prepare_upper_tier_if_needed(uuid)` ;
- les trois fonctions sont `security invoker` ;
- leurs ACL accordent EXECUTE à `service_role` et au propriétaire technique
  `postgres` uniquement ; `PUBLIC`, `anon` et `authenticated` n'ont aucun
  grant EXECUTE.

Les indicateurs métier disponibles avant et après correction restent
cohérents : une ligne d'abonnement active, même statut, mêmes traces Stripe,
même palier et aucun changement de palier en attente. Aucun changement métier
inattendu n'a été détecté dans le périmètre contrôlé.

### Repairs exécutés

Après conformité complète, exactement 34 versions documentées et validées ont
été marquées `applied`, individuellement et dans l'ordre chronologique. Chaque
commande a réussi :

```text
20260616000000
20260617000000
20260617001000
20260617002000
20260617003000
20260624000000
20260625000000
20260625001000
20260625002000
20260626000000
20260626001000
20260626002000
20260626003000
20260629090000
20260629110000
20260701090000
20260701100000
20260701110000
20260701120000
20260701130000
20260703090000
20260703100000
20260703110000
20260703120000
20260703130000
20260703140000
20260704100000
20260704110000
20260704120000
20260704130000
20260705110000
20260707100000
20260707110000
20260729173634
```

Ce total comprend :

- 29 migrations confirmées intégralement présentes ;
- les trois migrations partielles `20260624000000`, `20260701110000` et
  `20260703100000` ;
- la migration obsolète absorbée `20260701090000` ;
- la migration corrective `20260729173634`.

Aucun repair supplémentaire n'a été exécuté. Un repair a uniquement modifié
`supabase_migrations.schema_migrations` ; aucun SQL de migration historique n'a
été rejoué.

### État final de l'historique

La commande exécutée :

```powershell
npx.cmd supabase migration list --linked
```

montre une correspondance locale/distante pour les 34 versions, de
`20260616000000` à `20260729173634`. La seule version locale sans équivalent
distant est :

```text
20260729183000
```

### Résultat exact du dry-run

Commande exécutée :

```powershell
npx.cmd supabase db push --dry-run --linked
```

Résultat structuré de la CLI :

```json
{
  "upToDate": false,
  "dryRun": true,
  "migrations": [
    "20260729183000_create_forge_persistence.sql"
  ],
  "seeds": [],
  "roles": [],
  "message": "Finished supabase db push."
}
```

Sortie lisible :

```text
DRY RUN: migrations will not be pushed to the database.
Would push these migrations:
 • 20260729183000_create_forge_persistence.sql
```

Le résultat satisfait exactement la condition d'arrêt : seule la migration
Forge reste à appliquer.

### État d'arrêt et anomalies

- aucun vrai `db push` exécuté ;
- migration Forge non appliquée ;
- aucune anomalie détectée pendant l'introspection, les repairs ou le dry-run ;
- les sauvegardes CLI de la tentative précédente restent invalides, car Docker
  Desktop n'était pas disponible ; l'exécution manuelle du correctif a été
  réalisée par l'utilisatrice en dehors de cette tentative automatisée ;
- aucun merge vers `main` ;
- aucun déploiement Vercel, Preview ou production.

## Application de la migration Forge — 29 juillet 2026

### Dernier dry-run

Commande :

```powershell
npx.cmd supabase db push --dry-run --linked
```

Résultat :

```json
{
  "upToDate": false,
  "dryRun": true,
  "migrations": [
    "20260729183000_create_forge_persistence.sql"
  ],
  "seeds": [],
  "roles": [],
  "message": "Finished supabase db push."
}
```

Le garde-fou était conforme : Forge était l'unique migration proposée.

### Application

Commande :

```powershell
npx.cmd supabase db push --linked
```

Résultat :

```json
{
  "upToDate": false,
  "dryRun": false,
  "migrations": [
    "20260729183000_create_forge_persistence.sql"
  ],
  "seeds": [],
  "roles": [],
  "message": "Finished supabase db push."
}
```

La CLI a confirmé :

```text
Applying migration 20260729183000_create_forge_persistence.sql...
```

### Objets vérifiés en lecture seule

Les quatre tables existent :

- `public.forge_missions` ;
- `public.forge_activity_logs` ;
- `public.forge_validation_items` ;
- `public.forge_corrections`.

Contrôles conformes :

- RLS active sur les quatre tables ;
- quatre politiques ALL réservées à `authenticated`, conditionnées par un
  profil Studio actif de rôle `agent` ou `admin` ;
- aucune ligne présente dans les quatre tables immédiatement après migration :
  aucune donnée de démonstration ;
- cinq clés étrangères présentes ;
- `mission_id` utilise `ON DELETE CASCADE` dans activity logs, validation items
  et corrections ;
- `created_by` utilise `ON DELETE SET NULL` dans missions et corrections ;
- contrainte unique `(mission_id, position)` présente ;
- sept index métier présents, en plus des index de clés primaires et de la
  contrainte unique ;
- triggers `updated_at` présents et actifs sur missions et validation items ;
- `forge_add_correction(uuid, text)` et
  `forge_validate_mission(uuid)` présentes, `security invoker` et exécutables
  par `authenticated` ;
- aucun privilège table ni EXECUTE sur les deux fonctions métier pour `anon`.

La migration ne contient aucune modification de table préexistante, hormis
`create extension if not exists pgcrypto`, et aucun DML visant une autre table.
L'absence de sauvegarde exploitable empêche cependant une comparaison
exhaustive ligne par ligne de toutes les autres tables.

### Anomalie de grants bloquante

L'introspection a révélé un écart entre l'intention SQL et les droits effectifs.
Les ACL des quatre nouvelles tables sont :

```text
authenticated=arwdDxtm
```

Le rôle `authenticated` possède donc, en plus de
SELECT/INSERT/UPDATE/DELETE :

- `TRUNCATE` ;
- `REFERENCES` ;
- `TRIGGER`.

Ces privilèges proviennent des privilèges par défaut déjà actifs lors de la
création des tables. Le `grant select, insert, update, delete` de la migration
n'a pas retiré les droits supplémentaires. RLS ne protège pas `TRUNCATE` :
cet écart est donc bloquant.

Par ailleurs, `public.set_forge_updated_at()` conserve un ACL EXECUTE pour
`PUBLIC`, `anon` et `authenticated`. Les deux fonctions métier sont correctement
fermées à `anon`, mais l'exigence globale d'absence d'accès anonyme n'est pas
entièrement satisfaite.

La correction minimale recommandée, dans une nouvelle migration dédiée et
après validation, est :

```sql
revoke truncate, references, trigger
  on table public.forge_missions,
           public.forge_activity_logs,
           public.forge_validation_items,
           public.forge_corrections
  from authenticated;

revoke all on function public.set_forge_updated_at()
  from public, anon, authenticated;
```

Le propriétaire PostgreSQL conserve les droits nécessaires. L'exécution d'une
fonction trigger par un trigger existant ne nécessite pas de grant EXECUTE au
rôle qui modifie la ligne.

Cette correction n'a pas été créée ni appliquée dans ce run, car l'objectif
autorisait uniquement l'application de la migration Forge.

### Historique final

```powershell
npx.cmd supabase migration list --linked
```

La commande confirme que `20260729183000` est présente localement et au
distant. Toutes les migrations locales sont désormais alignées.

### Tests Preview et mission technique

Les tests Preview ont été arrêtés avant authentification et avant toute
création de donnée, en raison de l'anomalie de grants :

- `/agent/forge` non testé dans ce run ;
- `/agent/forge/cody` non testé dans ce run ;
- desktop et mobile non testés ;
- URL Preview non utilisée ;
- aucune capture produite ;
- aucune mission technique créée ;
- aucun item, note, correction, journal ou cycle de validation testé.

Cette décision évite de poursuivre un test fonctionnel sur un modèle
d'autorisation dont la vérification de sécurité a échoué.

### Prochaine étape recommandée

1. Créer et relire une migration corrective limitée aux revokes ci-dessus.
2. Effectuer un dry-run confirmant que cette correction est l'unique migration.
3. L'appliquer et vérifier les ACL effectifs ainsi que l'absence d'accès anon.
4. Reprendre ensuite les tests Preview desktop/mobile avec un compte Studio
   actif et créer la mission technique demandée.
5. Conserver la mission jusqu'à finalisation du rapport fonctionnel.

Aucun merge vers `main` et aucun déploiement Vercel manuel ou production n'ont
été effectués.
