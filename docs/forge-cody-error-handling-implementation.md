# La Forge — gestion bornée des incidents Cody

Date : 30 juillet 2026

Branche : `feature/forge-cody-error-handling`

## Périmètre réalisé

La Forge dispose d’un registre persistant d’incidents rattachés à une mission,
un checkpoint et, lorsqu’elle est connue, une action. Les catégories sont :

- `warning` ;
- `recoverable_error` ;
- `critical_error` ;
- `human_decision_required`.

Les états de résolution sont `detected`, `retrying`, `resolved`, `blocked`,
`failed` et `ignored_with_justification`. Un incident conserve le code stable,
le message, les détails techniques, les dates, le compteur et la limite de
tentatives, la stratégie, le statut antérieur de la mission et la décision
humaine attendue.

Chaque tentative est ajoutée dans une table d’historique distincte. Elle
conserve son numéro, sa stratégie, son empreinte, son résultat, ses détails, le
plan courant et ses dates. Aucun échec précédent n’est écrasé.

## Politique de correction

La limite par défaut est de trois tentatives, configurable par incident entre 1
et 10. Une même stratégie avec la même empreinte, déjà échouée, ne peut pas être
rejouée. Une correction automatique exige le plan courant au statut
`validated`.

Les seules stratégies automatiques autorisées sont :

- correction de syntaxe ;
- import manquant ;
- typage local ;
- test cassé par la modification ;
- chemin ou paramètre de commande ;
- conflit local simple ;
- migration locale invalide ;
- lint ;
- build.

Une stratégie hors de cette liste est refusée en base. Les catégories critique
et décision humaine bloquent immédiatement la mission. L’épuisement de la
limite passe l’incident à `failed` et la mission à `blocked`.

Après résolution humaine, le RPC `forge_resume_blocked_mission` vérifie
l’absence de tout incident bloquant ouvert, restaure le statut cohérent et
journalise le checkpoint de reprise. L’interface affiche une action explicite
« Reprendre au checkpoint concerné ».

## Intégration checkpoints, journal et rapport

- un checkpoint critique ou bloquant ne peut pas être terminé ;
- aucune étape concernée ne peut progresser tant que le blocage reste ouvert ;
- pause, reprise et redémarrage ne remettent pas les compteurs à zéro ;
- les événements détecté, nouvelle tentative, résolu et bloqué sont inscrits
  dans `forge_activity_logs` ;
- les incidents ouverts et toutes les tentatives apparaissent dans le rapport
  Markdown de mission ;
- l’interface distingue visuellement avertissement, récupérable, critique et
  décision humaine, avec dates, stratégie et résultat de chaque tentative.

## Fichiers modifiés

- `src/app/agent/forge/forge.css`
- `src/components/forge/ActivityJournal.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/components/forge/MissionIncidentPanel.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/labels.ts`
- `src/lib/forge/report-generator.ts`
- `src/lib/forge/types.ts`
- `supabase/migrations/20260730010101_create_forge_mission_incidents.sql`
- `supabase/migrations/20260730010102_integrate_forge_mission_incidents.sql`
- `supabase/migrations/20260730010103_add_forge_incident_manual_resume.sql`

## Sauvegardes PostgreSQL natives

Le lot invalide précédent a été isolé dans :

`supabase/.temp/backups/20260730-forge-cody-error-handling-FAILED`

Les quatre nouvelles archives sont dans le répertoire ignoré par Git :

`supabase/.temp/backups/20260730-forge-cody-error-handling-valid`

Un rôle CLI temporaire distinct a été créé avant chaque archive. Les
identifiants sont restés en mémoire et n’ont été ni affichés ni enregistrés.

| Archive | Rôle créé | Début | Fin | Octets | Entrées | Catalogue | SHA-256 |
|---|---|---|---|---:|---:|---|---|
| `public-schema.dump` | 01:01:26+02 | 01:01:26+02 | 01:01:32+02 | 508 377 | 869 | valide | `22BD5823D5CB74619D09EA1FDAD4405A21DBE6FADFCC779A7E10B8E30B7577C7` |
| `public-data.dump` | 01:02:33+02 | 01:02:33+02 | 01:11:46+02 | 754 784 522 | 94 | valide | `5132AD671005D4A69715A9D742CEBE185F7FA11A9BFD4B4B3A364A471A988650` |
| `migration-history-schema.dump` | 01:12:23+02 | 01:12:23+02 | 01:12:26+02 | 2 231 | 3 | valide | `5BF1DF7C3F925C83D0D23C5350FCD14367F62B2C3448AE559124F45FDABF7EED` |
| `migration-history-data.dump` | 01:12:55+02 | 01:12:55+02 | 01:12:58+02 | 22 533 | 1 | valide | `FA81DD28A1B4AF08965B1C774C7136F7EA7DCD8B28B6A4BDB72A8AB9AE634689` |

`pg_restore --list` a retourné le code 0 pour chaque archive. Les deux
avertissements du dump de données publiques concernent les cycles de clés
étrangères préexistants `documents` et `daily_formations`.

Une tentative de l’archive de données a échoué avant `pg_dump` à cause d’une
syntaxe PowerShell invalide ; aucun fichier n’avait été créé et le rôle n’a pas
été réutilisé. L’archive a été recommencée avec un rôle neuf.

Commandes documentées sous forme neutralisée :

```powershell
npx.cmd supabase db dump --linked --dry-run
pg_dump -Fc --schema-only --schema=public --role=postgres --no-owner --no-privileges
pg_dump -Fc --data-only --schema=public --role=postgres --no-owner --no-privileges
pg_dump -Fc --schema-only --schema=supabase_migrations --role=postgres --no-owner --no-privileges
pg_dump -Fc --data-only --schema=supabase_migrations --role=postgres --no-owner --no-privileges
pg_restore --list <archive>
```

## Migrations et application

Premier dry-run :

```text
20260730010101_create_forge_mission_incidents.sql
20260730010102_integrate_forge_mission_incidents.sql
seeds=[]
roles=[]
```

Ces deux migrations ont été appliquées seules. La revue a ensuite identifié le
besoin d’une reprise explicite après résolution. Un second dry-run a proposé
uniquement :

```text
20260730010103_add_forge_incident_manual_resume.sql
seeds=[]
roles=[]
```

Cette migration additive a été appliquée seule. L’historique final est aligné
localement et au distant jusqu’à `20260730010103`. Le dry-run final est vide :

```text
upToDate=true
migrations=[]
seeds=[]
roles=[]
```

## Sécurité

- RLS activée sur `forge_mission_incidents` et
  `forge_mission_incident_attempts` ;
- deux politiques de lecture réservées aux profils Studio actifs `agent` ou
  `admin` ;
- aucun privilège de table pour `anon` ;
- `authenticated` possède uniquement `SELECT` sur les deux tables ;
- toutes les écritures passent par des RPC `security invoker` ;
- tous les RPC et triggers ont un `search_path` vide ;
- `anon` ne peut exécuter aucun RPC incident ;
- seuls les RPC nécessaires sont exécutables par `authenticated`.

Les advisors n’ont signalé aucune alerte sur les nouveaux objets. Les alertes
concernant d’autres tables, vues et fonctions sont préexistantes et n’ont pas
été corrigées hors périmètre.

## Tests PostgreSQL transactionnels

Le script a exécuté `SET ROLE postgres`, `BEGIN`, toutes les assertions, puis
`ROLLBACK`. Résultat final :

```json
{
  "result": "passed: transaction rolled back with no test data persisted",
  "attempt_rows_total": 0,
  "incident_rows_total": 0,
  "test_missions_remaining": 0
}
```

Scénarios vérifiés :

1. avertissement enregistré sans arrêt ;
2. erreur build résolue à la première tentative ;
3. erreur de typage résolue après deux tentatives ;
4. même correction échouée refusée sans nouvel élément ;
5. stratégie hors plan refusée ;
6. limite maximale atteinte, incident `failed` et mission `blocked` ;
7. tentative au-delà de la limite refusée ;
8. sauvegarde invalide simulée comme erreur critique et arrêt immédiat ;
9. checkpoint impossible à terminer avec l’incident critique ouvert ;
10. migration destructive imprévue bloquée ;
11. décision fonctionnelle manquante bloquée ;
12. `ignored_with_justification` sans justification refusé ;
13. pause/reprise conservant compteur et historique ;
14. reprise manuelle au checkpoint après résolution ;
15. événements bloqués et résolus présents dans le journal ;
16. aucune donnée de test persistante.

## Validation applicative

- `npm.cmd run lint` : succès, 0 erreur, 18 avertissements préexistants hors
  Forge ;
- `npm.cmd run build` : succès, compilation, TypeScript et 84 routes ;
- routes `/agent/forge`, `/agent/forge/cody` et
  `/agent/api/forge/planning` générées ;
- avertissements build préexistants : `pdfjs-dist` sans `canvas` et convention
  `middleware` dépréciée.

La revue React a vérifié les composants contrôlés, l’état dérivé, les listes à
clés stables, les états occupés, l’accessibilité des champs et l’absence de
nouvelle dépendance.

## Preview et validation visuelle

URL Preview : à compléter après le push.

La route Cody sans session sera vérifiée sur la Preview. Aucun test visuel
authentifié ne sera déclaré si la session Chrome existante ne peut pas être
pilotée sans créer un nouveau profil, conformément à la contrainte utilisateur.

Checklist manuelle si nécessaire :

1. ouvrir une mission avec incidents sur desktop puis mobile ;
2. vérifier catégories, codes, checkpoint, dates, compteurs et tentatives ;
3. vérifier la décision humaine attendue ;
4. résoudre un blocage puis utiliser la reprise explicite ;
5. contrôler le journal et le rapport Markdown.

## Risques et limites

- le moteur persistant et les garde-fous sont disponibles, mais aucun
  orchestrateur autonome général n’est ajouté : les appels RPC doivent venir
  d’un exécuteur Cody futur ;
- la liste de stratégies autorisées est volontairement fermée ;
- Cody ne doit pas être présenté comme prêt pour la production : les autres
  points de la checklist globale restent à traiter ;
- les alertes de sécurité préexistantes hors Forge restent à examiner dans une
  mission séparée.

## Livraison Git

Commit d’implémentation : à compléter après création.

Commit de documentation Preview : à compléter après création.

Aucun merge vers `main` et aucun déploiement manuel en production.
