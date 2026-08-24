# Préflight RLS historique — 24 août 2026

## Objet

Rejouer le contrôle lecture seule avant toute promotion du brouillon de durcissement RLS historique en migration applicable.

## État réel vérifié

Le script d’assertions `docs/security/legacy-table-rls-preflight-assertions.sql` a été exécuté sur le projet Supabase **Selen Studio** sans DDL ni DML.

Résultat : les 6 assertions attendues passent toutes.

- 10/10 tables ciblées existent dans `public` ;
- 0/10 table ciblée n’a actuellement RLS activé ;
- 10/10 tables exposent encore des privilèges au rôle `anon` ;
- 10/10 tables exposent encore des privilèges au rôle `authenticated` ;
- 0 policy RLS n’est actuellement installée sur les 10 tables ciblées ;
- la fonction `public.daily_is_selen_staff()` est présente une seule fois, comme attendu.

## Conclusion

Aucune dérive de schéma ou de sécurité n’a été détectée par rapport aux hypothèses documentées dans le lot. Le brouillon RLS reste donc cohérent avec l’état réel observé.

Ce contrôle **n’autorise pas encore l’application permanente** de la migration. Avant promotion, il reste à terminer les vérifications de non-régression des anciens accès Studio/Vitrine et à confirmer les parcours NDA essentiels après simulation transactionnelle.

## Sécurité / données

- aucune migration appliquée ;
- aucune donnée métier modifiée ;
- aucune policy créée ou supprimée ;
- aucun privilège modifié ;
- aucune opération Auth, Storage ou infrastructure.

## À valider avec Lil

Aucun point métier bloquant. L’application permanente du durcissement RLS reste un checkpoint de sécurité séparé après fin de la recette de non-régression.
