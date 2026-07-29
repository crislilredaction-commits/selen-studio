# La Forge — cadrage et planification automatique de Cody

Date : 29 juillet 2026

Branche : `feature/forge-cody-planning`

Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Résumé

La Forge permet désormais de créer une mission Cody depuis une demande libre,
de générer un cadrage structuré avant toute exécution, de le modifier, de le
régénérer et de le valider explicitement.

Le texte source est conservé séparément. Chaque enregistrement ou régénération
crée une nouvelle version du plan. Une version validée reste traçable et son
contenu ne peut plus être modifié ou supprimé. Seule une version à la fois est
courante, et seule une version à la fois courante et validée autorise le passage
aux statuts d’exécution.

## Architecture

- `forge_mission_briefs` conserve la demande, le contexte et les contraintes
  d’origine, avec une relation un-à-un vers `forge_missions`.
- `forge_mission_plans` conserve les versions structurées et leur rendu
  Markdown, avec l’auteur, le validateur et les horodatages.
- `planning_required` préserve le comportement des missions historiques :
  sa valeur par défaut est `false`.
- L’analyse est réalisée côté serveur par
  `/agent/api/forge/planning`. La route vérifie l’accès Studio avant d’appeler
  OpenAI et utilise un schéma JSON strict.
- Le navigateur n’accède jamais à la clé OpenAI ni à la clé Supabase de service.
- Les fonctions PostgreSQL sont `security invoker`, avec un `search_path` vide.

## Statuts

Parcours de cadrage :

`draft → analyzing → needs_clarification | plan_ready → plan_validated`

Les statuts d’exécution historiques restent inchangés. Le trigger
`forge_missions_enforce_planning_gate` refuse leur utilisation lorsque la
mission exige un cadrage et qu’aucun plan courant n’a simultanément
`status = 'validated'` et `is_current = true`.

Les questions non bloquantes, hypothèses et recommandations ne bloquent pas la
validation. Seul le tableau `blocking_questions` doit être vide.

## Sauvegardes PostgreSQL natives

Docker n’a pas été utilisé. Les outils client PostgreSQL 17.10 ont été extraits
depuis l’archive binaire Windows officielle dans `supabase/.temp/`, sans
installation ni démarrage d’un serveur local.

La connexion a utilisé le Session Pooler Supabase IPv4 sur le port 5432. La CLI
authentifiée a créé un rôle temporaire dont les identifiants sont restés
uniquement en mémoire. Aucun mot de passe ou jeton n’a été affiché, écrit dans
ce rapport ou ajouté au dépôt.

Commandes documentées sous forme neutralisée :

```powershell
npx.cmd supabase db dump --linked --dry-run
pg_dump -Fc --schema-only --schema=public --no-owner --quote-all-identifiers --role=postgres
pg_dump -Fc --data-only --schema=public --no-owner --no-privileges --quote-all-identifiers --role=postgres
pg_dump -Fc --schema-only --schema=supabase_migrations --no-owner --quote-all-identifiers --role=postgres
pg_dump -Fc --data-only --schema=supabase_migrations --no-owner --no-privileges --quote-all-identifiers --role=postgres
pg_restore --list <archive>
```

Archives locales ignorées par Git :

| Archive | Taille | Entrées reconnues | SHA-256 |
|---|---:|---:|---|
| `public-schema.dump` | 526 868 octets | 942 | `6A8D6E26A09B15F758E9FA4C5BDDA68B6B25EECEF0AD24736CD8F5A0F4F79BFE` |
| `public-data.dump` | 754 785 766 octets | 90 | `15104DA7AE041B22FCBA2343B38905308F0F409D6FA62AB0280AFB9B0E1924E4` |
| `migration-history-schema.dump` | 2 599 octets | 3 | `CC0FFA6335E7C9E9C462B29B791AD20D5682757218F9EC959EC8E5A2205980CF` |
| `migration-history-data.dump` | 16 268 octets | 1 | `EDEB06F63C9B15D7BCA323A0561627ABC6900DBD4A3C2EDF75DC53B8BACC787D` |

Les quatre appels à `pg_restore --list` retournent le code 0 et les archives
contiennent les tables, fonctions ou données attendues. Le dump des données
signale deux cycles de clés étrangères préexistants (`documents` et
`daily_formations`). Il ne s’agit pas d’une erreur de dump. Une restauration
doit charger le schéma avant les données et utiliser `--disable-triggers` avec
un rôle privilégié pour ces deux cycles.

## Migrations appliquées

### `20260729220806_create_forge_cody_planning.sql`

Le dry-run a proposé cette migration seule, sans seed ni rôle.

Objets principaux :

- tables `forge_mission_briefs` et `forge_mission_plans` ;
- contraintes de contenu, version positive et unicité
  `(mission_id, version)` ;
- index unique partiel garantissant un seul plan courant ;
- relations avec suppression en cascade depuis `forge_missions` ;
- triggers `updated_at`, protection du plan validé et garde-fou d’exécution ;
- fonctions de création, changement d’état, versionnement et validation ;
- nouvelles valeurs de statut et nouveaux événements du journal.

### `20260729225608_require_current_validated_forge_plan.sql`

La revue post-application a montré que la première version du garde-fou
acceptait une ancienne version validée après régénération. La migration
corrective est strictement limitée au remplacement de
`enforce_forge_mission_planning_gate()`.

Son dry-run a proposé uniquement cette migration, avec `seeds=[]` et `roles=[]`.
La fonction distante vérifiée exige maintenant :

```sql
p.status = 'validated'
and p.is_current = true
```

L’historique local et distant est aligné jusqu’à `20260729225608`.

## Sécurité et intégrité

- RLS active sur les deux nouvelles tables.
- Une politique par table, limitée aux profils Studio actifs de rôle `agent`
  ou `admin`.
- `anon` ne possède aucun privilège sur ces tables.
- `authenticated` possède uniquement `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Les quatre fonctions métier sont exécutables par `authenticated`, jamais par
  `anon` ou `PUBLIC`.
- Les deux fonctions de trigger ne sont exécutables ni par `anon`, ni par
  `authenticated`, ni par `PUBLIC`.
- Toutes les fonctions ajoutées restent `security invoker`.
- Le contenu d’un plan validé est immuable et sa suppression est refusée.
- Les tables de planning sont vides après migration : aucune donnée de
  démonstration n’a été insérée.
- Les missions existantes restent hors du garde-fou grâce à
  `planning_required = false`.

## Tests réalisés

### PostgreSQL

Un scénario complet a été exécuté dans une transaction ensuite annulée :

1. création d’une mission de cadrage ;
2. création et validation de la version 1 ;
3. régénération d’une version 2 non validée ;
4. refus du statut `in_progress` malgré la présence de la version 1 validée ;
5. validation de la version 2 puis acceptation de `in_progress` ;
6. régénération d’une version 3 ;
7. nouvelle obligation de validation ;
8. contrôle des trois versions et des deux anciennes versions validées ;
9. contrôle du nombre de missions et de rapports existants ;
10. `ROLLBACK`.

Résultat : `passed`. Aucune mission ni aucun plan de test ne persiste.
Le rapport Cody préexistant reste présent.

### Application

- `npm.cmd run lint` : succès, 0 erreur et 18 avertissements préexistants hors
  La Forge.
- `npm.cmd run build` : succès, TypeScript et 84 routes compilées.
- Route `/agent/api/forge/planning` incluse dans le build.
- Avertissements préexistants : module optionnel `canvas` de `pdfjs` et
  convention Next.js `middleware` dépréciée.
- Revue React : authentification serveur de la route, imports directs,
  initialisation paresseuse de l’état d’édition et remontage du panneau par
  identifiant de version vérifiés.

## Tests Preview

Déploiement automatique :

- URL :
  `https://selen-studio-k3iqsxfer-crislilredaction-4256s-projects.vercel.app`
- cible : Preview, jamais production ;
- commit : `f0aa5277d1aed86df39118f8f1f89f90ccf9613f` ;
- état Vercel : `READY` ;
- contrôle HTTP non authentifié de `/agent/forge/cody` : réponse 200 avec
  routage vers `/login`, comportement attendu sans cookie Studio.

La contrainte de test impose de réutiliser l’instance Chrome et le profil
utilisateur existants. Aucun profil navigateur temporaire ne doit être lancé.
La Preview a été ouverte dans Google Chrome sans argument de profil et
l’utilisatrice a confirmé sa connexion Studio. Toutefois, cette instance
existante n’expose pas d’interface d’automatisation réutilisable dans
l’environnement Codex. Conformément à la consigne, elle n’a pas été relancée
avec un profil temporaire ou un port de débogage.

Les tests visuels et fonctionnels authentifiés suivants n’ont donc pas été
automatisés :

- génération réelle via OpenAI ;
- persistance après actualisation ;
- modification, régénération et historique visibles ;
- copie et téléchargement Markdown ;
- contrôle visuel du journal ;
- rendu à 390 px et 1440 px.

Les garanties correspondantes couvertes hors navigateur sont le build complet,
la présence de la route, les contrôles RLS et les scénarios PostgreSQL
transactionnels de versionnement et de garde-fou.

## Retour arrière

Avant toute action de retour arrière, réaliser une nouvelle sauvegarde et
vérifier les dépendances créées depuis la mise en ligne.

Ordre logique, à exécuter manuellement seulement après validation humaine :

1. empêcher la création de nouvelles missions nécessitant un cadrage ;
2. conserver ou exporter `forge_mission_briefs` et `forge_mission_plans` ;
3. retirer le trigger de garde-fou et les fonctions de planning ;
4. retirer les politiques puis les deux tables ;
5. retirer les deux colonnes ajoutées à `forge_missions` seulement si aucune
   donnée ne les utilise ;
6. restaurer les contraintes de statuts précédentes ;
7. réaligner l’historique de migration uniquement après contrôle.

Les archives de cette intervention permettent également une restauration
logique du schéma, des données publiques et de l’historique.

## Risques et limites restants

- Les tests navigateur authentifiés et l’appel OpenAI réel restent à valider
  manuellement dans la fenêtre Chrome déjà authentifiée.
- Les deux avertissements de clés étrangères circulaires doivent être pris en
  compte lors d’une restauration des données.
- Le modèle autorise les membres Studio actifs à créer et éditer les versions
  non validées conformément au fonctionnement actuel de La Forge.
- Aucune fonctionnalité de pause, priorité ou file de missions n’a été ajoutée.

> Mise à jour : la remarque précédente décrivait la première livraison du
> cadrage. Elle est remplacée par le complément livré ci-dessous.

## Complément — priorités, pause/reprise et file d’exécution

### Modèle retenu

Les niveaux persistés sont `low`, `normal`, `high` et `urgent`. La priorité est
choisie à la création, modifiable tant que la mission n’est pas `validated`, et
affichée dans la carte comme dans le détail.

L’ordre par défaut est urgente, haute, normale, basse, puis date de création
croissante et identifiant. Cet ordre ne déclenche aucune exécution et ne
préempte jamais une mission en cours. Un tri « plus récentes » reste disponible.

Le statut `paused` est ajouté. La seule entrée autorisée est
`in_progress → paused` et la seule sortie est `paused → in_progress`.
`paused_at` et `resumed_at` tracent les actions. Le plan courant validé, la
progression, les journaux et les résultats ne sont ni recréés ni effacés.

Une contrainte unique partielle sur `agent_key` autorise au maximum une mission
`in_progress` par agent. Une mission en pause libère ce créneau ; sa reprise
explicite échoue si une autre mission Cody est en cours. Il n’existe pas
d’ordonnanceur automatique : l’utilisatrice choisit la prochaine mission dans
la file triée.

Le schéma actuel ne définit aucun statut `cancelled`. Aucun parcours
d’annulation n’a été inventé ; le blocage de modification de priorité s’applique
au seul état terminal existant, `validated`.

### Migrations

- `20260729232319_add_forge_mission_priority_controls.sql` : création avec
  priorité, RPC de modification, journal `priority_changed`, index de tri et
  trigger interdisant la modification directe après validation.
- `20260729232320_add_forge_mission_pause_and_queue_guards.sql` : statut et
  horodatages, journal dédié, RPC, trigger de transitions et index unique
  d’activité par agent.

`npx.cmd supabase migration new` a été tenté, mais la CLI Windows a retourné
`LegacyMigrationNewWriteError AlreadyExists` sur `supabase/migrations`. Les
deux fichiers ont donc été créés avec des horodatages successifs, sans modifier
les migrations historiques.

### Sauvegardes de cette intervention

Répertoire local ignoré par Git :
`supabase/.temp/backups/20260729-forge-cody-priority-pause`.

| Archive | Taille | Entrées | SHA-256 |
|---|---:|---:|---|
| `public-schema.dump` | 474 236 | 827 | `719ADB4B7944425A56F67422D235B8585858E1B5CF18AFDEA6BA3C6883B5010E` |
| `public-data.dump` | 754 783 729 | 92 | `B816035B9EC8C1CFEDB78006B1E46C7695F704D1314A9679F2312A55664DBBA5` |
| `migration-history-schema.dump` | 2 231 | 3 | `C78C265FC90401D19CBF60E7355B52B4A004ADDB39D159EE6FCDF52FCE4202D4` |
| `migration-history-data.dump` | 19 042 | 1 | `921808DCB82E8D82114EB8A4206CDC51A5E1285A39C57ECD7EFAC6F8E1F07E22` |

Les quatre archives sont non vides et reconnues par PostgreSQL 17.10 avec
`pg_restore --list`. Les objets et données attendus sont présents. Aucune erreur
`pg_dump` n’est présente ; seuls les cycles préexistants `documents` et
`daily_formations` sont signalés. La connexion a utilisé le Session Pooler IPv4
et un rôle CLI temporaire resté en mémoire.

Commandes neutralisées :

```powershell
npx.cmd supabase db dump --linked --dry-run
pg_dump -Fc --schema-only --schema=public --no-owner --no-privileges --role=postgres
pg_dump -Fc --data-only --schema=public --no-owner --no-privileges --role=postgres
pg_dump -Fc --schema-only --schema=supabase_migrations --no-owner --no-privileges --role=postgres
pg_dump -Fc --data-only --schema=supabase_migrations --no-owner --no-privileges --role=postgres
pg_restore --list <archive>
```

### Application et contrôles

Le dry-run avant application a proposé uniquement les deux migrations ci-dessus
avec `seeds=[]` et `roles=[]`. `supabase db push` les a appliquées seules.

Après application :

- les deux colonnes, deux index et deux triggers sont présents ;
- les contraintes contiennent les quatre priorités et le statut `paused` ;
- RLS reste active sur les six tables Forge concernées et les politiques
  existantes sont conservées ;
- les cinq fonctions sont `security invoker` avec `search_path` vide ;
- `anon` ne peut exécuter aucun nouveau RPC ;
- `authenticated` exécute les trois RPC métier, pas les fonctions de trigger ;
- les totaux restent à une mission et un rapport ;
- l’historique est aligné jusqu’à `20260729232320` ;
- le dry-run final est vide : `migrations=[]`, `seeds=[]`, `roles=[]`.

### Tests transactionnels

Un scénario annulé par `ROLLBACK` a validé :

1. création et modification de priorité ;
2. tri par priorité puis ancienneté ;
3. refus de pause hors `in_progress` et refus d’une deuxième pause ;
4. pause avec plan validé et progression à 37 % conservés ;
5. refus de reprise lorsqu’une autre mission Cody est active ;
6. reprise après libération du créneau ;
7. refus de `paused → validated` ;
8. refus de modifier la priorité après `validated`.

Toutes les assertions sont passées. Aucun titre `CODEX_TEST_%` ne persiste et
les totaux métier restent inchangés.

### Validation application

- `npm.cmd run lint` : succès, 0 erreur, 18 avertissements préexistants hors
  Forge.
- `npm.cmd run build` : succès, TypeScript et 84 routes compilées.
- Avertissements préexistants uniquement : module `canvas` de `pdfjs` et
  convention Next.js `middleware`.
- Revue React : tri sans mutation, état local minimal, actions asynchrones
  verrouillées et erreurs rendues visibles.

### Contrôles visuels manuels

La session Chrome Studio existante doit être conservée. Elle n’est pas pilotable
depuis Codex ; aucun profil temporaire ne sera ouvert. Dans la Preview :

1. à 1440 px, créer une mission urgente et vérifier ses deux libellés ;
2. créer une mission basse et vérifier l’ordre du tri par priorité ;
3. vérifier qu’une urgence n’interrompt pas une mission en cours ;
4. mettre en pause une mission en cours après confirmation ;
5. actualiser et contrôler statut, progression, plan, journal et date ;
6. reprendre, actualiser et contrôler la date de reprise ;
7. vérifier l’erreur si une autre mission Cody est déjà active ;
8. répéter à 390 px et vérifier tri, priorité et boutons.

### Risques et retour arrière

- Aucun worker d’exécution n’existe ici : tout futur worker devra ignorer les
  missions `paused`.
- `cancelled`, sélection automatique et préemption restent des décisions
  produit non implémentées.
- Pour revenir en arrière : arrêter tout consommateur, refaire une sauvegarde,
  retirer RPC et triggers, restaurer les contraintes antérieures, puis retirer
  index et colonnes seulement après vérification humaine. Ne réparer
  l’historique qu’après validation.
