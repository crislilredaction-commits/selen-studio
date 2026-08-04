# Selen Daily Lot 1A — Préparation locale des migrations

Date : 4 août 2026  
Branche : `chore/daily-lot1-foundation-audit`  
Mission : créer localement les migrations additives et tests SQL du sous-lot 1A, après sauvegardes PostgreSQL natives.  
Application distante : non effectuée.

## 1. Résumé exécutif

Les sauvegardes PostgreSQL natives ont été recréées depuis zéro avec les clients PostgreSQL 18.4 et une connexion Supabase Session Pooler compatible `pg_dump`.

Après validation des sauvegardes, trois migrations locales additives ont été préparées :

1. memberships, rôles cumulables, blocs de permissions et fonctions d’autorisation ;
2. journal d’audit Daily et métadonnées documentaires versionnées ;
3. durcissement ciblé de `public.organisations`.

Un test SQL transactionnel avec `ROLLBACK` a été ajouté pour valider la structure, les contraintes et les garde-fous RLS/grants après application dans un environnement contrôlé.

Aucun `db push`, aucune migration distante et aucune modification de données, Auth ou Storage n’ont été effectués.

## 2. État Git

État de départ vérifié :

- worktree : `C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-foundation-audit` ;
- branche : `chore/daily-lot1-foundation-audit` ;
- HEAD avant modifications : `cb4d41b59f93ea9dd1753027a8301f02891fd670` ;
- historique local attendu présent :
  - audit : `5e5c8148cfc1e1fb8c51335b434fdf6e947bb38d` ;
  - conception : `cb4d41b59f93ea9dd1753027a8301f02891fd670` ;
- aucun merge, rebase ou cherry-pick en cours ;
- worktree propre avant création des fichiers.

Le worktree principal et le fichier protégé `docs/selen-global-audit-and-cleanup-plan.md` n’ont pas été touchés.

## 3. Sauvegardes réalisées

Clients utilisés :

- `pg_dump` : PostgreSQL 18.4 ;
- `pg_restore` : PostgreSQL 18.4 ;
- `psql` : PostgreSQL 18.4 ;
- `pg_dumpall` : PostgreSQL 18.4.

Serveur distant vérifié en lecture seule :

- PostgreSQL 17.6 ;
- base : `postgres` ;
- connexion : Session Pooler Supabase port 5432 ;
- SSL : `require` ;
- GSS encryption : désactivé.

Le mot de passe a été fourni par `%APPDATA%\postgresql\pgpass.conf`. Le fichier n’a pas été lu, affiché, copié ni enregistré.

Dossier de sauvegarde :

`C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-backups-native-20260804-172748`

| Sauvegarde | Fichier | Taille | SHA-256 | Validation |
|---|---|---:|---|---|
| Schéma public | `public-schema.dump` | 782012 | `5E70A55F94D5B0488B17985B528A55AC7A057A2F543EADC333D2BE11E7AC0D0E` | `pg_restore --list` OK ; contient `organisations` et `daily_*` |
| Données public | `public-data.dump` | 754778327 | `0E7A4C278391C58E42F6AF6991FF4FB12833F30497959D08757A4DCC1E31F9CF` | `pg_restore --list` OK ; contient données `organisations` et `daily_*` |
| Rôles/grants | `globals-roles-grants-introspection.txt` | 217087 | `22AC0F72BE0C4F3647050BB0C6304026CD4524A3DFEEFE5742C092535AA4F732` | texte lisible ; contient rôles et grants utiles |
| Tables critiques | `critical-tables.dump` | 143762 | `33406C03B8C369AF29A251D6577A24CE1B2E47D3EFE4FDA0F30F100A695476B4` | `pg_restore --list` OK ; aucune table critique manquante |

Note sur `public-data.dump` : `pg_dump` a signalé des contraintes circulaires sur `documents`, `daily_formations`, `forge_missions` et `forge_mission_plans`. Le code de sortie est resté `0` et l’archive est lisible. Cette limite concerne surtout une restauration data-only isolée ; elle est documentée pour le plan de restauration.

Note sur les objets globaux : `pg_dumpall --globals-only` n’a pas été utilisé afin d’éviter tout risque d’export de secret ou hash sensible de rôle. Une introspection lecture seule des rôles et grants utiles a été produite à la place.

Le fichier invalide précédent reste isolé et exclu :

`C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-backups-20260804\public-schema.INVALID-0-BYTE.sql`

## 4. Liste des fichiers créés

- `supabase/migrations/20260804173000_daily_lot1a_foundation_memberships.sql`
- `supabase/migrations/20260804173100_daily_lot1a_audit_logs_and_documents.sql`
- `supabase/migrations/20260804173200_daily_lot1a_organisations_access_guards.sql`
- `supabase/tests/daily_lot1a_foundations_rls.test.sql`
- `docs/daily-lot1-foundations-migrations-preparation.md`

## 5. Liste des migrations créées

### `20260804173000_daily_lot1a_foundation_memberships.sql`

Crée :

- `organisation_memberships` ;
- `organisation_membership_roles` ;
- `organisation_membership_permission_blocks` ;
- fonctions d’autorisation Daily 1A ;
- RLS et policies des nouvelles tables ;
- grants explicites nécessaires à `authenticated`.

### `20260804173100_daily_lot1a_audit_logs_and_documents.sql`

Crée :

- `daily_audit_logs` ;
- `daily_documents` ;
- triggers d’append-only audit log ;
- trigger de verrouillage des documents signés ;
- index de timeline, objet, acteur, version courante ;
- RLS et grants.

### `20260804173200_daily_lot1a_organisations_access_guards.sql`

Prépare :

- révocation de l’accès `anon` direct à `organisations` ;
- retrait de `TRUNCATE`, `REFERENCES`, `TRIGGER` pour `authenticated` ;
- activation RLS sur `organisations` ;
- policies staff Selen et membres actifs ;
- commentaires de documentation.

Cette migration ne modifie pas `dossiers`, `documents`, `formations` ou `nda_variables`, conformément à la décision Lil.

## 6. Ordre des migrations

1. `20260804173000_daily_lot1a_foundation_memberships.sql`
2. `20260804173100_daily_lot1a_audit_logs_and_documents.sql`
3. `20260804173200_daily_lot1a_organisations_access_guards.sql`

L’ordre est important : les policies `organisations` utilisent les fonctions et tables créées par la première migration.

## 7. Détail de `organisation_memberships`

La table relie `auth.users` à `public.organisations`, sans créer de profil Daily parallèle.

Choix retenu :

- unicité globale `(organisation_id, user_id)` ;
- réactivation sans doublon ;
- `ON DELETE RESTRICT` pour `organisation_id` et `user_id` afin d’éviter les pertes d’historique ;
- désactivation par `status = 'disabled'`, `disabled_at` et `disable_reason`.

Statuts :

- `invited` ;
- `active` ;
- `disabled` ;
- `revoked`.

## 8. Détail des rôles

Table : `organisation_membership_roles`.

Rôles autorisés :

- `manager` ;
- `trainer` ;
- `admin_assistant`.

Les rôles sont cumulables par unicité `(membership_id, role)`.

## 9. Détail des blocs

Table : `organisation_membership_permission_blocks`.

Blocs autorisés :

- `company` ;
- `permanent_documents` ;
- `users` ;
- `trainings` ;
- `sessions` ;
- `monitoring` ;
- `settings` ;
- `exports`.

Le modèle reste volontairement par grands blocs, sans permissions microscopiques.

## 10. Fonctions d’autorisation

Fonctions créées :

- `daily_is_selen_staff()`
- `has_active_organisation_membership(uuid)`
- `has_organisation_role(uuid, text)`
- `has_organisation_permission_block(uuid, text)`
- `can_access_organisation(uuid)`
- `can_manage_organisation_users(uuid)`
- `can_manage_daily_sessions(uuid)`
- `can_manage_daily_documents(uuid)`

Toutes sont `SECURITY INVOKER`, avec `search_path` explicite.

## 11. Durcissement `organisations`

La migration cible :

- active RLS ;
- retire `anon` ;
- retire `TRUNCATE`, `REFERENCES`, `TRIGGER` à `authenticated` ;
- garde `authenticated` derrière RLS pour les routes Studio existantes ;
- permet aux staff Selen d’administrer ;
- permet aux membres actifs de lire leur organisme uniquement.

Aucune donnée ni FK existante n’est modifiée.

## 12. Grants

Pour les nouvelles tables :

- `anon` : aucun grant ;
- `authenticated` : uniquement les privilèges nécessaires derrière RLS ;
- aucun `TRUNCATE`, `REFERENCES` ou `TRIGGER` pour `authenticated` ;
- fonctions helpers : `EXECUTE` retiré à `PUBLIC`/`anon`, accordé à `authenticated` quand nécessaire ;
- fonctions de trigger : non exposées à `anon`/`authenticated`.

La contrainte Supabase 2026 sur l’exposition Data API des nouvelles tables publiques est prise en compte : les grants utiles sont explicites, mais l’exposition effective devra être vérifiée dans le dashboard/API Supabase avant application.

## 13. RLS

RLS activée sur :

- `organisation_memberships` ;
- `organisation_membership_roles` ;
- `organisation_membership_permission_blocks` ;
- `daily_audit_logs` ;
- `daily_documents` ;
- `organisations`.

Principes :

- staff Selen reconnu via les tables existantes `agent_profiles` et `selen_admin_users` ;
- membres actifs limités à leur organisation ;
- `daily_audit_logs` append-only ;
- documents Daily séparés par `organisation_id`.

## 14. Audit logs

`daily_audit_logs` stocke :

- organisation ;
- acteur ;
- rôle ;
- type/identifiant d’objet ;
- action ;
- horodatage ;
- avant/après limité ;
- contexte ;
- origine.

Garde-fous :

- pas de token brut dans `before_data`, `after_data` ou `context` ;
- update/delete client interdits par grants, RLS et trigger ;
- index par organisation, objet, acteur et action.

## 15. Documents versionnés

`daily_documents` stocke les métadonnées, pas les objets Storage eux-mêmes.

Garde-fous :

- version positive ;
- `storage_path` unique ;
- SHA-256 optionnel mais format contrôlé ;
- une seule version courante par objet logique ;
- document signé non modifiable sur ses champs structurants ;
- aucune suppression Storage ;
- aucune migration des documents V0.

## 16. Compatibilité Daily V0

Aucune table Daily V0 n’est supprimée, renommée ou backfillée.

Les migrations 1A sont additives. Les routes Daily V0 ne sont pas basculées dans cette mission.

## 17. Tests SQL

Test créé :

`supabase/tests/daily_lot1a_foundations_rls.test.sql`

Il est transactionnel :

- `begin` ;
- assertions pgTAP ;
- données de test ;
- `rollback`.

Il couvre notamment :

- présence des tables et fonctions ;
- RLS activée ;
- absence de grants dangereux ;
- contraintes de statuts/rôles/blocs ;
- rejet de SHA invalide ;
- journal d’audit ;
- index critiques ;
- policies critiques.

## 18. Résultats des tests

Les tests SQL n’ont pas été exécutés contre le distant, car les migrations ne sont pas appliquées et aucune écriture distante n’est autorisée.

Contrôles statiques effectués :

- recherche de commandes interdites dans les migrations/tests ;
- aucune occurrence de `supabase db dump`, `db push`, `drop table`, `truncate table`, `delete from`, modification `auth.*` ou `storage.objects` dans les fichiers créés ;
- `git diff --check` à exécuter avant commit final.

## 19. Dry-run

Aucun dry-run Supabase n’a été lancé.

Raison : la consigne finale interdit explicitement tout `db push`. Même `supabase db push --dry-run` est donc exclu dans cette mission.

## 20. Risques

| Risque | Statut |
|---|---|
| `public.organisations` est utilisée par des routes historiques | migration RLS préparée, application à tester en Preview avant production |
| RLS helpers `SECURITY INVOKER` dépendent des policies existantes `agent_profiles`/`selen_admin_users` | à valider avec tests transactionnels et compte staff réel |
| `public-data.dump` data-only signale des FK circulaires | documenté ; privilégier restauration complète ou contraintes désactivées si restauration data-only |
| Data API Supabase peut nécessiter exposition explicite | à vérifier avant application distante |
| Tests pgTAP supposent l’extension disponible dans l’environnement de test | à vérifier avant exécution |

## 21. Différences avec le rapport de conception

- `pg_dumpall --globals-only` remplacé par introspection sûre des rôles/grants pour éviter tout secret.
- Les fonctions d’autorisation sont toutes `SECURITY INVOKER`; aucune fonction `SECURITY DEFINER` n’a été introduite.
- L’attribution stricte opérateur Selen ↔ organisation reste hors périmètre.

## 22. Décisions techniques prises

- `organisation_memberships` avec unicité globale `(organisation_id, user_id)`.
- Rôles cumulables séparés de l’appartenance.
- Blocs de permissions séparés et grossiers.
- `daily_documents` comme table de métadonnées, sans déplacement Storage.
- `daily_audit_logs` append-only.
- Durcissement ciblé de `organisations`, sans toucher aux tables historiques liées.

## 23. Décisions encore nécessaires

- Valider si les managers pourront administrer les memberships directement en UI ou seulement via routes serveur contrôlées.
- Valider si l’audit log doit être lisible par tous les managers ou seulement sur demande/export.
- Valider la disponibilité de pgTAP dans l’environnement de test cible.
- Auditer Vitrine avant migration des tokens publics.

## 24. Plan d’application distante

À ne pas exécuter sans autorisation explicite.

1. Refaire les quatre sauvegardes natives.
2. Vérifier `supabase migration list`.
3. Lancer un dry-run uniquement si Lil autorise explicitement `supabase db push --dry-run`.
4. Vérifier que seules les migrations 1A attendues apparaissent.
5. Appliquer les migrations.
6. Exécuter les tests SQL transactionnels.
7. Vérifier RLS/grants en lecture seule.
8. Tester les routes historiques Studio utilisant `organisations`.
9. Vérifier Haïm Levi intact.

## 25. Plan de rollback

Si l’application distante future échoue :

- restaurer le schéma depuis `public-schema.dump` si nécessaire ;
- restaurer les tables critiques depuis `critical-tables.dump` si nécessaire ;
- ne jamais restaurer data-only sans tenir compte des FK circulaires documentées ;
- conserver `public-data.dump` comme filet global ;
- comparer grants et rôles avec `globals-roles-grants-introspection.txt`.

## 26. Conclusion

Les migrations locales Daily 1A sont prêtes pour revue technique.

Elles ne sont pas encore prêtes pour application distante sans :

- autorisation explicite de Lil ;
- dry-run autorisé ;
- tests SQL transactionnels sur une cible contrôlée ;
- vérification des routes historiques Studio ;
- contrôle final Data API/RLS/grants.

