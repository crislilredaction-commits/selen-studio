# Test transactionnel du durcissement RLS historique — 22 août 2026

## Objet

Valider le brouillon `legacy-table-rls-hardening-draft.sql` sans laisser aucune modification persistante sur le projet Supabase Selen Studio.

## Méthode

Le SQL de durcissement a été exécuté dans des transactions explicites `BEGIN ... ROLLBACK` sur le projet Supabase Selen Studio, sans suppression ni modification durable de données métier.

Les tests ont contrôlé :

- l'état du schéma pendant la transaction ;
- le retour exact à l'état initial après rollback ;
- l'absence d'accès direct pour un utilisateur `authenticated` non-staff ;
- le maintien de l'accès direct attendu pour un compte staff actif ;
- le maintien de l'accès serveur `service_role` ;
- les sémantiques d'écriture sur `messages` pour un non-staff et un staff actif.

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

Un premier test a utilisé des claims synthétiques ne correspondant à aucun utilisateur réel, puis `SET LOCAL ROLE authenticated`.

Un contrôle complémentaire du 23 août 2026 a ensuite utilisé les claims d'un compte authentifié réel ne figurant ni dans `agent_profiles` ni dans `selen_admin_users`. Son identité n'est pas consignée dans ce document.

Résultat en accès direct avec RLS actif :

- `profiles` : aucune donnée tierce visible ;
- `dossiers` : 0 ligne visible ;
- `documents` : 0 ligne visible ;
- `messages` : 0 ligne visible ;
- `internal_messages` : 0 ligne visible ;
- `nda_variables` : 0 ligne visible ;
- `program_ai_analyses` : 0 ligne visible ;
- `dossier_program_versions` : 0 ligne visible.

Ce résultat n'est pas un faux positif lié à une base vide : avant le test, la base contenait notamment 5 dossiers historiques, 16 documents, 2 entrées `nda_variables`, 3 messages, 6 messages internes, 5 analyses IA et 5 versions de programme.

Le test d'écriture transactionnel sur `messages` confirme également qu'un utilisateur authentifié non-staff ne peut modifier aucune ligne : l'UPDATE ciblé affecte 0 ligne.

## Test staff actif

Le test a utilisé uniquement les claims d'un compte staff actif déjà présent, sans exposer son identité dans les résultats.

Résultat :

- `daily_is_selen_staff()` fonctionne avec le compte staff existant ;
- 5 dossiers historiques visibles ;
- 16 documents visibles ;
- 2 entrées `nda_variables` visibles ;
- 3 messages visibles ;
- 6 messages internes visibles ;
- 5 analyses IA visibles ;
- 5 versions de programme visibles.

Le test d'écriture transactionnel sur `messages` confirme qu'une mise à jour staff explicitement autorisée par la policy affecte bien 1 ligne. La transaction est ensuite intégralement annulée.

Le garde staff fonctionne donc correctement en lecture et en écriture avec les policies proposées.

## Test service_role

Dans la même transaction, le rôle `service_role` conserve l'accès aux données historiques sous RLS, notamment aux dossiers, documents et messages. Cela confirme le principe nécessaire aux routes NDA serveur déjà cartographiées.

## Inspection des triggers avant test d'écriture

Les 10 tables ont été inspectées avant toute écriture transactionnelle. Les seuls triggers métier présents sur ce périmètre sont des triggers `updated_at` sur `documents`, `dossiers`, `formations`, `program_ai_analyses` et `dossier_program_versions`. Aucun trigger d'envoi externe ou d'effet de bord réseau n'a été identifié sur ces tables.

Le test d'écriture a néanmoins été limité à `messages`, qui n'a pas de trigger applicatif sur ce périmètre, puis annulé par rollback.

## Vérification après rollback

Après chaque test, l'état initial a été restauré. Contrôle explicite après rollback :

- 0 / 10 table avec RLS activé ;
- 10 / 10 tables toujours dans leur état historique RLS désactivé ;
- les privilèges historiques sont revenus à leur état initial ;
- 0 policy `legacy_*` persistée ;
- aucune modification métier issue des tests n'est conservée.

Aucune modification Supabase issue de ces tests n'est donc restée appliquée.

## Contrôle du helper staff

`public.daily_is_selen_staff()` a été relu directement dans PostgreSQL :

- fonction `SECURITY INVOKER` et non `SECURITY DEFINER` ;
- `search_path` fixé à `public` ;
- exécution accordée à `authenticated`, `service_role` et aux rôles internes nécessaires ;
- vérification sur `agent_profiles` ou `selen_admin_users`, avec compte actif et correspondance `auth.uid()` ou email JWT.

Le helper ne crée donc pas, à lui seul, un contournement RLS privilégié.

## Garde-fous avant promotion en vraie migration

Les contrôles de structure, de lecture non-staff, de lecture/écriture staff, de `service_role`, des triggers et du routage NDA principal sont désormais validés transactionnellement.

Avant promotion durable, il reste à :

1. corriger et vérifier le cas indépendant de la messagerie en mode assistance agent afin de conserver la compatibilité de ce parcours ;
2. exécuter un test de non-régression authentifié du parcours NDA client essentiel sur une preview sûre ;
3. préparer le fichier de migration réel à partir du brouillon strict ;
4. appliquer la migration uniquement après ces derniers contrôles ;
5. exécuter les Security Advisors et les tests de non-régression après application.

## À valider avec Lil

Aucun point métier n'est requis à ce stade. L'application permanente reste volontairement bloquée jusqu'au test NDA authentifié final et à la vérification du mode assistance agent.
