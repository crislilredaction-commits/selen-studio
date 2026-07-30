# Sécurisation administrateur de La Forge

Date : 30 juillet 2026  
Branche : `feature/forge-admin-only-access`  
Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Périmètre réalisé

La Forge est désormais réservée aux profils Studio actifs dont le rôle est
`admin`. La protection est appliquée à trois niveaux complémentaires :

- navigation : les entrées « La Forge » et « Alertes de La Forge » sont
  masquées pour les agents ;
- serveur Next.js : le layout commun bloque toutes les routes actuelles et
  futures sous `/agent/forge` avant le rendu, et l'API de planification exige
  également un administrateur ;
- Supabase : les lectures directes côté client et les RPC reposent sur un
  niveau d'accès Forge qui ne reconnaît plus le rôle agent.

Le worker Telegram reste un parcours technique distinct : il est limité à
l'environnement Vercel Production, protégé par secret et verrou
d'exécution. Son cron est resté désactivé et aucun message Telegram réel n'a
été envoyé.

## Cartographie contrôlée

### Routes et navigation

- `/agent/forge`
- `/agent/forge/cody`
- `/agent/forge/alerts`
- liens Forge de `AgentSidebar`
- compteur d'alertes de la barre latérale

Le compteur n'interroge plus `forge_alerts` pour un agent, ce qui évite aussi
une fuite de métadonnées.

### API et accès serveur

- `POST /agent/api/forge/planning` : `requireStudioAdmin`
- `/agent/api/forge/telegram` : protection propriétaire Lil existante,
  plus stricte qu'un accès agent
- `/agent/api/jobs/forge-telegram-alerts` : worker non interactif Production,
  secret et verrou conservés
- `src/lib/forge/data-access.ts` : accès directs protégés par la RLS

### Objets Supabase

L'introspection distante a trouvé 19 tables `public.forge_%`, toutes avec RLS
active, sans vue Forge publique. Les politiques de lecture des objets métier,
rapports, briefs, plans, checkpoints, incidents, actions, instructions,
décisions, alertes et événements d'alertes exigent maintenant
`forge_current_access_level() = 'admin'`.

Les tables techniques Telegram conservent leurs politiques spécialisées et
leurs accès de service. Les fonctions métier restent `security invoker`.
Les fonctions techniques du worker restent réservées à `service_role`.

## Migration

Migration créée et appliquée :

`20260730160000_enforce_forge_admin_only.sql`

Elle :

1. redéfinit `public.forge_current_access_level()` pour retourner seulement
   `admin` ou `none` ;
2. remplace les politiques de lecture génériques Forge par des politiques
   administrateur ;
3. remplace les lectures « Studio staff » des alertes par des lectures
   administrateur ;
4. révoque l'exécution de la fonction d'accès à `PUBLIC` et `anon`, puis
   l'accorde à `authenticated`.

Elle ne modifie aucune donnée métier, table, colonne, contrainte, trigger ou
fonction métier.

## Sauvegardes PostgreSQL natives

Les quatre archives ont été créées avant la migration dans le répertoire
ignoré `supabase/.temp/backups/20260730-forge-admin-only-access-valid`.
Chaque `pg_dump` s'est terminé avec succès et chaque archive a été reconnue
par `pg_restore --list`.

| Archive | Taille | Entrées | SHA-256 |
|---|---:|---:|---|
| Schéma public | 615 525 octets | 1 011 | `723235F226F67ADDF3BB140AE1AB4A4FEFD11547A523551DA95AF637494E2B56` |
| Données publiques | 754 788 564 octets | 104 | `AC0E3B12BF53054EB025D826E24BF6E0D92C9C33EFAD29D61DBA25D336781C6C` |
| Schéma de l'historique | 2 231 octets | 3 | `5BFFCFBEB26FFBEBF8638ABEAB5BCC6DC387DA71CDF5C4305BA02F665D31A7CB` |
| Données de l'historique | 35 881 octets | 1 | `7A31632E36E07737CB9E3EDD40BE530E0D4F84C9B2833A2900DDDBCB0189528E` |

Aucun secret ni identifiant sensible n'est présent dans ce rapport ou dans
les fichiers suivis par Git.

## Validation Supabase

Le dry-run avant application ne proposait que la migration de cette mission.
Après application :

- historique local et distant aligné sur `20260730160000` ;
- dry-run final : `upToDate: true`, migrations, seeds et rôles vides ;
- 19 tables Forge contrôlées avec RLS active ;
- 36 politiques Forge contrôlées ;
- aucune politique de lecture agent restante ;
- aucun privilège Forge pour `anon` ou `PUBLIC` ;
- cron Telegram présent mais inactif.

## Tests

### PostgreSQL transactionnel

Les scénarios ont utilisé les profils actifs réels, sans exposer leur
identité, et se sont terminés par `ROLLBACK`.

| Rôle | Résultat |
|---|---|
| Administrateur actif | niveau `admin`, garde-fou accepté, lecture des 19 tables possible |
| Agent actif | niveau `none`, zéro ligne visible sur les 19 tables, zéro modification, garde-fou refusé |
| Anonyme | fonction d'accès et 19 tables inaccessibles |

Aucune donnée de test ne persiste.

### Application

- tests ciblés Node : 7/7 réussis ;
- vérification du garde au niveau du layout avant le rendu ;
- vérification des deux liens administrateur et du compteur d'alertes ;
- vérification de l'API de planification administrateur ;
- tests Telegram exclusivement mockés ;
- lint : 0 erreur, 18 avertissements préexistants hors périmètre ;
- TypeScript `--noEmit` : réussi ;
- build Next.js complet : réussi, avec les avertissements préexistants
  `pdfjs/canvas` et la dépréciation `middleware`.

## Contrôles visuels

Les tests visuels authentifiés ne sont pas déclarés comme réalisés : la
contrainte de mission impose de réutiliser une instance Chrome et son profil
déjà authentifié, mais cette instance n'est pas pilotable depuis
l'environnement actuel. Aucune nouvelle session temporaire n'a été ouverte.

Checklist manuelle sur la Preview :

1. administrateur : vérifier l'affichage des deux liens et l'accès aux trois
   routes Forge ;
2. agent : vérifier l'absence des liens et la redirection vers `/agent` lors
   d'un accès direct aux trois routes ;
3. agent : vérifier que `POST /agent/api/forge/planning` répond `403` ;
4. session anonyme : vérifier la redirection vers `/login` ;
5. contrôler les mises en page mobile et desktop.

## Risques et limites

- Le masquage de navigation dépend du chargement client du rôle, mais le
  garde serveur et la RLS restent les autorités de sécurité.
- Les contrôles visuels multi-rôles restent manuels pour préserver la session
  Chrome existante.
- Les 18 avertissements lint et les avertissements `pdfjs/canvas` sont
  préexistants et hors du périmètre de cette mission.

## Retour arrière

Avant tout retour arrière, conserver les quatre archives ci-dessus et
effectuer une nouvelle sauvegarde. Le retour applicatif consiste à revenir au
commit précédent. Le retour SQL doit être une nouvelle migration explicite
qui restaure la définition et les politiques antérieures ; ne pas modifier
l'historique ni utiliser `db reset`.

## Livraison

- commit d'implémentation : `f78537314fed2de610f090c85f873024a28021cd` ;
- commit final : hash communiqué dans le retour de livraison (un commit ne
  peut pas contenir sa propre empreinte) ;
- Preview Vercel de branche :
  `https://selen-studio-git-feature-1e4592-crislilredaction-4256s-projects.vercel.app` ;
- premier déploiement du commit d'implémentation : `READY` ;
- aucun merge vers `main` ;
- aucun déploiement manuel en production.
