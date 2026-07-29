# La Forge — checkpoints persistants de Cody

Date : 30 juillet 2026
Branche : `feature/forge-cody-checkpoints`
Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Périmètre réalisé

Chaque nouvelle mission Cody nécessitant un cadrage reçoit dix checkpoints :

1. analyse terminée ;
2. plan généré ;
3. plan validé ;
4. branche créée ;
5. développement commencé ;
6. migrations préparées ;
7. tests exécutés ;
8. commits poussés ;
9. Preview créée ;
10. rapport final produit.

Les états autorisés sont `pending`, `in_progress`, `completed`, `failed` et
`skipped`. Chaque état courant conserve dates, message/résultat et, pour le plan
validé, l’identifiant du plan. Toute création ou modification significative est
copiée dans un historique append-only.

La progression globale vaut dix points par checkpoint `completed` ou `skipped`.
La reprise cible le premier checkpoint qui n’est ni terminé ni ignoré. Une
mission historique sans checkpoints reste lisible et n’est pas modifiée.

## Intégrité et transitions

- clé et position fixes et uniques par mission ;
- ordre antérieur obligatoire avant démarrage, achèvement ou skip ;
- skip impossible sans justification ;
- dates cohérentes selon le statut ;
- reprise d’un checkpoint terminé possible uniquement avec justification et
  avant toute étape ultérieure ;
- passage en développement bloqué sans checkpoint « branche créée » ;
- le checkpoint « plan validé » exige exactement le plan courant au statut
  `validated` ;
- une nouvelle version du plan réouvre le plan généré et toutes les étapes
  suivantes, en conservant chaque ancien état dans l’historique ;
- les erreurs sont inscrites dans `forge_activity_logs` et intégrées au rapport
  de mission.

## Migrations

- `20260730000301_create_forge_mission_checkpoints.sql`
  - tables `forge_mission_checkpoints` et
    `forge_mission_checkpoint_history` ;
  - contraintes, index, RLS, politiques, historique et progression ;
  - initialisation automatique des dix checkpoints.
- `20260730000302_integrate_forge_mission_checkpoints.sql`
  - RPC `forge_update_mission_checkpoint` ;
  - synchronisation analyse/plan ;
  - garde-fou d’exécution ;
  - réouverture après nouvelle version ;
  - reprise enrichie avec le checkpoint cible ;
  - événements `checkpoint_updated` et `checkpoint_failed`.

La commande `supabase migration new` a été tentée avec la CLI 2.110.0, mais le
défaut Windows `LegacyMigrationNewWriteError AlreadyExists` s’est reproduit.
Les deux fichiers ont été créés avec des horodatages successifs sans modifier
les migrations historiques.

## Sécurité

- RLS active sur les deux nouvelles tables.
- Deux politiques limitées aux profils Studio actifs `agent` ou `admin`.
- Aucun accès `anon`.
- `authenticated` peut lire et modifier l’état courant via les contrôles RLS,
  mais peut uniquement lire l’historique.
- L’historique est écrit par un trigger étroit `SECURITY DEFINER`, avec
  `search_path` vide et `EXECUTE` révoqué à `PUBLIC`, `anon` et
  `authenticated`.
- Toutes les autres fonctions sont `SECURITY INVOKER`.
- Seuls `forge_update_mission_checkpoint` et `forge_resume_mission` sont
  exécutables par `authenticated`.
- Aucun secret n’a été affiché ou écrit.

Les advisors n’ont signalé aucune alerte nouvelle sur les objets checkpoints.
Les alertes préexistantes hors périmètre, dont les 12 tables publiques sans RLS,
n’ont pas été modifiées.

## Sauvegardes PostgreSQL natives

Répertoire local ignoré par Git :
`supabase/.temp/backups/20260730-forge-cody-checkpoints`.

| Archive | Octets | Entrées | SHA-256 |
|---|---:|---:|---|
| `public-schema.dump` | 481 267 | 836 | `D0EFAD225A64794317EC65B2592820EDF723B5722CF1CAECCC5A4A3EA70CC3F9` |
| `public-data.dump` | 754 783 753 | 92 | `788C5B4A2CFBC8DA5FC439188E9DFF3F81632EC537A97FC866B4D397C5D55B0E` |
| `migration-history-schema.dump` | 2 231 | 3 | `21011169F703B23231E38B961153D11C2D550A15D26DED14FFC3FEAE9F9448D6` |
| `migration-history-data.dump` | 19 966 | 1 | `CAFB2AD6F0F715E6F02251CFB2878613B9647E146AB7E996A2F755571AE0146B` |

Les quatre archives sont non vides, reconnues par PostgreSQL 17.10 avec
`pg_restore --list`, et contiennent les objets ou données attendus. Aucune
erreur `pg_dump` n’est présente. Les deux avertissements de clés étrangères
circulaires préexistants concernent `documents` et `daily_formations`.

Commandes documentées sans identifiants :

```powershell
npx.cmd supabase db dump --linked --dry-run
pg_dump -Fc --schema-only --schema=public --role=postgres --no-owner --no-privileges
pg_dump -Fc --data-only --schema=public --role=postgres --no-owner --no-privileges
pg_dump -Fc --schema-only --schema=supabase_migrations --role=postgres --no-owner --no-privileges
pg_dump -Fc --data-only --schema=supabase_migrations --role=postgres --no-owner --no-privileges
pg_restore --list <archive>
```

## Application

Le dry-run avant application a proposé uniquement :

```text
20260730000301_create_forge_mission_checkpoints.sql
20260730000302_integrate_forge_mission_checkpoints.sql
seeds=[]
roles=[]
```

`supabase db push` a appliqué ces deux migrations seules. Après application :

- les deux tables, contraintes, index et triggers sont présents ;
- RLS et les deux politiques sont actives ;
- zéro checkpoint a été ajouté à la mission historique ;
- les totaux métier restent à une mission et un rapport ;
- l’historique est aligné jusqu’à `20260730000302` ;
- le dry-run final retourne `migrations=[]`, `seeds=[]`, `roles=[]`.

## Tests PostgreSQL transactionnels

Le scénario suivant a été exécuté puis annulé avec `ROLLBACK` :

1. création d’une mission et contrôle des dix checkpoints ;
2. démarrage de l’analyse ;
3. génération et validation du plan version 1 ;
4. contrôle de la progression à 20 % après génération ;
5. régénération d’une version 2 et réouverture des étapes ;
6. refus de franchir « plan validé » avec l’ancienne version validée ;
7. validation de la version courante et liaison à son identifiant ;
8. création logique de branche puis démarrage du développement ;
9. pause et reprise sur `development_started` ;
10. interruption de `migrations_prepared` avec statut `failed` ;
11. seconde pause et reprise sur ce checkpoint en échec ;
12. refus de démarrer les tests hors ordre ;
13. refus de `skipped` sans justification ;
14. skip justifié et progression calculée à 60 % ;
15. contrôle de l’historique et du journal d’échec ;
16. `ROLLBACK` et contrôle de l’absence de données `CODEX_TEST_%`.

Résultat : toutes les assertions métier passent. Aucun test ne persiste.

## Validation application

- `npm.cmd run lint` : succès, 0 erreur et 18 avertissements préexistants hors
  Forge.
- `npm.cmd run build` : succès, TypeScript et 84 routes compilées.
- Routes contrôlées dans le build : `/agent/forge`,
  `/agent/forge/cody`, `/agent/api/forge/planning`.
- Avertissements préexistants : module optionnel `canvas` de `pdfjs` et
  convention `middleware` dépréciée.
- Revue React : données dérivées sans effet, liste ordonnée stable, composants
  contrôlés, actions asynchrones verrouillées et historique repliable.

## Fichiers modifiés

- `src/lib/forge/types.ts`
- `src/lib/forge/labels.ts`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/report-generator.ts`
- `src/components/forge/ActivityJournal.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/components/forge/MissionCheckpointPanel.tsx`
- `src/app/agent/forge/forge.css`
- les deux migrations ci-dessus ;
- ce rapport.

## Preview et validation visuelle

Preview automatique Vercel du commit d’implémentation, statut `READY` :

`https://selen-studio-fbdn4os71-crislilredaction-4256s-projects.vercel.app`

La session Chrome Studio existante ne peut pas être pilotée par l’environnement
Codex sans ouvrir un autre profil, ce qui est interdit. Aucun test visuel
authentifié n’est donc prétendu réalisé. Checklist manuelle :

1. ouvrir une nouvelle mission Cody et vérifier les dix étapes ordonnées ;
2. contrôler le détail, les dates et l’historique sur desktop 1440 px ;
3. démarrer, terminer et échouer un checkpoint ;
4. vérifier que le skip reste bloqué sans justification ;
5. mettre la mission en pause, actualiser, reprendre et contrôler la cible ;
6. régénérer le plan et vérifier la réouverture depuis « plan généré » ;
7. contrôler l’erreur dans le journal et le rapport ;
8. répéter les contrôles principaux à 390 px.

## Risques et limites

- Aucun moteur d’exécution automatique n’est ajouté ; les checkpoints forment
  l’état durable que tout futur worker devra respecter.
- Les checkpoints Git, migrations, tests, Preview et rapport sont confirmés
  manuellement dans cette version.
- Les missions historiques ne sont pas rétro-remplies pour éviter d’inventer
  un état d’exécution.
- Les alertes Supabase préexistantes hors Forge restent à traiter dans une
  mission de sécurité distincte.

## Retour arrière

Faire une nouvelle sauvegarde, arrêter tout consommateur de checkpoints, retirer
les triggers et RPC, exporter l’historique si nécessaire, puis retirer les deux
tables. Restaurer ensuite l’ancienne version de `forge_resume_mission`. Ne
réparer l’historique de migrations qu’après validation humaine.

## Livraison

Commit d’implémentation : `ff7edf659261e6f7ef7b3f97967f688282b3d6a7` — `Ajoute les checkpoints des missions Cody`.

Le commit documentaire qui inscrit la Preview dans ce rapport est indiqué dans le compte rendu final Git.
Aucun merge vers `main` et aucun déploiement production manuel.
