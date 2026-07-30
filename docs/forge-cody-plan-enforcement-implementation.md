# Forge Cody — respect du plan validé

Date d’exécution : 30 juillet 2026  
Branche : `feature/forge-cody-plan-enforcement`  
Projet Supabase : `pjbilmywwkpghhayftph`

## Périmètre réalisé

La mission impose désormais qu’une mission Cody s’exécute uniquement avec la
version courante et explicitement validée de son plan. La version utilisée pour
l’exécution est enregistrée sur la mission. Une ancienne validation ne peut
donc plus autoriser une version courante non validée.

Les changements sensibles créent une nouvelle version courante non validée,
un incident `PLAN_DEVIATION`, puis bloquent la mission. Un ajustement purement
technique reste possible sans revalidation, mais il est historisé et lié au
plan qui l’autorise.

## Fichiers modifiés

- `supabase/migrations/20260730014001_enforce_current_validated_forge_plan.sql`
- `supabase/migrations/20260730014002_integrate_plan_revalidation_checkpoints.sql`
- `src/lib/forge/types.ts`
- `src/lib/forge/data-access.ts`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/components/forge/MissionPlanningPanel.tsx`
- `src/app/agent/forge/forge.css`
- ce rapport

## Modèle de versionnement et validation

- Une contrainte unique partielle garantit un seul plan `is_current = true`
  par mission.
- Le contenu et les métadonnées descriptives d’une version existante sont
  immuables. Une évolution crée une nouvelle ligne liée par
  `previous_plan_id`.
- La validation RPC exige simultanément `mission_id` et `plan_id`; l’ancien
  RPC ne prenant que la mission a été supprimé.
- `forge_missions.execution_plan_id` mémorise la version autorisant
  l’exécution.
- Le garde-fou de statut exige un plan à la fois courant, `validated` et égal à
  `execution_plan_id`.
- Les informations conservées comprennent origine, création, validation,
  validateur, justification, différences et motif de revalidation.

## Écarts et changements sensibles

`forge_record_plan_action` distingue :

- `minor_technical` avec `change_type = technical_fix` : action autorisée,
  journalisée et reliée au plan courant validé ;
- `sensitive` : nouvelle version non validée, incident bloquant, plan
  d’exécution retiré et mission bloquée.

Les catégories testées sont `business_rule`, `architecture`,
`major_dependency`, `unplanned_migration`, `rls_or_grants` et `out_of_scope`.
Les détails stockés indiquent le changement, les objets concernés, la
contrainte découverte, le risque et la décision humaine attendue.

## Incidents et checkpoints

L’incident conserve `expected_plan_id` et `current_plan_id`. Il n’est résolu
que par validation explicite de la nouvelle version ou refus explicite et
restauration de la version validée précédente.

Une nouvelle version réinitialise `plan_generated` et les checkpoints
ultérieurs. `plan_validated` ne peut être satisfait que par le plan courant
validé. Aucun checkpoint ultérieur ne peut avancer pendant le blocage. Après
validation ou retour au plan précédent, la reprise est historisée. Cette règle
réévalue volontairement tous les checkpoints à partir de `plan_generated` :
elle est plus prudente qu’une conservation automatique lorsque l’étendue du
changement n’est pas démontrée.

## Interface

Le panneau de plan affiche la version courante, le statut, l’auteur, la date et
l’identité de validation, le motif de revalidation, la justification et le
résumé des différences. La validation envoie l’identifiant exact du plan. Une
action distincte permet de refuser la nouvelle version et de restaurer le plan
validé précédent. Les erreurs des RPC restent visibles dans le message
d’erreur de l’espace Cody.

## Sauvegardes PostgreSQL natives

Quatre archives ont été recréées séquentiellement dans le dossier Git ignoré
`supabase/.temp/backups/20260730-forge-cody-plan-enforcement-valid`. Chaque
archive a utilisé un rôle CLI temporaire renouvelé, a été contrôlée
immédiatement avec `pg_restore --list`, puis hachée en SHA-256. Aucun secret
n’a été consigné.

| Archive | Début (Europe/Paris) | Fin | Taille | Entrées | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| `public-schema.dump` | 01:46:57 | 01:47:02 | 534791 | 895 | `6C1C861C82B651BD7CF7A6B96AB0AB21A4BC984750A9382D5B8ADD231B21F6EA` |
| `public-data.dump` | 01:47:11 | 01:56:12 | 754785499 | 96 | `3C4C47329B41AECD367607C588C4CC854B175CC519678B2F754B79827C2C48C9` |
| `migration-history-schema.dump` | 01:56:21 | 01:56:23 | 2231 | 3 | `FEB34309170E20591FDF7E4836AFA443C09E9FF6CF862ED5F0CE7C98D5E27182` |
| `migration-history-data.dump` | 01:56:32 | 01:56:36 | 25241 | 1 | `CCFD74FA44A0142463369355E88E761E50B45975A96ADC99FCEA5F4192410758` |

Une première tentative d’affichage des empreintes a rencontré une erreur de
syntaxe PowerShell après la création des archives. Les dumps et catalogues
étaient valides ; une seconde vérification complète et indépendante a calculé
les empreintes ci-dessus.

## Migrations et commandes

1. Audit en lecture seule du schéma et des données Forge : aucune divergence,
   aucun plan, incident ou checkpoint existant à convertir.
2. `npx.cmd supabase db push --dry-run` : uniquement
   `20260730014001_enforce_current_validated_forge_plan.sql`, sans seed ni rôle.
3. `npx.cmd supabase db push` : migration appliquée.
4. Revue de l’interaction avec les checkpoints, puis migration corrective
   strictement ciblée `20260730014002_integrate_plan_revalidation_checkpoints.sql`.
5. Nouveau dry-run : uniquement `20260730014002`, sans seed ni rôle.
6. `npx.cmd supabase db push` : migration appliquée.
7. `npx.cmd supabase migration list` : local et distant alignés jusqu’à
   `20260730014002`.
8. Dry-run final : `upToDate: true`, `migrations: []`, `seeds: []`,
   `roles: []`.

Les deux migrations sont additives ou remplacent uniquement les garde-fous et
RPC Forge concernés. Aucune donnée métier n’a été supprimée.

## Tests PostgreSQL transactionnels

Tous les scénarios ont été exécutés dans une transaction terminée par
`ROLLBACK` :

- refus d’exécution sans plan courant ;
- refus avec plan courant non validé ;
- acceptation avec plan courant validé et liaison à `execution_plan_id` ;
- refus d’utiliser une ancienne validation ;
- refus de modifier le contenu d’une version ;
- refus de deux versions courantes ;
- ajustement technique lié et journalisé ;
- blocage pour chacune des six catégories sensibles ;
- incident contenant versions attendue et courante ;
- checkpoint ultérieur refusé avant revalidation ;
- nouvelle validation et reprise contrôlée ;
- refus de la nouvelle version et restauration explicite ;
- pause et reprise conservant plan et état d’exécution ;
- appel RPC avec un plan arbitraire refusé ;
- ancien RPC absent et nouvel RPC inaccessible à `anon`.

Résultat final : `passed`; mission de test restante `0`, action de test restante
`0`. Aucune donnée de test ne persiste.

## Contrôles RLS et grants

- RLS active sur `forge_missions`, `forge_mission_plans` et
  `forge_mission_plan_actions`.
- `forge_mission_plan_actions` expose uniquement une politique `SELECT` aux
  utilisateurs Studio authentifiés ; les écritures passent par le RPC et les
  politiques Forge existantes.
- Les trois RPC de cette mission sont `SECURITY INVOKER`, avec
  `search_path = ''`.
- `PUBLIC` et `anon` n’ont pas `EXECUTE`; `authenticated` conserve l’accès
  requis par l’interface.
- Aucun doublon de plan courant et aucune ligne de test n’ont été trouvés.

Le conseiller de sécurité Supabase ne signale aucune anomalie sur les nouveaux
objets. Il continue de signaler des alertes historiques hors périmètre
(notamment tables anciennes sans RLS, fonctions anciennes et protection des
mots de passe compromis désactivée) ; elles n’ont pas été modifiées.

## Validation applicative

- `npm.cmd run lint` : succès, 0 erreur et 18 avertissements historiques hors
  Forge.
- `npm.cmd run build` : succès, TypeScript et 84 pages générées.
- Routes vérifiées par le build : `/agent/forge` et `/agent/forge/cody`.
- Avertissements de build hors périmètre : module natif `canvas` absent pour
  les polyfills PDF, et convention `middleware` dépréciée.

## Preview Vercel et tests visuels

URL : à compléter après le push.

La session Chrome authentifiée précédemment ne peut pas être pilotée avec
garantie sans recréer un profil temporaire. Conformément à la contrainte
permanente, aucun test visuel authentifié n’est déclaré comme réalisé.

Checklist manuelle :

1. ouvrir la Preview avec la session Chrome Studio existante ;
2. contrôler `/agent/forge` puis `/agent/forge/cody` sur desktop et mobile ;
3. ouvrir une mission disposant d’un plan validé et vérifier les métadonnées ;
4. créer une nouvelle version sensible et constater le blocage, le motif, les
   différences et les checkpoints réinitialisés ;
5. valider explicitement cette version et vérifier la reprise ;
6. refaire le scénario en refusant la version et vérifier le retour au plan
   précédent ;
7. actualiser la page à chaque étape pour confirmer la persistance.

Le test sans session sera réalisé sur l’URL Preview après sa création.

## Risques et limites

- La comparaison d’une action envisagée avec le plan est matérialisée par un
  RPC d’enregistrement structuré. Le futur moteur Cody devra appeler ce RPC
  avant chaque action sensible ; l’interface actuelle ne constitue pas à elle
  seule un orchestrateur autonome.
- La réévaluation des checkpoints est volontairement conservatrice et repart
  de `plan_generated`; un futur moteur pourra proposer une analyse plus fine,
  mais jamais sans validation explicite.
- Les tests visuels authentifiés restent manuels dans la session Chrome
  persistante de l’utilisatrice.
- Cette livraison ne présente pas Cody comme prêt pour la production : les
  points suivants de la checklist globale restent à traiter.

## Commits

À compléter après création des commits finaux.
