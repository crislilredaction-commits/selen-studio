# Non-régression NDA — durcissement RLS historique

Date : 22 août 2026

## Objet

Vérifier que le durcissement RLS envisagé sur les tables historiques ne dépend pas d’un accès direct du navigateur client aux tables métier du parcours NDA.

## Architecture réellement contrôlée

Le site client utilise bien la session Supabase côté serveur pour vérifier l’identité de l’utilisateur, mais les lectures et écritures métier NDA sont effectuées avec un client serveur utilisant la service role, après contrôle explicite d’accès au dossier.

Le garde commun `lib/server/clientNdaAccess.ts` :

- récupère l’utilisateur authentifié via le client Supabase serveur lié à la session ;
- normalise son email ;
- charge le dossier via le client admin ;
- exige un dossier rattaché à une organisation ;
- charge l’organisation via le client admin ;
- compare l’email authentifié à l’email de l’organisation ;
- renvoie `401`, `403` ou `404` avant toute opération métier lorsque le contrôle échoue ;
- conserve un chemin distinct et journalisé pour l’assistance agent.

La liste des dossiers NDA suit la même logique : Auth via la session, puis requêtes métier `organisations` / `dossiers` avec le client admin.

## Routes critiques relues

### `POST /api/client/nda/deposit-submitted`

La route :

1. exige un `dossierId` ;
2. appelle `verifyClientNdaDossierAccess` avant toute lecture métier ;
3. bloque le mode assistance agent pour cette action ;
4. lit `nda_variables` via le client admin ;
5. vérifie que le dépôt officiel est ouvert ;
6. déduplique puis écrit le message système via le client admin ;
7. crée la notification agent ;
8. met à jour le suivi NDA via `nda_variables`.

Le durcissement RLS direct des tables historiques ne doit donc pas casser ce flux tant que la service role conserve son comportement serveur normal.

### `POST /api/client/nda/final-documents-submitted`

La route :

1. exige un `dossierId` ;
2. vérifie l’accès via `verifyClientNdaDossierAccess` ;
3. confirme le type NDA ;
4. déduplique puis écrit le message via le client admin ;
5. crée la notification agent ;
6. met éventuellement `dossiers.status` à `under_review` via le client admin ;
7. journalise explicitement le cas d’assistance agent.

Là encore, aucune écriture métier ne repose sur les grants directs du rôle `authenticated`.

### `POST /api/client/nda/refusal-letter`

La route :

1. exige le fichier et le `dossierId` ;
2. appelle `verifyClientNdaDossierAccess` avant l’upload ou toute écriture ;
3. dépose le courrier dans le bucket Storage `documents` via le client admin ;
4. crée la ligne `documents` via le client admin ;
5. crée le message système et la notification agent ;
6. met à jour `nda_variables` avec le statut `refusal_received` ;
7. journalise explicitement le mode assistance agent lorsqu’il est utilisé.

Cette route confirme donc aussi que les écritures sur `documents`, `messages` et `nda_variables` ne dépendent pas des grants directs `authenticated` sur les tables historiques.

## Conclusion pour le brouillon RLS

La cible actuelle reste cohérente :

- aucun accès direct `anon` aux dix tables historiques ;
- pas de policy client directe sur les neuf tables métier historiques ;
- lecture de son propre `profiles` seulement si nécessaire ;
- accès direct staff pour Studio ;
- parcours NDA client servi par les routes serveur qui valident l’identité et l’appartenance puis utilisent la service role.

## Point encore à vérifier avant migration permanente

Le garde commun et les trois routes NDA critiques d’écriture actuellement présentes sous `app/api/client/nda` ont été relus. Avant promotion du brouillon en migration permanente, il reste à contrôler les éventuels anciens écrans Vitrine/Studio qui utiliseraient encore un client Supabase de session directement sur les tables historiques, puis à effectuer la dernière revue des routes de lecture et de messagerie historiques déjà durcies côté Studio.

Aucune migration n’est appliquée par ce document et aucune donnée réelle n’est modifiée.
