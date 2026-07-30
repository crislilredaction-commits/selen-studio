# Forge Cody — centre d’alertes interne

Date : 30 juillet 2026

Branche : `feature/forge-cody-alert-center`

Projet Supabase : Selen Studio (`pjbilmywwkpghhayftph`)

## Résultat

Un centre d’alertes mobile-first est disponible dans Selen Studio à la route
`/agent/forge/alerts`. Il présente uniquement des événements Forge utiles,
priorise les décisions humaines et renvoie directement vers la mission Cody
concernée.

Les messages s’adressent directement à Lil, au tutoiement, avec un ton naturel.
Le problème et l’action attendue figurent dans le message principal ; les codes,
identifiants et autres détails restent dans une zone secondaire repliable.

Telegram et l’e-mail ne sont ni configurés ni appelés.

## Modèle de données

`forge_alerts` conserve :

- type, niveau, titre, message et Compagnon ;
- mission, incident, checkpoint et plan liés ;
- cible et libellé d’action ;
- statut, lecture, résolution et archivage ;
- clé de déduplication ;
- détails techniques facultatifs ;
- éligibilité et état préparatoire pour de futurs canaux externes.

`forge_alert_events` journalise uniquement les interactions importantes :

- lecture ;
- ouverture du contexte ;
- archivage.

Les statuts sont `unread`, `read`, `action_required`, `resolved` et `archived`.
Les niveaux sont `information`, `attention`, `important` et `critical`, affichés
en français.

## Création, déduplication et résolution

Des triggers dérivent les alertes des sources de vérité existantes :

- mission bloquée, terminée ou échouée ;
- plan courant prêt à valider ;
- incident critique ou décision humaine ;
- incident résolu rendant la mission reprenable ;
- rapport final prêt ;
- Preview renseignée dans le rapport.

La clé métier identifie l’objet ou l’occurrence source. Un index unique partiel
interdit deux alertes actives de même clé. Une occurrence réellement nouvelle
peut produire une nouvelle alerte après résolution de la précédente.

Une validation de plan, une résolution d’incident ou la levée d’un blocage
résout l’alerte source sans la supprimer. Une alerte métier active ne peut pas
être résolue depuis le centre. Seule une alerte déjà résolue peut être archivée.

## Interface

- entrée et compteur dans la navigation Studio ;
- compteur des alertes à lire ou traiter ;
- tri : action requise, niveau, date ;
- filtres toutes, action requise, non lues, critiques, résolues ;
- filtre Compagnon et affichage facultatif de l’historique ;
- lecture individuelle ou multiple ;
- accès direct à la mission par paramètre `mission` ;
- archivage des seules alertes résolues ;
- cartes verticales et boutons tactiles sur petit écran ;
- niveau, action et état exprimés par du texte en plus de la couleur ;
- erreurs de connexion formulées clairement pour Lil.

Le rôle `agent` est en lecture seule. Le rôle `admin` peut lire, marquer comme
lu, ouvrir le contexte et archiver une alerte résolue.

## Fichiers

- `src/app/agent/forge/alerts/page.tsx`
- `src/app/agent/forge/forge.css`
- `src/components/forge/ForgeAlertCenter.tsx`
- `src/components/forge/CodyWorkspace.tsx`
- `src/components/layout/AgentSidebar.tsx`
- `src/lib/forge/data-access.ts`
- `src/lib/forge/types.ts`
- `supabase/migrations/20260730111500_create_forge_alert_center.sql`
- `supabase/migrations/20260730115000_allow_admin_alert_trigger_writes.sql`
- `supabase/migrations/20260730120500_add_forge_alert_audit_events.sql`

## Sauvegardes PostgreSQL natives

Chaque archive a utilisé un rôle CLI temporaire renouvelé, conservé uniquement
en mémoire. Les archives sont au format custom PostgreSQL 17, non vides et
validées immédiatement par `pg_restore --list`.

| Archive | Début | Fin | Taille | Entrées | SHA-256 |
| --- | --- | --- | ---: | ---: | --- |
| Schéma public | 11:04:06 | 11:04:20 | 572 288 octets | 949 | `10C19DA62797B422A9707D0191667693325034242EBA32A7DE690FC9D0270E3D` |
| Données publiques | 11:04:20 | 11:13:41 | 754 786 725 octets | 99 | `F75F03986F9E1F6F080227A612129354DDCDE9A083D78FF6E3F992C4A5295DE2` |
| Schéma historique migrations | 11:13:51 | 11:14:09 | 2 231 octets | 3 | `4E347DBDDB240593B659EDE0F530E5F102C2AEEBAB34A3FD718484DCE266E04B` |
| Données historique migrations | 11:14:09 | 11:14:23 | 30 688 octets | 1 | `01A911DC6A13771DED921A9A7912836DF038015A973010335D4E75CFB7E044BA` |

Répertoire local ignoré :
`supabase/.temp/backups/20260730-forge-cody-alert-center-valid`.

## Migrations et commandes

Chaque migration a été précédée d’un dry-run ne proposant qu’elle-même :

1. `20260730111500_create_forge_alert_center.sql` ;
2. `20260730115000_allow_admin_alert_trigger_writes.sql` ;
3. `20260730120500_add_forge_alert_audit_events.sql`.

La deuxième migration donne aux triggers `security invoker` les droits
minimaux d’insertion sous une politique RLS administrateur. La troisième ajoute
le journal concis des interactions.

Commandes principales :

```text
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
npx.cmd supabase db push
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

L’historique local/distant est aligné jusqu’à `20260730120500`. Le dry-run final
est vide : aucune migration, aucun seed et aucune modification de rôle.

## Sécurité

- RLS active sur `forge_alerts` et `forge_alert_events` ;
- cinq politiques au total ;
- lecture réservée aux profils Studio actifs `agent` ou `admin` ;
- mutations réservées au profil `admin` ;
- aucun privilège de table pour `anon` ;
- aucune exécution de RPC d’alerte pour `PUBLIC` ou `anon` ;
- fonctions en `security invoker` avec `search_path` fixé ;
- grants explicites et limités aux opérations utilisées ;
- l’advisor ne signale aucun nouvel objet Forge ; ses avis restants concernent
  des objets historiques hors périmètre.

## Tests transactionnels

Le scénario PostgreSQL distant, terminé par `ROLLBACK`, couvre :

- alerte de blocage ;
- alerte de validation de plan ;
- incident critique ;
- mission reprenable après résolution ;
- mission terminée ;
- rapport et Preview disponibles ;
- déduplication d’un même blocage ;
- résolution automatique du plan et de l’incident ;
- refus d’archiver une alerte active ;
- lecture multiple ;
- journalisation de la lecture et de l’ouverture ;
- création par une administratrice réellement authentifiée ;
- refus de mutation au viewer ;
- refus de lecture à `anon`.

Résultat final :

```json
{
  "result": "passed",
  "test_missions_remaining": 0,
  "authenticated_test_missions_remaining": 0,
  "test_alerts_remaining": 0,
  "test_alert_events_remaining": 0
}
```

Deux premières exécutions ont été annulées par des garde-fous existants
(checkpoint non initialisé pour une clé de test, puis plan non lié à
l’exécution). Le scénario a été corrigé pour respecter le modèle réel. Une
troisième exécution a réussi fonctionnellement puis a échoué uniquement sur le
contrôle post-rollback faute de rôle de lecture ; elle a également été annulée.

## Validation applicative

- lint : réussi, 0 erreur et 18 avertissements historiques ;
- TypeScript : réussi ;
- build Next.js 16.1.6 : réussi, 85 pages ;
- routes `/agent/forge`, `/agent/forge/cody` et `/agent/forge/alerts` présentes ;
- `git diff --check` : réussi.

Les avertissements historiques `pdfjs`/Canvas et la dépréciation du middleware
Next.js sont hors périmètre.

## Tests visuels

Les tests authentifiés automatisés ne sont pas revendiqués : l’outil disponible
créerait une nouvelle session ou un profil navigateur distinct, contraire à la
consigne de conserver le Chrome Studio déjà authentifié.

Checklist manuelle dans la même fenêtre Chrome :

1. ouvrir `/agent/forge/alerts` en 360, 390, 412 px, tablette et desktop ;
2. vérifier l’absence de débordement horizontal et la lisibilité du compteur ;
3. tester chaque filtre, le filtre Compagnon et l’historique résolu ;
4. vérifier l’ordre critique, action requise, important, informatif ;
5. tester lecture individuelle et multiple ;
6. ouvrir une mission liée en un geste et confirmer la mission sélectionnée ;
7. vérifier qu’une alerte active ne propose pas l’archivage ;
8. archiver une alerte résolue ;
9. vérifier le détail technique replié et le message principal sans jargon ;
10. tester clavier, focus visible et boutons sans survol ;
11. couper temporairement le réseau et vérifier le message d’erreur ;
12. avec un viewer, confirmer la lecture seule ; sans session, confirmer la
    redirection vers `/login`.

## Limites et prochaines étapes

- pas d’envoi Telegram ni e-mail ;
- pas d’alerte pour chaque checkpoint ou ligne de journal ;
- pas de backfill artificiel des événements historiques antérieurs à la
  migration ;
- contrôle visuel authentifié et responsive restant manuel ;
- Cody n’est pas présenté comme prêt pour la production.

Restent hors périmètre : Telegram privé, e-mail de secours, archivage global des
missions, durcissement NDA restant et test réel d’autonomie avant production.

## Livraison

Commit d’implémentation : à renseigner après commit.

Preview Vercel : à renseigner après le push.

Aucun merge vers `main` et aucun déploiement manuel en production.
