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

## Premier test d'exécution Git réel

Les variables `FORGE_GITHUB_TOKEN` et `FORGE_EXECUTION_WORKER_SECRET` ont été
configurées uniquement dans Vercel Preview. Seule leur présence a été testée ;
aucune valeur n'a été affichée, téléchargée, journalisée ou enregistrée.

La première tentative a révélé que la route administratrice mettait uniquement
le run en file, sans ordonnanceur chargé d'appeler le worker. Le correctif
minimal `ddc7b44` fait désormais déclencher une tentative du worker côté serveur
par la route administratrice. Le secret et le jeton restent hors du client. La
route technique protégée par secret est conservée pour une orchestration future.

Mission technique :

- identifiant : `cbf2159e-c6ad-4adb-8679-6f8186d03f31` ;
- titre : `TEST TECHNIQUE — création réelle de branche Cody 2026-07-30` ;
- indépendante de la mission Sélion ;
- plan courant `ff932cf7-5cdb-4532-80d6-a9386c45cc43`, réellement validé,
  sans question bloquante.

Preuves du run :

- identifiant : `802540f5-efa0-4079-a301-c7d597fe84d0` ;
- tentative : 1 ;
- historique persistant : `queued` à 18:09:58 UTC, `running` à 18:31:49 UTC,
  `completed` à 18:31:51 UTC ;
- dépôt : `crislilredaction-commits/selen-studio` ;
- base : `main` ;
- branche : `test/cody-execution-branch-creation` ;
- remote enregistré :
  `https://github.com/crislilredaction-commits/selen-studio.git` ;
- SHA enregistré :
  `11c58a4ccf8d54ddedb67073fce0fed177326ef3` ;
- métadonnée `branch_verified: true` ;
- aucune erreur enregistrée.

La vérification indépendante `git ls-remote` renvoie le même SHA pour
`refs/heads/main` et
`refs/heads/test/cody-execution-branch-creation`. La branche est donc bien
présente sur GitHub et ne contient aucune modification de fichier par rapport à
la base clonée.

Le checkpoint `branch_created` a été terminé à 18:31:51 UTC, après
l'enregistrement de la preuve Git. Les checkpoints `development_started`,
`migrations_prepared`, `tests_executed`, `commits_pushed`, `preview_created` et
`final_report_produced` sont tous restés `pending`.

Tests complémentaires :

- une demande avant validation du plan a été refusée avec zéro run créé ;
- une deuxième demande pendant l'état `queued` a renvoyé le même identifiant de
  run, confirmant l'idempotence ;
- les tests ciblés moteur et accès administratrice ont réussi : 10/10 ;
- les contrôles de source confirment le refus des comptes agent par
  `requireStudioAdmin` ; aucun identifiant de compte agent n'a été manipulé pour
  fabriquer une session distante ;
- lint : 0 erreur, 18 avertissements préexistants ;
- TypeScript : réussi ;
- build complet : réussi, 91 routes.

La branche Git de test est volontairement conservée pour validation manuelle.

## Risques et limites restants

- Il n'existe pas encore d'ordonnanceur actif ; le lancement administratrice
  déclenche directement une tentative du worker.
- Le moteur s'arrête après la création prouvée de la branche.
- Les reprises après échec nécessitent une décision explicite et une branche
  cible disponible.
- Le secret du worker et le jeton GitHub doivent être renouvelés et gérés hors
  du dépôt.
- Le refus d'un compte agent est couvert par les tests ciblés et le garde-fou
  partagé, mais n'a pas été rejoué avec une nouvelle session agent distante afin
  de ne pas créer ou extraire d'identifiant de session.

Aucun merge vers `main`, aucun déploiement manuel en production et aucune
activation ou émission Telegram n'ont été effectués.

## Première édition de fichier contrôlée

Cette extension limite strictement l'écriture à
`docs/forge-cody-sandbox/`. Elle ne permet aucune commande shell libre et
n'autorise que l'opération structurée `create` ou `replace`, la commande
`git_status_short` et un message de commit conforme au format contrôlé.

Les étapes persistées et ordonnées sont :

1. `repository_cloned`
2. `branch_created`
3. `workspace_inspected`
4. `files_modified`
5. `diff_validated`
6. `command_executed`
7. `commit_created`
8. `commit_pushed`
9. `completed`

Chaque étape exige une preuve immuable avant de pouvoir avancer. Le worker
normalise le chemin, refuse les chemins absolus, traversées, encodages,
antislashs et liens symboliques, vérifie l'état Git initial, le fichier unique
modifié, le diff, les secrets probables, le parent du commit, l'absence de
divergence distante et le SHA distant après push.

### Fichiers et migrations

Fichiers applicatifs principaux :

- `src/lib/server/forgeExecutionWorker.ts`
- `src/app/agent/api/forge/executions/route.ts`
- `src/components/forge/MissionExecutionPanel.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/types.ts`
- `tests/forgeControlledEditExecution.test.ts`

Migrations appliquées :

- `20260730204145_extend_forge_controlled_edit_execution.sql`
- `20260730210452_fix_forge_execution_step_grants.sql`

La seconde migration corrige uniquement les grants de la nouvelle table et de
sa séquence : `authenticated` conserve `SELECT`, `service_role` conserve
`SELECT`, `INSERT`, `UPDATE`, `DELETE`, et `anon` ne possède aucun privilège.
La RLS reste activée. Le dry-run final était vide, sans migration, seed ou
modification de rôle supplémentaire.

### Sauvegardes natives renouvelées

Les quatre archives au format PostgreSQL custom ont été créées avant les
migrations dans
`supabase/.temp/backups/20260730-cody-controlled-edit-valid`, dossier ignoré par
Git. Chaque archive est non vide et reconnue par `pg_restore --list`.

| Archive | Début UTC+2 | Fin UTC+2 | Taille | Entrées | SHA-256 |
|---|---|---|---:|---:|---|
| Schéma public | 20:50:39 | 20:51:05 | 641 694 | 1 040 | `48BB8342020EEC4824DC6292192FF2913C6A554FCC8E25C1B7FA69FA376AB866` |
| Données publiques | 20:51:06 | 21:01:31 | 754 815 443 | 107 | `DAA33DAAA3EC8C6494F3CD54112C0CF40AC1ABF4CBDBB19A1F5A264F73F83997` |
| Schéma historique migrations | 21:01:43 | 21:01:59 | 2 231 | 3 | `741B4FB5EBDF17CE83DB7C4C959EE7C5C80B8B8B076FC24E2D0064E217583455` |
| Données historique migrations | 21:01:59 | 21:02:11 | 41 507 | 1 | `E9F2A9DED2A44EFF7D414283BF2874B85F3C016871D1C97180F70D3BF95B096A` |

### Validations

- tests ciblés moteur, accès administrateur et édition contrôlée : 16/16 ;
- test PostgreSQL transactionnel avec `ROLLBACK` : réussi ;
- traversée de chemin refusée ;
- preuve identique rejouée de façon idempotente ;
- preuve modifiée refusée car immuable ;
- étape hors ordre refusée ;
- aucune mission, aucun run ni donnée de test transactionnelle persistés ;
- lint : 0 erreur, 18 avertissements préexistants ;
- TypeScript : réussi ;
- build Next.js : réussi, 91 routes ;
- contrôles RLS et grants : conformes ;
- cron Telegram actif : 0.

### Test Git réel

Mission indépendante de Sélion :

- mission : `038aebe8-1d12-4cd7-905b-0bc33de3ee1a` ;
- plan courant validé :
  `510b5114-8aa0-4225-af2c-441b8aeee8b7` ;
- run : `0f9680b4-8067-4069-955c-18e3f1c16fd3` ;
- worker :
  `admin-25be8aaf-a650-418c-88c3-6e1a55a87939` ;
- tentative : 1 ;
- début : 30 juillet 2026 à 20:56:08 UTC ;
- fin : 30 juillet 2026 à 20:56:15 UTC ;
- état final : `completed`, sans erreur.

Preuves Git :

- dépôt : `crislilredaction-commits/selen-studio` ;
- base : `main` ;
- SHA de base : `11c58a4ccf8d54ddedb67073fce0fed177326ef3` ;
- branche créée :
  `test/cody-edit-038aebe8` ;
- commit créé et poussé :
  `9fb31bb4945306ab7ae03e0e78c70491a5089f54` ;
- parent du commit : SHA de base ci-dessus ;
- auteur : `Cody <cody@selen-editions.fr>` ;
- message :
  `docs(forge): add first controlled cody edit` ;
- SHA distant après push : identique au SHA du commit ;
- `main` est restée au SHA de base.

Le diff vérifié contient un unique ajout :

`docs/forge-cody-sandbox/first-controlled-edit.md`

Les hashes SHA-256 du contenu attendu et du contenu écrit sont identiques :

`220333df05b93391b53a116ebf1c7b211b8603d6b573ac9862cfe68c66318046`

La commande allowlistée `git_status_short` a retourné le fichier attendu avec
le code de sortie `0`. Le contrôle indépendant par `git ls-remote`, `git diff`
et `git show` confirme le SHA distant, l'unique fichier ajouté et le contenu
exact demandé.

Les checkpoints `branch_created`, `development_started`, `tests_executed` et
`commits_pushed` ont été complétés uniquement après leurs preuves respectives.
`migrations_prepared` a été marqué `skipped` avec la justification explicite
qu'aucune migration n'était nécessaire pour l'édition documentaire.
`preview_created` et `final_report_produced` sont restés `pending` : le worker
ne les a pas avancés artificiellement.

### Anomalie rencontrée et correction

La première soumission a été refusée en HTTP 400 avant création d'un run.
L'interface proposait `Cody` avec une majuscule dans le message de commit alors
que l'allowlist serveur et PostgreSQL exige une valeur en minuscules. Le commit
`7bbb5383a86ff85bb135a953d343bc62c06a8dee` centralise une valeur par défaut
conforme et la couvre par le test de validation nominal. L'allowlist n'a pas été
élargie et aucune correction distante n'a été nécessaire.

### Preview et limites

Preview validée pour le test :

`https://selen-studio-git-feature-a0e500-crislilredaction-4256s-projects.vercel.app/agent/forge/cody`

Le moteur reste volontairement limité à un fichier Markdown sous le dossier
sandbox et à une commande virtuelle strictement allowlistée. Il ne sait pas
encore modifier le code métier, lancer les scripts du dépôt, créer une Preview
pour sa branche de travail ni produire seul le rapport final.

La branche de test reste présente sur GitHub pour validation manuelle. Aucun
merge vers `main`, aucun déploiement manuel en Production, aucune activation du
cron Telegram et aucun message Telegram réel n'ont été effectués.
