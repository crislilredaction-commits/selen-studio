# Compatibilité NDA avec le futur durcissement RLS

Date : 23 août 2026

## Objet

Vérifier que le parcours NDA client actuellement servi par `selen-editions-site` ne dépend pas d'un accès navigateur direct aux dix tables historiques ciblées par le futur durcissement RLS de Selen Studio.

## État inspecté

Branche Vitrine inspectée : `feature/daily-lot4ci-frequent-automation-endpoint`.

Parcours principal inspecté : `/client/dossier/[id]` et routes serveur associées.

### Accès navigateur

La page client instancie le client Supabase navigateur principalement pour vérifier la session Auth avec `supabase.auth.getUser()`.

Les données métier du dossier ne sont pas chargées directement depuis `dossiers`, `documents`, `nda_variables`, `messages` ou `dossier_program_versions` dans le composant client inspecté. Elles sont chargées via des routes serveur, notamment :

- `GET /api/client/dossier/state` ;
- `POST /api/client/dossier/step-1` ;
- `POST /api/client/dossier/step-2` ;
- `POST /api/client/upload` ;
- `POST /api/client/dossier/final-upload` ;
- `GET /api/client/program/latest` ;
- `GET /api/client/messages/list` ;
- `POST /api/client/messages/send` ;
- `POST /api/client/messages/read-client` ;
- routes NDA de dépôt officiel, documents finaux et refus DREETS.

### Contrôle d'accès serveur

Le socle `lib/server/clientNdaAccess.ts` :

1. vérifie la session utilisateur avec le client Supabase serveur lié aux cookies ;
2. récupère l'email authentifié ;
3. utilise ensuite un client Supabase admin basé sur `SUPABASE_SERVICE_ROLE_KEY` pour les lectures et écritures métier ;
4. borne le dossier à son `organisation_id` ;
5. pour le mode client historique, vérifie que l'email de l'organisation correspond à l'email authentifié ;
6. gère séparément le mode assistance agent avec un jeton d'assistance vérifié.

Ce modèle est compatible avec une suppression des accès directs `anon` et avec des policies `authenticated` très restrictives sur les tables historiques, puisque les opérations métier passent par la service role après autorisation applicative explicite.

## Routes NDA vérifiées

### `POST /api/client/nda/deposit-submitted`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant toute lecture/écriture ;
- lit et met à jour `nda_variables` ;
- lit/écrit `messages` ;
- crée une notification agent ;
- aucune dépendance identifiée à une policy client directe sur les tables historiques.

### `POST /api/client/nda/final-documents-submitted`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant toute lecture/écriture ;
- lit/écrit `messages` ;
- met à jour `dossiers` ;
- crée une notification agent ;
- aucune dépendance identifiée à une policy client directe sur les tables historiques.

### `POST /api/client/nda/refusal-letter`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant l'upload ;
- écrit dans Storage avec le client admin ;
- insère dans `documents` ;
- insère dans `messages` ;
- met à jour `nda_variables` ;
- crée une notification agent ;
- aucune dépendance identifiée à une policy client directe sur les tables historiques.

### `GET /api/client/dossier/state`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant de charger l'état ;
- lit ensuite les données NDA via le client admin ;
- confirme que le chargement principal du dossier client reste côté serveur privilégié après contrôle d'accès.

### `POST /api/client/dossier/step-1`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant toute modification ;
- met à jour `organisations`, `nda_variables` et éventuellement le statut de `dossiers` avec le client admin ;
- aucune écriture navigateur directe sur les tables historiques.

### `POST /api/client/dossier/step-2`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant toute lecture/écriture ;
- lit puis met à jour `nda_variables` côté serveur ;
- aucune dépendance identifiée à une policy client directe.

### `POST /api/client/upload`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant l'upload ;
- écrit dans Storage puis dans `documents` avec le client admin ;
- aucune écriture navigateur directe sur `documents`.

### `POST /api/client/dossier/final-upload`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant l'upload ;
- écrit dans Storage puis dans `documents` avec le client admin ;
- aucune dépendance identifiée à une policy client directe.

### `GET /api/client/program/latest`

- utilise `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant la lecture ;
- lit `dossier_program_versions` avec le client admin ;
- confirme que la lecture du programme client ne nécessite pas de SELECT direct `authenticated` sur cette table.

### Messagerie client

Le composant `ClientMessagingPanel` n'accède pas directement à Supabase. Il passe par :

- `GET /api/client/messages/list` ;
- `POST /api/client/messages/send` ;
- `POST /api/client/messages/read-client`.

Ces trois routes utilisent `getAdminSupabase()` puis `verifyClientNdaDossierAccess()` avant de lire ou écrire `messages`. Le durcissement RLS des tables historiques ne casse donc pas la messagerie client normale.

Un point distinct a été repéré : ces routes n'envoient actuellement pas l'objet `Request` à `verifyClientNdaDossierAccess()`, et `ClientMessagingPanel` utilise `fetch()` plutôt que le helper `assistanceFetch()`. Le mode client normal reste correctement protégé, mais la messagerie peut être indisponible en mode assistance agent. Ce défaut est indépendant du durcissement RLS et doit être corrigé dans un lot applicatif séparé afin de ne pas mélanger sécurité base et comportement d'assistance.

## Conclusion provisoire

Le parcours NDA client principal inspecté confirme le modèle retenu dans le brouillon RLS :

- `anon` : aucun accès direct aux dix tables historiques ;
- `authenticated` non-staff : pas d'accès métier direct aux neuf tables historiques ;
- `profiles` : lecture de son propre profil seulement, plus accès staff ;
- staff : accès contrôlé par `daily_is_selen_staff()` ;
- clients NDA : accès métier uniquement via les routes serveur qui vérifient explicitement le dossier / l'organisation puis utilisent la service role.

## État du Security Advisor avant migration

Le contrôle Security Advisor du projet Selen Studio confirme toujours les dix alertes `RLS Disabled in Public` correspondant exactement aux tables ciblées. Les autres alertes existantes (vue security definer, fonctions security definer exécutables, search_path mutable, tables RLS sans policy, protection mots de passe compromis) restent hors périmètre de ce lot et ne doivent pas être mélangées à la migration historique.

## Vérifications restant à faire avant migration permanente

- tester les écritures Studio staff avec le brouillon RLS dans une transaction avec rollback ;
- tester au moins un parcours NDA complet en conditions de session authentifiée ;
- relancer les Security Advisors après application permanente seulement.

Aucune modification RLS permanente n'est autorisée par ce document ; il s'agit d'une preuve de compatibilité supplémentaire avant promotion du brouillon en migration.
