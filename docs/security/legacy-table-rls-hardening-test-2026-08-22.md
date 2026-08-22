# Test transactionnel du durcissement RLS historique — 22 août 2026

## Objet

Valider le brouillon `legacy-table-rls-hardening-draft.sql` sans laisser aucune modification persistante sur le projet Supabase Selen Studio.

## Méthode

Le SQL de durcissement a été exécuté dans une transaction explicite `BEGIN ... ROLLBACK` sur le projet de production, sans création, suppression ni modification de données métier.

Le test a vérifié l'état du schéma pendant la transaction puis l'état réel après rollback.

## Résultat pendant la transaction

- 10 / 10 tables historiques avec RLS activé ;
- 17 policies du lot créées ;
- 0 privilège direct restant pour `anon` sur les 10 tables ;
- 0 privilège `TRUNCATE`, `REFERENCES` ou `TRIGGER` restant pour `authenticated` sur les 10 tables ;
- aucune erreur SQL de création des policies.

## Vérification après rollback

L'état initial a été intégralement restauré :

- 0 / 10 table avec RLS activé ;
- 10 / 10 tables toujours dans leur état historique RLS désactivé ;
- 70 privilèges `anon` historiques présents comme avant le test ;
- 30 privilèges `TRUNCATE` / `REFERENCES` / `TRIGGER` pour `authenticated` présents comme avant le test ;
- 0 policy `legacy_*` persistée.

Aucune modification Supabase issue de ce test n'est donc restée appliquée.

## Compatibilité déjà établie

L'inspection du parcours NDA côté Vitrine confirme que les routes client principales utilisent le client Supabase serveur avec service role après vérification explicite du dossier et de l'organisation. Cela inclut notamment la messagerie NDA. Ces flux contrôlés ne dépendent donc pas des droits directs très larges actuellement accordés à `authenticated` sur les tables historiques.

## Garde-fous avant promotion en vraie migration

Le brouillon ne doit pas encore être déplacé dans `supabase/migrations` ni appliqué durablement. Avant cela, il reste à :

1. compléter les tests de séparation entre deux organisations ;
2. confirmer l'accès staff après activation RLS ;
3. vérifier les anciens écrans Studio encore basés sur un client Supabase lié à la session ;
4. vérifier les lectures client historiques qui pourraient encore contourner les routes serveur modernes ;
5. exécuter les tests de non-régression NDA ;
6. seulement ensuite promouvoir le SQL en migration et lancer les Security Advisors.

## À valider avec Lil

Aucun point métier n'est requis à ce stade. L'application permanente reste volontairement bloquée tant que les tests de séparation et de non-régression ne sont pas terminés.
