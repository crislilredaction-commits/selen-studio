# Forge Cody — pilotage humain

Date : 30 juillet 2026

Branche : `feature/forge-cody-human-control`

Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Résultat

Le pilotage humain de Cody est implémenté et appliqué. L’interface privilégie
les missions qui réclament une action humaine, détaille leur état opérationnel
et permet aux administratrices de donner des consignes, valider ou rejeter un
plan, maintenir un blocage, abandonner ou archiver une mission.

Le modèle d’autorisation vérifié sur les données réelles est :

- `agent` actif : consultation ;
- `admin` actif : consultation, validation et administration ;
- `anon`, profil absent ou inactif : aucun accès.

La sécurité est appliquée par PostgreSQL/RLS et par les RPC, pas seulement par
l’interface. Les rôles réels observés dans `agent_profiles` sont `agent` et
`admin`.

## Périmètre fonctionnel

- tri des missions nécessitant une intervention humaine en premier ;
- compteur et indicateur d’attention ;
- affichage de l’agent, du checkpoint courant, des incidents ouverts, du plan
  courant, de sa version et de la dernière activité ;
- vue en lecture seule pour le rôle `agent` ;
- consigne mineure sans invalidation du plan ;
- consigne sensible créant une nouvelle version de plan, bloquant la mission
  et imposant une nouvelle validation ;
- historique persistant des consignes et décisions ;
- confirmations renforcées pour maintien du blocage, abandon et archivage ;
- conservation des rapports Markdown en base, avec consultation, copie et
  téléchargement dans Studio ;
- présentation responsive avec commandes tactiles de taille suffisante.

Les routes concernées sont `/agent/forge` et `/agent/forge/cody`.

## Fichiers modifiés

- `src/app/agent/forge/forge.css`
- `src/components/forge/ActivityJournal.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/forge/CorrectionComposer.tsx`
- `src/components/forge/MissionCard.tsx`
- `src/components/forge/MissionDetail.tsx`
- `src/components/forge/MissionHumanControlPanel.tsx`
- `src/components/forge/MissionReportPanel.tsx`
- `src/components/forge/ValidationChecklist.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/labels.ts`
- `src/lib/forge/types.ts`

## Sauvegardes PostgreSQL natives

Les quatre archives ont été recréées séquentiellement dans
`supabase/.temp/backups/20260730-forge-cody-human-control-valid`. Pour chaque
archive, un rôle CLI temporaire distinct a été créé, les paramètres sont restés
uniquement en mémoire, et le rôle de sauvegarde exact indiqué par la CLI a été
utilisé. Aucun secret n’a été affiché, enregistré ou committé.

Toutes les archives sont au format custom PostgreSQL 17, sans propriétaires ni
privilèges réservés. Chaque contrôle `pg_restore --list` a réussi.

| Archive | Début (Europe/Paris) | Fin | Taille | Entrées | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| Schéma public | 10:03:28 | 10:03:42 | 553 913 octets | 929 | `6B973700B5E72B9BDC53E9859351C6E89C4EBC1948C99A1ED5604B5BC173D56A` |
| Données publiques | 10:04:11 | 10:13:17 | 754 786 032 octets | 113 | `E629D9EB746A40613CA2E94AAE7B612F2C28DFB33724C46F250AE0EA1CC4AD6D` |
| Schéma de l’historique des migrations | 10:13:51 | 10:14:04 | 2 231 octets | 19 | `FBAFF6A9D73B8B67553AE6B319E507DFA775203FBA0CCFC971D01A0C1BB76B3A` |
| Données de l’historique des migrations | 10:14:23 | 10:14:35 | 28 381 octets | 17 | `170AF710ED5E197D7E2956A0D504D1550510D2B4F548E31206C72A9D54490670` |

L’archive vide de la tentative antérieure reste isolée sous
`supabase/.temp/backups/20260730-forge-cody-human-control-invalid` et n’a jamais
été réutilisée. Tout le répertoire `.temp` est ignoré par Git.

## Migrations

Les migrations suivantes ont chacune fait l’objet d’un dry-run ne proposant
qu’elle-même avant application :

1. `20260730022120_add_forge_human_control.sql`
   - ajoute les états `failed`, `abandoned` et `archived` ;
   - crée les consignes et décisions humaines avec RLS ;
   - expose le niveau d’accès courant ;
   - remplace les politiques Forge par une lecture `agent`/`admin` et une
     écriture `admin` ;
   - ajoute les RPC de consigne et de contrôle.
2. `20260730102000_allow_paused_forge_mission_abandonment.sql`
   - autorise uniquement l’abandon explicitement confirmé d’une mission en
     pause.
3. `20260730102500_allow_authenticated_forge_admin_guard.sql`
   - permet l’appel authentifié du garde administrateur, qui refuse toujours
     tout profil non administrateur.
4. `20260730103000_allow_admin_forge_control_rpc_writes.sql`
   - accorde aux RPC security-invoker les droits de table minimaux, sous RLS
     administrateur.
5. `20260730103500_use_current_forge_checkpoint_for_instruction.sql`
   - rattache une consigne sensible au checkpoint actif ou au premier
     checkpoint incomplet.

Après application, `supabase migration list` aligne le local et le distant
jusqu’à `20260730103500`. Le dry-run final retourne une base à jour : aucune
migration, aucun seed et aucune modification de rôle proposés.

## Contrôles de sécurité

- RLS active sur les nouvelles tables ;
- lecture authentifiée soumise au profil actif autorisé ;
- écritures réservées aux administratrices ;
- aucun privilège de table `forge_%` pour `anon` ;
- RPC `forge_add_human_instruction`, `forge_control_mission`,
  `forge_current_access_level` et `forge_require_admin` en security invoker,
  avec `search_path` vide ;
- aucune exécution de ces RPC pour `PUBLIC` ou `anon` ;
- les refus ne dépendent pas du masquage des boutons côté client ;
- aucune politique applicative existante n’a été désactivée.

Les avertissements historiques éventuels des advisors Supabase hors objets
Forge ne font pas partie de cette migration.

## Tests PostgreSQL transactionnels

Deux scénarios distants ont été exécutés avec un rôle temporaire, des claims
authentifiés contrôlés et un `ROLLBACK` final.

Scénario de contrôle humain :

- niveau d’accès administrateur ;
- consigne mineure ;
- mise en pause ;
- abandon confirmé depuis la pause ;
- archivage ;
- journalisation des décisions ;
- lecture autorisée au viewer mais mutation refusée ;
- lecture et exécution refusées à `anon`.

Résultat :

`{"result":"passed","test_missions_remaining":0,"test_decisions_remaining":0,"test_instructions_remaining":0}`

Scénario plan et incident :

- création d’un plan courant validé ;
- consigne sensible créant une nouvelle version non validée et bloquant la
  mission ;
- rejet et restauration de la version précédente ;
- nouvelle consigne sensible puis validation exacte de la version courante ;
- incident critique empêchant la reprise ;
- résolution humaine puis reprise contrôlée.

Résultat :

`{"result":"passed","test_missions_remaining":0,"test_incidents_remaining":0}`

Une première exécution a révélé un grant interne manquant, puis une association
au mauvais checkpoint. Les migrations correctives ci-dessus ont résolu ces
deux anomalies. Les transactions en échec ont été annulées et aucune donnée de
test ne persiste.

## Validation applicative

- `npm.cmd run lint` : réussi, aucune erreur ; 18 avertissements historiques ;
- `npm.cmd run build` : réussi avec Next.js 16.1.6, TypeScript et 84 pages ;
- routes Forge et Cody présentes dans le build ;
- `git diff --check` : réussi.

Les avertissements `pdfjs` liés à Canvas et la dépréciation du middleware
Next.js existaient déjà et sont hors périmètre.

## Validation visuelle

Les tests authentifiés automatisés n’ont pas été exécutés : l’outil disponible
impose son propre daemon et un profil navigateur séparé. Cela créerait une
nouvelle session, contrairement à la consigne de conserver le Chrome et le
profil Studio déjà authentifiés.

Checklist manuelle à effectuer sur la Preview, avec la même fenêtre Chrome :

1. ouvrir `/agent/forge/cody` en 360, 390 et 412 px, tablette, puis desktop ;
2. vérifier la liste, le compteur d’attention, l’ordre des missions et
   l’absence de débordement horizontal ;
3. vérifier les informations de carte et les détails techniques d’une mission
   bloquée ;
4. avec un profil `agent`, confirmer la lecture et l’absence de commandes
   actives ;
5. avec un profil `admin`, tester consigne mineure puis sensible, validation,
   rejet et demande de modification du plan ;
6. tester pause/reprise, blocage par incident critique et résolution ;
7. tester au clavier les confirmations de maintien du blocage, abandon et
   archivage, y compris la saisie du texte exigé ;
8. ouvrir un rapport, puis tester copie et téléchargement Markdown ;
9. suivre les journaux, dates, erreurs et changements de plan après
   actualisation ;
10. vérifier les états chargement, vide et erreur, ainsi que les zones tactiles
    et le focus visible.

## Risques et limites

- le contrôle visuel authentifié et responsive reste manuel ;
- aucune orchestration autonome supplémentaire n’a été ajoutée ;
- le niveau `agent` est volontairement en lecture seule sur toute la Forge ;
- les confirmations renforcées réduisent les erreurs humaines mais ne
  remplacent pas une revue métier des décisions irréversibles.

## Livraison

Commit d’implémentation : `f01e4d7215bd6eed1008a075e2d4f044c7c192dd`

Preview Vercel :
`https://selen-studio-git-feature-de9699-crislilredaction-4256s-projects.vercel.app/agent/forge/cody`

Le déploiement automatique du commit d’implémentation a atteint l’état
`READY`. La route protégée répond en HTTP 200 puis sert `/login` en l’absence
de session Studio (`x-matched-path: /login`). Aucun test authentifié n’est
revendiqué.

Le hash du commit documentaire final est communiqué après sa création, car un
commit ne peut pas contenir son propre hash.

Aucun merge vers `main` et aucun déploiement manuel en production n’ont été
effectués.
