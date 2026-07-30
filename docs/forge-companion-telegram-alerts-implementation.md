# Relais Telegram privé des alertes Forge

## Périmètre livré

Branche : `feature/forge-companion-telegram-alerts`.

Le centre d’alertes Forge reste la source de vérité. Les alertes importantes sont
placées dans une file PostgreSQL dédupliquée, puis traitées côté serveur. Le jeton
du bot et l’identifiant du salon privé ne transitent jamais vers le navigateur ni
vers la base.

Le relais comporte :

- une activation métier administrable depuis le centre d’alertes ;
- une autorisation supplémentaire par environnement ;
- une file avec trois tentatives maximum et délai progressif ;
- un worker protégé par `CRON_SECRET`, prêt pour un ordonnanceur compatible ;
- des messages adressés directement à Lil, avec lien vers le Studio ;
- un test manuel exigeant une confirmation explicite et marqué `[TEST]`.

Aucun message Telegram réel n’a été envoyé pendant cette mission.

## Migration

Migration créée et appliquée :
`20260730143000_create_forge_telegram_alert_delivery.sql`.

Objets créés :

- `public.forge_telegram_settings` ;
- `public.forge_telegram_deliveries` ;
- trigger `forge_alerts_enqueue_telegram` ;
- fonctions `forge_enqueue_telegram_alert`,
  `forge_claim_telegram_deliveries` et `forge_finish_telegram_delivery`.

La migration ne contient ni seed métier, ni modification de rôle, ni donnée de
test persistante.

## Sauvegardes PostgreSQL natives

Nouveau jeu validé dans le dossier Git ignoré
`supabase/.temp/backups/20260730-forge-telegram-alerts-retry-valid`.
Chaque archive a utilisé un rôle temporaire renouvelé par la CLI. Aucun
identifiant temporaire ni secret n’est reproduit ici.

| Archive | Début | Fin | Taille | Entrées | SHA-256 | `pg_restore --list` |
|---|---|---|---:|---:|---|---|
| public-schema | 2026-07-30 12:44:31 +02:00 | 12:44:48 | 598 038 octets | 986 | `D7DA7B2DBDDD8A662836A4243B36931DED3018DD49BCD59D63EB8E25A4F703CA` | succès |
| public-data | 2026-07-30 12:44:49 +02:00 | 12:55:55 | 754 787 533 octets | 101 | `9CC46FDBAD18358B63B8B740DE1F822888646FC8C03E438F2DDB99D739FD9050` | succès |
| migration-history-schema | 2026-07-30 12:56:05 +02:00 | 12:56:17 | 2 231 octets | 3 | `9B4010C780079555187FC20A6C2536DCB6A69F5AAD38C1E8CA712343C2940D0A` | succès |
| migration-history-data | 2026-07-30 12:56:17 +02:00 | 12:56:28 | 33 727 octets | 1 | `8169A2C30BA8CA63394D36624FAE9DA23182990F74DBDFFAFFC93DF78419DAF4` | succès |

L’ancienne archive `public-data.INVALID-0-BYTE.dump` reste isolée dans le dossier
de la tentative précédente et n’a pas été réutilisée.

## Commandes et résultats

- `npm.cmd run lint` : succès, 18 avertissements préexistants hors périmètre.
- `npm.cmd run build` : succès ; routes Forge, alertes, Cody et Telegram générées.
  Les avertissements `canvas`/PDF et la dépréciation `middleware` préexistaient.
- `node --experimental-strip-types --test tests/forgeTelegram.test.ts` :
  3 tests mockés réussis, aucun appel réseau réel.
- `npx.cmd supabase db push --dry-run` avant application : uniquement la
  migration `20260730143000`, aucun seed, aucun rôle.
- `npx.cmd supabase db push` : migration appliquée avec succès.
- `npx.cmd supabase migration list` : historique local et distant aligné jusqu’à
  `20260730143000`.
- `npx.cmd supabase db push --dry-run` final : base à jour, liste vide.

## Sécurité et tests transactionnels

Les contrôles PostgreSQL distants ont vérifié :

- RLS active sur les deux tables Telegram ;
- aucune permission de table pour `anon` ;
- lecture et modification de la configuration réservées aux administrateurs
  Forge ;
- lecture de la file réservée aux administrateurs Forge ;
- fonctions de traitement inaccessibles à `anon` et `authenticated` ;
- exécution des fonctions de worker accordée uniquement à `service_role` ;
- création automatique d’une livraison pour une alerte importante ;
- mise à jour cohérente de l’état externe de l’alerte ;
- transaction de test annulée avec `ROLLBACK` ;
- absence de donnée de test après le rollback.

Les tests mockés couvrent le format du message de test, un traitement réussi de
la file et l’absence totale d’appel réseau dans un environnement non autorisé.

## Configuration attendue

Variables serveur, jamais préfixées par `NEXT_PUBLIC_` :

- `FORGE_TELEGRAM_BOT_TOKEN` ;
- `FORGE_TELEGRAM_LIL_CHAT_ID` ;
- `FORGE_TELEGRAM_ENABLED` ;
- `FORGE_TELEGRAM_ALLOWED_ENV` ;
- `FORGE_STUDIO_PUBLIC_URL` ;
- `CRON_SECRET`.

La présence avait été annoncée comme prête par l’utilisatrice. La première
commande locale de lecture des métadonnées Vercel a expiré sans résultat ; aucune
valeur n’a été lue ou affichée. Le panneau Studio expose seulement des booléens
`configured`, `enabled` et `allowed`, jamais les secrets.

## Limites et contrôles visuels

- Preview automatique :
  `https://selen-studio-git-feature-74b1d6-crislilredaction-4256s-projects.vercel.app/agent/forge/alerts`.
  Le déploiement du correctif Vercel a atteint l’état `READY`.
- Les crons Vercel s’exécutent en production, pas sur une Preview standard.
- La première Preview automatique a échoué parce que le plan Vercel Hobby
  refuse le cron toutes les cinq minutes. La configuration incompatible a été
  retirée afin de ne pas remplacer silencieusement une alerte rapide par un
  traitement quotidien. Le déclenchement automatique fréquent reste bloqué
  jusqu’au choix d’un plan Vercel Pro ou d’un ordonnanceur externe approuvé.
- Aucun message réel ne sera testé sans nouvelle autorisation explicite.
- Le contrôle visuel restant consiste à vérifier sur la Preview :
  l’affichage du panneau administrateur, son état d’environnement, le bouton
  pause/activation, le dialogue de confirmation du test sans le confirmer, et
  les vues mobile et desktop.
- La Preview est protégée par l’authentification Vercel. Aucun nouveau profil
  Chrome temporaire n’a été ouvert ; les contrôles visuels authentifiés restent
  donc explicitement manuels.
- Une configuration absente ou un environnement non autorisé bloque l’envoi de
  façon sûre et conserve les alertes dans le Studio.

## Retour arrière

En urgence, définir `FORGE_TELEGRAM_ENABLED=false` ou désactiver le canal dans le
Studio suffit à arrêter les envois sans toucher aux alertes. Un retour SQL doit
être préparé séparément et revu avant exécution ; aucune suppression automatique
des tables ou de leur historique n’est incluse.
