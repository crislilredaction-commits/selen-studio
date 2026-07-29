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

À compléter après création de la Preview Vercel :

- création depuis une demande libre et génération réelle ;
- persistance après actualisation ;
- modification, régénération et historique ;
- blocage réel et question non bloquante ;
- copie et téléchargement Markdown ;
- journalisation ;
- contrôle des missions et rapports existants ;
- affichage à 390 px et 1440 px.

La contrainte de test impose de réutiliser l’instance Chrome et le profil
utilisateur existants. Aucun profil navigateur temporaire ne doit être lancé.
Si l’automatisation ne peut pas piloter cette instance persistante, les tests
visuels devront rester manuels et cette limite sera signalée.

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

- Les tests navigateur et l’appel OpenAI réel dépendent de la Preview et d’une
  session Studio persistante.
- Les deux avertissements de clés étrangères circulaires doivent être pris en
  compte lors d’une restauration des données.
- Le modèle autorise les membres Studio actifs à créer et éditer les versions
  non validées conformément au fonctionnement actuel de La Forge.
- Aucune fonctionnalité de pause, priorité ou file de missions n’a été ajoutée.
