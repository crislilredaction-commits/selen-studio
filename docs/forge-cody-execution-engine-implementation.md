# Socle d'exécution réel de Cody

Date de réalisation : 30 juillet 2026

Branche : `feature/forge-cody-execution-engine`

Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Périmètre réalisé

Cette mission ajoute un moteur d'exécution minimal et vérifiable pour Cody. Après
validation du plan courant, une administratrice peut demander une exécution. Un
worker protégé réclame atomiquement la demande, clone `selen-studio` dans un
répertoire temporaire isolé, crée la branche demandée et la pousse. Le checkpoint
`branch_created` n'est terminé qu'après enregistrement du SHA Git réellement
poussé.

Le worker ne modifie aucun fichier du dépôt cloné, ne lance ni lint, ni tests, ni
build, et ne poursuit pas les checkpoints techniques suivants. Il ne simule donc
pas un agent de développement complet.

## Fichiers concernés

- `supabase/migrations/20260730184300_create_forge_execution_engine.sql`
- `src/app/agent/api/forge/executions/route.ts`
- `src/app/agent/api/jobs/forge-cody-execution/route.ts`
- `src/lib/server/forgeExecutionWorker.ts`
- `src/components/forge/MissionExecutionPanel.tsx`
- `src/components/forge/MissionCheckpointPanel.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/types.ts`
- `tests/forgeExecutionEngine.test.ts`
- `package.json`
- `package-lock.json`

La dépendance `isomorphic-git` a été ajoutée pour effectuer les opérations Git
sans invoquer un shell avec un secret dans sa ligne de commande.

## Architecture et sécurité

La migration crée :

- `forge_execution_runs`, qui conserve les demandes, tentatives, états,
  branches, SHA, erreurs et horodatages ;
- `forge_execution_run_history`, qui conserve chaque changement d'état ;
- une contrainte d'unicité partielle empêchant plusieurs exécutions actives
  simultanées pour une même mission ;
- des fonctions réservées au rôle serveur pour demander, réclamer, terminer ou
  échouer une exécution.

La réclamation utilise un verrou PostgreSQL avec `FOR UPDATE SKIP LOCKED`. Deux
workers ne peuvent donc pas prendre la même demande. La demande est idempotente
tant qu'une exécution est active.

Les garde-fous refusent notamment :

- un plan absent, non courant ou non validé ;
- un plan différent de `execution_plan_id` ;
- des questions bloquantes ou un incident critique ouvert ;
- une mission archivée ou déjà exécutée ;
- une quatrième tentative.

La route de demande exige une session Studio administratrice. La route worker
exige `x-forge-worker-secret`, comparé en temps constant. Le jeton GitHub reste
exclusivement côté serveur et est masqué dans les erreurs.

Les deux tables ont la RLS activée. Leur lecture est réservée aux
administratrices Studio. `anon` n'a aucun privilège. Les opérations du worker
sont réservées à `service_role`.

Variables serveur requises sur l'environnement Preview :

- `FORGE_EXECUTION_WORKER_SECRET`
- `FORGE_GITHUB_TOKEN`

Le jeton GitHub attendu doit être un jeton finement limité au seul dépôt
`crislilredaction-commits/selen-studio`, avec lecture des métadonnées et
lecture/écriture du contenu. Aucune valeur secrète n'a été affichée, enregistrée
dans ce rapport ou ajoutée au dépôt.

## Sauvegardes PostgreSQL

Les quatre archives natives ont été recréées avant la migration dans le dossier
Git-ignoré `supabase/.temp/backups/20260730-cody-execution-engine-valid`.
Chaque processus s'est terminé avec succès, chaque fichier est non vide et
`pg_restore --list` a réussi.

| Archive | Taille | Entrées | SHA-256 |
|---|---:|---:|---|
| Schéma public | 623 772 octets | 1 017 | `DB713A8A09CCB4FF102CA95EBDAC956FC52227594525FB9F5A15DFEEF10E6608` |
| Données publiques | 754 810 275 octets | 104 | `5ADD3185D3F97810D5EC799067E1192BA2F0C6249BE4988F51B0D99BDE50165B` |
| Schéma de l'historique des migrations | 2 231 octets | 3 | `4EDB0BE9E7633C13B3B1AA89BA796E0500131E88009300FE6DF0084259B227CF` |
| Données de l'historique des migrations | 39 132 octets | 1 | `B2AB239816445E8148AFC248E8D908FF76A44FFDEA517AE8C32B16AD32B90AFF` |

Les archives et les informations de connexion ne sont pas suivies par Git.

## Migration distante

Migration appliquée :

`20260730184300_create_forge_execution_engine.sql`

Le premier `db push` a échoué transactionnellement : la correction initiale du
checkpoint Sélion tentait une transition `in_progress` vers `pending`, refusée
par le garde-fou existant. Aucun changement partiel n'a été conservé. La
correction a été rendue honnête et compatible en passant ce checkpoint à
`failed`, avec le message « Arrêté : aucune preuve d'exécution réelle ».

Un nouveau dry-run n'a proposé que la migration attendue, puis son application
a réussi. L'historique local et distant est aligné. Le dry-run final ne propose
plus aucune migration.

Contrôles distants réalisés :

- les deux tables existent et ont la RLS activée ;
- `anon` n'a aucun privilège ;
- les fonctions serveur et leurs droits sont présents ;
- le checkpoint Sélion trompeur est en échec et la mission n'a pas été avancée ;
- le cron Telegram reste désactivé.

## Tests

### Tests applicatifs ciblés

Commande : `node --test --import tsx tests/forgeExecutionEngine.test.ts`

Résultat : 10 tests réussis sur 10, couvrant :

- l'absence de validation manuelle des checkpoints techniques ;
- les garde-fous liés au plan ;
- la réclamation atomique et l'idempotence ;
- l'obligation d'un SHA avant le checkpoint ;
- la protection du worker, le masquage du jeton et le nettoyage temporaire ;
- les contrôles administratrice et serveur des routes.

### Tests PostgreSQL transactionnels

Le scénario exécuté avec `ROLLBACK` a confirmé :

- une demande idempotente ;
- une seule réclamation par deux workers concurrents ;
- `branch_created` encore en attente avant preuve ;
- le passage à `completed` avec un SHA simulé dans la transaction ;
- le refus d'une seconde exécution après succès ;
- zéro mission et zéro exécution de test persistantes après rollback.

### Validations du projet

- lint : réussi, 0 erreur et 18 avertissements préexistants ;
- TypeScript : réussi ;
- build Next.js complet : réussi, 91 routes ;
- routes générées : `/agent/api/forge/executions` et
  `/agent/api/jobs/forge-cody-execution`.

Le build conserve des avertissements préexistants liés à `pdfjs/canvas` et au
middleware. `npm install` a signalé 16 vulnérabilités dans l'arbre de
dépendances (1 faible, 4 modérées, 11 élevées) ; aucun `npm audit fix`
potentiellement perturbateur n'a été exécuté.

## Test d'exécution réel et limite actuelle

Le test réel de création et de push d'une branche n'a pas été exécuté. Aucun
`FORGE_GITHUB_TOKEN` dédié ni `FORGE_EXECUTION_WORKER_SECRET` n'est disponible
dans l'environnement connu. Réutiliser un identifiant GitHub local aurait
contourné l'exigence de moindre privilège.

En conséquence :

- aucune mission distante de test n'a été créée ;
- aucune branche de test n'a été poussée par le worker ;
- aucun SHA réel ne peut être fourni ;
- l'interface indique honnêtement « Moteur d'exécution non connecté » ;
- les tests visuels authentifiés du lancement réel restent à faire.

## Procédure de validation restante

1. Ajouter les deux variables uniquement à l'environnement Vercel Preview, sans
   communiquer leur valeur dans un ticket, un rapport ou le dépôt.
2. Attendre la nouvelle Preview automatique.
3. Créer une mission technique clairement identifiée, générer et valider son
   plan courant.
4. Demander une exécution avec une branche de test dédiée.
5. Appeler une seule fois la route worker protégée.
6. Vérifier la branche distante et comparer son HEAD au SHA enregistré.
7. Vérifier le journal, l'historique d'exécution et le checkpoint
   `branch_created`.
8. Supprimer ensuite la branche de test seulement après consignation des
   preuves.

## Risques et limites restants

- Il n'existe pas encore d'ordonnanceur actif pour appeler le worker.
- Le moteur s'arrête après la création prouvée de la branche.
- Les reprises après échec nécessitent une décision explicite et une branche
  cible disponible.
- Le secret du worker et le jeton GitHub doivent être renouvelés et gérés hors
  du dépôt.
- La validation visuelle et Git réelle dépend de cette configuration Preview.

Aucun merge vers `main`, aucun déploiement manuel en production et aucune
activation ou émission Telegram n'ont été effectués.
