# Rapports de mission Cody — rapport d’implémentation

Date : 29 juillet 2026
Branche : `feature/forge-cody-reports`
Dépôt : `selen-studio`

## Architecture choisie

Les rapports suivent le modèle client existant de La Forge :

- chargement par le client Supabase du navigateur dans
  `src/lib/forge/data-access.ts` ;
- relation un-à-un entre `forge_missions` et `forge_mission_reports` ;
- état de mission rechargé après chaque génération ;
- génération Markdown déterministe côté navigateur, sans API externe ;
- affichage intégré au détail de la mission ;
- copie via Clipboard API et téléchargement via Blob navigateur ;
- journal écrit dans `forge_activity_logs`.

Le rapport est volontairement séparé de la mission. Cette séparation évite de
surcharger `forge_missions`, permet de gérer les statuts de génération et
autorise une future alimentation par Codex sans modifier le contrat principal
des missions.

## Migration créée

`supabase/migrations/20260729211718_create_forge_mission_reports.sql`

La CLI Supabase 2.110.0 a été appelée deux fois avec
`supabase migration new create_forge_mission_reports`, mais a échoué sous
Windows avec `LegacyMigrationNewWriteError` en tentant de recréer le dossier
`supabase/migrations`. Le fichier a donc été créé avec le timestamp système
courant, puis validé par un parseur PostgreSQL.

La migration :

- crée `forge_mission_reports` ;
- impose une relation unique avec `forge_missions` et `ON DELETE CASCADE` ;
- ajoute les contraintes de statut, de compteurs et de tableaux JSON ;
- crée les index de statut et de date de génération ;
- réutilise `set_forge_updated_at()` pour le trigger `updated_at` ;
- marque un rapport `outdated` quand la mission ou sa checklist change ;
- étend les événements du journal avec :
  - `report_generated` ;
  - `report_updated` ;
  - `report_failed` ;
- active RLS ;
- réserve la politique aux profils Studio actifs `agent` ou `admin` ;
- révoque tous les droits `anon` ;
- révoque tous les droits `authenticated`, puis réaccorde uniquement SELECT,
  INSERT, UPDATE et DELETE ;
- retire l’exécution publique des deux nouvelles fonctions trigger.

Aucune donnée de démonstration n’est insérée par la migration.

## Structure du rapport

La synthèse persistée comprend :

- statut et date de génération ;
- résumé ;
- compteurs de fichiers créés, modifiés et supprimés ;
- lint, build et tests ;
- dépôt, branche, commit et Preview ;
- risques, limites et tests manuels ;
- prochaine recommandation.

Le Markdown complet contient :

1. Identification ;
2. Demande initiale ;
3. Travail réalisé ;
4. Base de données ;
5. Sécurité ;
6. Tests ;
7. Git et déploiement ;
8. Vérifications utilisateur ;
9. Écarts et limites ;
10. Risques ;
11. Recommandation finale.

## Fichiers créés

- `src/components/forge/MissionReportPanel.tsx` : synthèse, vue Markdown,
  copie, téléchargement et génération ;
- `src/lib/forge/report-generator.ts` : construction déterministe du rapport
  de démonstration ;
- `supabase/migrations/20260729211718_create_forge_mission_reports.sql` :
  persistance et sécurité ;
- `docs/forge-cody-reports-implementation.md` : présent rapport.

## Fichiers modifiés

- `src/components/forge/CodyWorkspace.tsx` : orchestration de génération ;
- `src/components/forge/MissionDetail.tsx` : insertion de la section rapport ;
- `src/components/forge/ActivityJournal.tsx` : icônes des nouveaux événements ;
- `src/lib/forge/data-access.ts` : lecture, mapping, upsert et journal ;
- `src/lib/forge/types.ts` : types rapport et événements ;
- `src/lib/forge/labels.ts` : libellés du journal ;
- `src/app/agent/forge/forge.css` : carte, actions et responsive.

## Fonctionnement de la génération

L’action « Générer le rapport de démonstration » :

1. construit un Markdown à partir de la mission et de sa checklist ;
2. place le rapport en statut `generating` par upsert ;
3. enregistre la synthèse, les données structurées et le Markdown ;
4. passe le rapport à `ready` ;
5. ajoute `report_generated` au premier passage ou `report_updated` lors
   d’une régénération ;
6. recharge la mission.

En cas d’échec, l’application tente de passer le rapport à `failed` et ajoute
une entrée `report_failed`.

Une modification ultérieure de la mission ou de sa checklist marque
automatiquement le rapport `outdated`.

## Interface

La carte « Rapport de Cody » conserve les couleurs et composants de La Forge.
Elle utilise des grilles de cartes plutôt qu’un tableau. Le Markdown est découpé
en sections `<details>` repliables. Sous 600 px :

- les indicateurs passent sur une colonne ;
- les actions occupent toute la largeur ;
- aucun défilement horizontal de tableau n’est introduit ;
- le texte Markdown utilise `white-space: pre-wrap`.

## Sécurité

- aucune clé service-role dans le navigateur ;
- aucune API OpenAI, Codex ou payante ;
- accès Data API explicitement accordé à `authenticated` ;
- RLS fondée sur `agent_profiles` actif et rôle `agent`/`admin` ;
- aucun privilège `anon` ;
- aucun TRUNCATE, REFERENCES ou TRIGGER pour `authenticated` ;
- fonctions trigger non exécutables par PUBLIC, `anon` ou `authenticated` ;
- fonctions Forge métier existantes inchangées.

## Tests

### Réalisés localement

- parse PostgreSQL : 20 instructions valides ;
- `git diff --check` : conforme ;
- lint : succès, 0 erreur et 18 avertissements préexistants ;
- build : succès, compilation TypeScript et 83 pages générées ;
- avertissements build préexistants : `pdfjs/canvas` et convention
  `middleware`.

### Réalisés sur le projet Supabase lié

- `supabase db push --dry-run --linked` : seule la migration
  `20260729211718_create_forge_mission_reports.sql` était proposée ;
- `supabase db push --linked` : cette migration seule a été appliquée ;
- `supabase migration list --linked` : historique local et distant aligné
  jusqu’à `20260729211718` ;
- table créée vide, sans donnée de démonstration ;
- clé étrangère vers `forge_missions` avec suppression en cascade et unicité
  de `mission_id` confirmées ;
- contraintes et quatre index confirmés valides ;
- trois triggers actifs confirmés ;
- RLS activée et politique `authenticated` présente ;
- `anon` sans privilège sur la table ;
- `authenticated` limité à SELECT, INSERT, UPDATE et DELETE ;
- fonctions trigger en `security invoker`, sans EXECUTE pour PUBLIC, `anon` ou
  `authenticated` ;
- contrainte du journal étendue aux trois événements de rapport ;
- unique mission technique existante conservée, sans création de mission.

### À réaliser sur la Preview

- génération sur l’unique mission technique existante ;
- régénération et journal ;
- statut `outdated` après modification contrôlée ;
- actualisation et reconnexion ;
- copie du Markdown ;
- téléchargement `.md` ;
- affichage desktop et mobile.

## Limites

- la génération utilise des données disponibles ou simulées ;
- les fichiers Git, résultats de commandes, commit et PR ne sont pas collectés
  automatiquement ;
- le Markdown n’est pas rendu comme HTML : il reste affiché en texte lisible et
  sûr ;
- la copie dépend de Clipboard API ;
- le téléchargement est produit dans le navigateur ;
- une seule version courante du rapport est conservée par mission.

## Prochaine étape pour Codex

Créer un contrat d’entrée signé et validé pour alimenter
`forge_mission_reports` depuis une exécution Codex :

- inventaire Git réel ;
- résultats lint/build/tests ;
- preuves Supabase et Vercel ;
- commit et Preview ;
- risques structurés ;
- statut de génération transactionnel ;
- contrôle serveur de l’identité de la mission et de l’agent.

Cette future automatisation devra passer par un parcours serveur autorisé, sans
exposer le service-role au navigateur et sans permettre à Codex de déclencher
un déploiement de production.
