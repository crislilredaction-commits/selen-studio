# Audit des routes Vitrine NDA — 22 août 2026

## Objet

Vérifier que le durcissement RLS proposé pour les dix tables historiques n'interrompt pas les parcours NDA client actuels de `selen-editions-site`.

Aucune migration ni modification de données n'est appliquée dans ce lot.

## Référence inspectée

- dépôt : `crislilredaction-commits/selen-editions-site`
- commit : `134a79914429e1cd0b0fd07077574cec8a2aa950`

## Modèle d'accès confirmé

Le module `lib/server/clientNdaAccess.ts` sépare bien :

1. le client Supabase lié aux cookies, utilisé pour `auth.getUser()` ;
2. le client serveur créé avec `SUPABASE_SERVICE_ROLE_KEY`, utilisé pour lire et écrire les données métier ;
3. une vérification explicite du dossier NDA et de son organisation avant tout accès métier ;
4. en mode client, une comparaison normalisée entre l'email authentifié et l'email de l'organisation rattachée au dossier ;
5. en assistance agent, un contrôle du jeton d'assistance et du périmètre organisation/dossier.

Ce modèle est compatible avec un accès direct aux tables historiques limité au staff, puisque les parcours client passent par les routes serveur vérifiées et non par des requêtes directes du navigateur vers ces tables.

## Routes vérifiées

### Messagerie NDA

`app/api/client/messages/list/route.ts`

- exige `dossierId` ;
- crée le client admin avec `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant lecture ;
- lit ensuite `messages` avec le client serveur privilégié.

`app/api/client/messages/send/route.ts`

- exige dossier et contenu ;
- contrôle le dossier avec `verifyClientNdaDossierAccess()` ;
- écrit ensuite dans `messages` avec le client serveur privilégié ;
- crée la notification agent après l'écriture contrôlée.

### Programme

`app/api/client/program/latest/route.ts`

- contrôle le dossier via `verifyClientNdaDossierAccess()` ;
- lit ensuite `dossier_program_versions` avec le client serveur privilégié.

### État du dossier NDA

`app/api/client/dossier/state/route.ts`

- contrôle le dossier via `verifyClientNdaDossierAccess()` avant toute lecture métier ;
- lit ensuite notamment `nda_variables`, `documents` et `dossier_program_versions` avec le client serveur privilégié ;
- le navigateur ne reçoit qu'un payload construit par la route après filtrage des documents et calcul de l'état du parcours.

## Test staff complémentaire

Un test transactionnel avec rôle PostgreSQL `authenticated` et claims d'un compte staff actif a été exécuté sur Supabase Selen Studio, puis annulé par `ROLLBACK`.

Résultat de visibilité staff constaté dans la transaction :

- `dossiers` : 5 lignes ;
- `documents` : 16 lignes ;
- `messages` : 3 lignes ;
- `nda_variables` : 2 lignes ;
- `dossier_program_versions` : 5 lignes.

Aucune donnée n'a été conservée ou modifiée par ce test.

## Conclusion intermédiaire

Le périmètre inspecté confirme que les principaux parcours NDA client utilisent déjà un modèle serveur compatible avec le projet de policies :

- `anon` : aucun accès direct aux dix tables historiques ;
- client authentifié non staff : pas d'accès direct aux neuf tables métier historiques ;
- `profiles` : auto-lecture minimale conservée pour compatibilité ;
- staff actif : accès direct contrôlé par `daily_is_selen_staff()` ;
- routes client NDA : accès métier via `service_role` uniquement après contrôle explicite du dossier et de l'organisation.

## Gates restant avant promotion en migration

- inspecter les autres routes NDA d'écriture : dépôt, documents finaux, refus, upload et décisions programme ;
- vérifier les derniers écrans Studio qui utilisent encore directement le client de session Supabase ;
- effectuer les tests de non-régression des routes NDA essentielles avec un dossier de test ou des vérifications sans effet ;
- tester les opérations staff prévues sans déclencher d'effet externe ;
- seulement ensuite promouvoir le brouillon SQL de `docs/security/legacy-table-rls-hardening-draft.sql` vers `supabase/migrations` et exécuter les Security Advisors.

## À valider avec Lil

Aucun nouveau point métier à valider à ce stade. La migration reste volontairement non appliquée tant que les gates ci-dessus ne sont pas tous franchis.
