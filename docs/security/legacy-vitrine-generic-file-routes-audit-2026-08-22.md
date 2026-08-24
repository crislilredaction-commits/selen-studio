# Audit des routes génériques fichiers NDA — 22 août 2026

## Objet

Vérifier les routes historiques de dépôt et téléchargement de fichiers situées hors du sous-arbre `/api/client/nda`, car elles utilisent elles aussi la table historique `documents` et le bucket Storage `documents`.

Référence Vitrine inspectée : `134a79914429e1cd0b0fd07077574cec8a2aa950`.

## Dépôt initial

`app/api/client/upload/route.ts`

- crée le client serveur privilégié via `getAdminSupabase()` ;
- appelle `verifyClientNdaDossierAccess()` avant l'upload ou l'insertion ;
- construit un chemin Storage borné par `organisation_id` et `dossierId` ;
- dépose le fichier avec le client admin ;
- crée ensuite la ligne `documents` avec le même client ;
- en assistance agent, journalise l'action après contrôle du périmètre.

Conclusion : le client authentifié n'a pas besoin d'un droit `INSERT` direct sur `documents` ni d'un accès direct au bucket pour ce parcours.

## Téléchargement

`app/api/client/documents/download/route.ts`

- exige `dossierId` et `documentId` ;
- contrôle d'abord l'accès au dossier via `verifyClientNdaDossierAccess()` ;
- recherche le document en imposant à la fois `id = documentId` et `dossier_id = dossierId` ;
- refuse les documents non marqués `is_visible_to_client` ;
- génère ensuite une URL signée de cinq minutes via le client admin ;
- journalise le téléchargement en mode assistance agent.

Conclusion : aucun droit `SELECT` direct sur la table historique `documents` ni accès Storage direct n'est nécessaire au navigateur client.

## Impact sur le projet RLS

Ces deux routes confirment la compatibilité de la cible actuellement préparée :

- retrait de tout accès direct `anon` à `documents` ;
- absence de policy client directe sur `documents` ;
- accès staff direct via `daily_is_selen_staff()` ;
- accès client aux fichiers exclusivement par routes serveur après vérification du dossier, de l'organisation et de la visibilité du document.

## Statut

Aucune migration de sécurité n'est appliquée. Cet audit complète les preuves de non-régression nécessaires avant promotion du brouillon RLS.

## À valider avec Lil

Aucun choix requis à ce stade.
