# Archivage sécurisé des missions Forge

Date : 30 juillet 2026

Branche : `feature/forge-mission-archiving`

Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Modèle retenu

Le mécanisme existant utilisait une action humaine `archive`, mais remplaçait
le statut final de la mission par `archived`. Il a été corrigé avant son
premier usage réel : aucune mission distante n'avait ce statut.

L'archivage repose désormais sur deux colonnes de `public.forge_missions` :

- `archived_at timestamptz` ;
- `archived_by uuid`, lié à `auth.users`.

Le statut final (`validated`, `failed` ou `abandoned`) est conservé.
La restauration efface uniquement ces deux colonnes : elle ne modifie ni le
statut, ni le plan, ni les checkpoints, ni la progression et ne relance aucune
exécution.

Une contrainte impose que les deux métadonnées soient simultanément présentes
ou absentes. Un trigger interdit :

- l'archivage d'un statut non final ;
- un auteur différent de l'administratrice connectée ;
- une transition partielle ou incohérente ;
- toute modification du statut d'une mission déjà archivée.

## Audit de l'existant

- table principale : `public.forge_missions` ;
- 17 statuts historiques, dont `validated`, `failed`, `abandoned` et un ancien
  statut `archived` qui n'avait encore aucune ligne distante ;
- 14 relations vers les journaux, validations, corrections, rapports, briefs,
  plans, checkpoints, historiques de checkpoints, incidents, tentatives,
  actions de plan, consignes, décisions et alertes ;
- les relations existantes utilisent `ON DELETE CASCADE`, mais l'archivage
  n'effectue aucun `DELETE` ;
- RLS active et politiques admin-only sur `forge_missions` ;
- aucune colonne d'archivage de mission avant cette migration ;
- la liste Cody chargeait toutes les missions sans distinguer archives et
  missions actives ;
- l'action humaine `archive` existante changeait le statut et a été réorientée
  vers le nouveau mécanisme persistant.

## Migration

Migration créée et appliquée :

`20260730170000_add_forge_mission_archiving.sql`

Objets ajoutés ou modifiés :

- colonnes `archived_at`, `archived_by` ;
- clé étrangère vers `auth.users` avec suppression restreinte ;
- contrainte de cohérence des deux colonnes ;
- index partiel de file active et index partiel des archives ;
- action d'audit `mission_restored` ;
- trigger `forge_missions_archiving_guard` ;
- fonctions `forge_guard_mission_archiving()` et
  `forge_set_mission_archived(uuid, boolean, text)` ;
- redéfinition compatible de `forge_control_mission(...)` afin que son action
  historique `archive` utilise les métadonnées sans changer le statut.

Les fonctions sont `security invoker`. L'exécution métier est accordée à
`authenticated`, puis le garde-fou `forge_require_admin()` et la RLS exigent
un profil Studio administrateur actif. `anon` et `PUBLIC` n'ont aucun droit
d'exécution.

## Règles métier

Sont archivables :

- `validated` ;
- `abandoned` ;
- `failed`, qui correspond au statut d'échec définitif existant.

Tous les autres statuts sont refusés, notamment les états de planification,
attente, exécution, pause, revue, correction ou blocage humain.

Chaque archivage et restauration crée :

- une décision dans `forge_human_decisions` ;
- une entrée dans `forge_activity_logs` ;
- un motif obligatoire ;
- le même statut dans `previous_status` et `resulting_status`.

## Interface et API

La liste active exclut désormais explicitement `archived_at IS NOT NULL`.
L'action « Archiver » conserve sa confirmation forte et explique que le
rapport et l'historique restent disponibles.

La route `/agent/forge/cody/archives` propose :

- recherche par titre, projet ou branche ;
- filtre par statut final ;
- filtre par Compagnon ;
- filtre par mois d'archivage ;
- ouverture du rapport Markdown ;
- accès à la Preview enregistrée ;
- détails techniques principaux ;
- restauration confirmée, sans reprise automatique ;
- mise en page desktop et mobile.

L'API `/agent/api/forge/archives` fournit la liste, l'archivage et la
restauration. Elle appelle `requireStudioAdmin()` avant toute lecture du corps
ou requête Supabase :

- session absente : `401` ;
- session Studio agent : `403` ;
- administratrice active : traitement sous sa session RLS ;
- UUID, action et motif validés côté serveur ;
- aucune clé `service_role` utilisée.

## Sauvegardes PostgreSQL natives

Quatre nouvelles archives ont été créées avant le dry-run dans le répertoire
ignoré :

`supabase/.temp/backups/20260730-forge-mission-archiving-valid`

Chaque archive utilise un rôle temporaire renouvelé, un format custom, sans
propriétaires ni privilèges réservés. Chaque commande s'est terminée avec
succès et chaque fichier est reconnu par `pg_restore --list`.

| Archive | Début | Fin | Taille | Entrées | SHA-256 |
|---|---|---|---:|---:|---|
| Schéma public | 15:20:32 | 15:20:50 | 614 553 | 1 011 | `C69F49A5B3CD7B5B7E4ACF2A8F3B94145D4415D2899070D04773C814815F7D87` |
| Données publiques | 15:20:50 | 15:30:51 | 754 788 851 | 104 | `0E5FC76CACF8FE014C8BF7D76684361F1F5420ABB3477161EDCCCE4F1A2A637E` |
| Schéma historique | 15:31:01 | 15:31:19 | 2 231 | 3 | `4F80F9F19BA7A7279AB51A189E9047087B5384FF165DA67411DF2E31F595790F` |
| Données historique | 15:31:19 | 15:31:36 | 36 093 | 1 | `B524F5A4F6B230B00CE35B11D17E49A7839EDA1B18A5DA6BB447DD861E214562` |

Aucun secret ni identifiant temporaire n'est consigné dans ce rapport ou dans
Git.

## Dry-run et application

Avant application :

- historique aligné jusqu'à `20260730160000` ;
- seule migration proposée :
  `20260730170000_add_forge_mission_archiving.sql` ;
- aucun seed ;
- aucune modification de rôle.

Après application :

- migration présente localement et au distant ;
- dry-run final : base à jour, migrations, seeds et rôles vides ;
- 19 tables Forge sur 19 avec RLS active ;
- aucune politique `viewer` ;
- aucun grant de table Forge à `anon` ou `PUBLIC` ;
- aucune alerte Supabase Advisor liée aux nouveaux objets Forge.

Les avis Advisor historiques hors Forge n'ont pas été modifiés.

## Tests par rôle et intégrité

### PostgreSQL transactionnel

Tous les scénarios ont été exécutés sous transaction avec `ROLLBACK` :

- administratrice : archivage d'une mission `validated` ;
- conservation exacte de son statut ;
- visibilité dans l'ensemble Archives et retrait de l'ensemble actif ;
- refus de modifier le statut pendant l'archivage ;
- restauration avec statut final inchangé ;
- archivage d'une mission `abandoned` ;
- refus d'archiver une mission `in_progress` ;
- agent humain : aucune archive lisible, RPC refusée, aucune modification ;
- anonyme : table et RPC inaccessibles.

Les nombres de plans, checkpoints, incidents, rapports et alertes ont été
comparés avant et après archivage/restauration et sont restés identiques.
Les journaux et décisions sont conservés. Les tests ont retourné :

`forge_mission_archiving_transaction_checks_ok`

État final distant :

- une mission métier, toujours `validated` ;
- zéro mission réellement archivée ;
- zéro mission technique de test ;
- aucune donnée de test persistante.

### Application

- tests Node ciblés : 12/12 réussis ;
- régressions admin-only et Telegram incluses ;
- lint : 0 erreur, 18 avertissements préexistants hors périmètre ;
- TypeScript `--noEmit` : réussi ;
- build Next.js complet : réussi, 89 routes générées ;
- route API `/agent/api/forge/archives` détectée ;
- page `/agent/forge/cody/archives` détectée.

Les avertissements préexistants `pdfjs/canvas`, type de modules des tests et
dépréciation `middleware` restent hors périmètre.

## Fichiers modifiés

- `src/app/agent/api/forge/archives/route.ts`
- `src/app/agent/forge/cody/archives/page.tsx`
- `src/app/agent/forge/forge.css`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/ForgeMissionArchives.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/types.ts`
- `supabase/migrations/20260730170000_add_forge_mission_archiving.sql`
- `tests/forgeMissionArchiving.test.ts`
- `docs/forge-mission-archiving-implementation.md`

Les scripts temporaires et archives sous `supabase/.temp` sont ignorés et ne
seront pas suivis.

## Contrôle visuel

Les tests visuels authentifiés ne sont pas déclarés comme réalisés. La mission
interdit d'ouvrir une nouvelle session Chrome lorsque l'instance authentifiée
existante n'est pas pilotable depuis l'environnement actuel.

Checklist manuelle sur la Preview :

1. avec l'administratrice, ouvrir une mission finale et vérifier la
   confirmation « Archiver » ;
2. confirmer que le texte annonce la conservation du rapport et de
   l'historique ;
3. vérifier le retrait immédiat de la liste active ;
4. ouvrir `/agent/forge/cody/archives`, rechercher et filtrer la mission ;
5. ouvrir son rapport et ses détails techniques ;
6. restaurer la mission et vérifier que son statut final reste inchangé ;
7. confirmer qu'aucun traitement ne redémarre ;
8. vérifier desktop et mobile ;
9. avec un agent Studio, vérifier l'absence de navigation Forge, la
   redirection serveur et les réponses API `403` ;
10. sans session, vérifier la réponse `401` et la redirection vers `/login`.

## Telegram, risques et limites

- cron Telegram contrôlé après migration et après tests : désactivé ;
- aucun message Telegram réel envoyé ;
- aucune modification Vault ;
- aucune suppression physique de mission ou de relation ;
- le statut historique `archived` reste autorisé par la contrainte pour la
  compatibilité du schéma, mais le code et les RPC corrigés ne l'utilisent
  plus ;
- les contrôles visuels multi-rôles restent manuels.

## Correctif de configuration Preview

Après la première livraison, la Preview affichait deux blocages distincts :

- les appels `POST /agent/api/forge/planning` retournaient réellement `503` ;
- les lectures Supabase directes du navigateur échouaient et étaient masquées
  par un message générique accusant à tort la migration.

Les logs Vercel du déploiement `78a57e0` confirment deux réponses `503` de la
route de planification. Dans son code, cette réponse n'est émise qu'en
l'absence de `OPENAI_API_KEY`.

La configuration locale valide contenait bien :

- `NEXT_PUBLIC_SUPABASE_URL`, ciblant le projet Selen Studio attendu ;
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ;
- `SUPABASE_SERVICE_ROLE_KEY` ;
- `OPENAI_API_KEY`.

Ces quatre variables ont été copiées sans afficher leur valeur vers la seule
portée Vercel `Preview`, avec stockage sensible. Aucun environnement
Production n'a été modifié.

La nouvelle construction Preview est nécessaire parce que les variables
`NEXT_PUBLIC_*` sont intégrées au bundle lors du build. Le client Supabase
valide désormais explicitement leur présence. La page Cody conserve un message
principal compréhensible et affiche l'erreur réelle dans une zone « Détail
technique », au lieu de conclure automatiquement que la migration manque.

Validations du correctif :

- tests ciblés : 10/10 ;
- lint : 0 erreur, 18 avertissements préexistants ;
- TypeScript : réussi ;
- build complet : réussi ;
- protections admin-only et RLS inchangées ;
- aucun secret ajouté à Git ;
- cron Telegram toujours désactivé et aucun message réel envoyé.

## Retour arrière

Ne pas utiliser `db reset` ni modifier l'historique. Avant tout retour arrière,
créer de nouvelles sauvegardes.

Le retour applicatif consiste à revenir aux commits précédents. Le retour SQL
doit être une migration corrective explicite qui :

1. redéfinit `forge_control_mission` selon la décision produit retenue ;
2. révoque puis supprime la RPC et le trigger d'archivage ;
3. ne supprime les colonnes qu'après export et validation qu'aucune mission
   n'est archivée ;
4. conserve les décisions et journaux déjà créés.

## Livraison

- commit d'implémentation :
  `df4a4ee6dcc5fda93d11cf983db179a7f9552db1` ;
- commit documentaire final : communiqué dans le retour de livraison, car un
  commit ne peut pas contenir sa propre empreinte ;
- Preview Vercel de branche :
  `https://selen-studio-git-feature-9b531f-crislilredaction-4256s-projects.vercel.app` ;
- déploiement du commit d'implémentation : `READY` ;
- aucun merge vers `main` ;
- aucun déploiement manuel en Production.
