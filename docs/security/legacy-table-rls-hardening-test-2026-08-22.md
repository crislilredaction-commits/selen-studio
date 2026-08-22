# Test transactionnel du durcissement RLS historique — 22 août 2026

## Objet

Valider le brouillon `legacy-table-rls-hardening-draft.sql` sans laisser aucune modification persistante sur le projet Supabase Selen Studio.

## Méthode

Le SQL de durcissement a été exécuté dans des transactions explicites `BEGIN ... ROLLBACK` sur le projet Supabase Selen Studio, sans suppression ni modification durable de données métier.

Les tests ont contrôlé :

- l'état du schéma pendant la transaction ;
- le retour exact à l'état initial après rollback ;
- l'absence d'accès direct pour un utilisateur `authenticated` non-staff ;
- le maintien de l'accès direct attendu pour un compte staff actif.

## Modèle testé

L'inspection du parcours NDA Vitrine confirme que l'accès métier client ne dépend pas d'un accès direct RLS aux tables historiques :

- la page NDA utilise le client Supabase navigateur pour Auth ;
- les lectures et écritures métier passent par des routes serveur ;
- ces routes vérifient explicitement le dossier et l'organisation du client ;
- après autorisation, elles utilisent le client Supabase service role ;
- la propriété NDA historique est vérifiée notamment par correspondance entre l'email authentifié et l'email de l'organisation.

La base contient actuellement 0 adhésion d'organisation active alors que des dossiers NDA historiques existent. Il serait donc incorrect de faire dépendre leur fonctionnement actuel de `organisation_memberships`. Le brouillon strict conserve les parcours clients via les routes serveur et réserve l'accès direct aux tables métier historiques au staff Selen.

## Résultat structurel pendant la transaction

Avec la version stricte actuelle du brouillon :

- 10 / 10 tables historiques avec RLS activé ;
- 11 policies du lot créées ;
- 0 privilège direct restant pour `anon` sur les 10 tables ;
- 0 privilège `TRUNCATE`, `REFERENCES` ou `TRIGGER` restant pour `authenticated` sur les 10 tables ;
- aucune erreur SQL de création des policies.

Les 11 policies correspondent à :

- 2 policies sur `profiles` : lecture de son propre profil + accès staff ;
- 1 policy staff-only sur chacune des 9 autres tables métier historiques.

## Test utilisateur authenticated non-staff

Le test a utilisé des claims synthétiques ne correspondant à aucun utilisateur réel, puis `SET LOCAL ROLE authenticated`.

Résultat en accès direct avec RLS actif :

- `profiles` : 0 ligne visible ;
- `dossiers` : 0 ligne visible ;
- `documents` : 0 ligne visible ;
- `messages` : 0 ligne visible ;
- `nda_variables` : 0 ligne visible ;
- `dossier_program_versions` : 0 ligne visible.

Ce résultat n'est pas un faux positif lié à une base vide : avant le test, la base contenait notamment 5 dossiers historiques, 16 documents et 3 messages.

## Test staff actif

Le test a utilisé uniquement les claims d'un compte staff actif déjà présent, sans exposer son identité dans les résultats.

Résultat :

- `daily_is_selen_staff()` retourne `true` ;
- 5 dossiers historiques visibles ;
- 16 documents visibles ;
- 3 messages visibles.

Le garde staff fonctionne donc correctement avec les policies proposées.

## Vérification après rollback

Après chaque test, l'état initial a été restauré. Contrôle explicite après rollback :

- 0 / 10 table avec RLS activé ;
- 10 / 10 tables toujours dans leur état historique RLS désactivé ;
- 70 privilèges `anon` historiques présents comme avant le test ;
- 30 privilèges `TRUNCATE` / `REFERENCES` / `TRIGGER` pour `authenticated` présents comme avant le test ;
- 0 policy `legacy_*` persistée.

Aucune modification Supabase issue de ces tests n'est donc restée appliquée.

## Garde-fous avant promotion en vraie migration

Le brouillon ne doit pas encore être déplacé dans `supabase/migrations` ni appliqué durablement. Avant cela, il reste à :

1. vérifier les anciens écrans Studio qui utilisent encore un client Supabase lié à la session ;
2. terminer la cartographie des éventuels accès directs restants côté Vitrine hors parcours NDA principal ;
3. exécuter les tests de non-régression des routes NDA client essentielles ;
4. vérifier les opérations d'écriture staff nécessaires après RLS ;
5. préparer la migration réelle seulement après ces contrôles ;
6. appliquer la migration uniquement au checkpoint de sécurité autorisé ;
7. exécuter les Security Advisors et les tests de non-régression après application.

## À valider avec Lil

Aucun point métier n'est requis à ce stade. L'application permanente reste volontairement bloquée tant que la cartographie des accès directs et les tests de non-régression ne sont pas terminés.
