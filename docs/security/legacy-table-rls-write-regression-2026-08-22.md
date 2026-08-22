# Vérification des écritures — durcissement RLS historique

Date : 22 août 2026

## Objet

Compléter le lot de préparation du durcissement RLS des dix tables historiques par des tests transactionnels d’écriture, sans modification durable de Supabase Selen Studio.

## Méthode

Le brouillon `legacy-table-rls-hardening-draft.sql` a été rejoué dans une transaction `BEGIN ... ROLLBACK`.

Deux contextes JWT synthétiques ont ensuite été testés avec le rôle PostgreSQL `authenticated` :

- un utilisateur authentifié non staff ;
- un compte staff actif existant, sans exposer son identité dans ce document.

Les tests d’écriture utilisent des lignes historiques existantes et effectuent uniquement des mises à jour neutres :

- dossier : `updated_at = updated_at` ;
- message : `content = content`.

Chaque transaction est ensuite annulée.

## Résultats

| Table | Contexte | Lignes affectées | Résultat attendu |
| --- | --- | ---: | --- |
| `dossiers` | Non-staff authenticated | 0 | ✅ refus direct par RLS |
| `dossiers` | Staff actif | 1 | ✅ écriture directe autorisée |
| `messages` | Non-staff authenticated | 0 | ✅ refus direct par RLS |
| `messages` | Staff actif | 1 | ✅ écriture directe autorisée |

Les règles `legacy_dossiers_staff_all` et `legacy_messages_staff_all` se comportent donc comme prévu pour l’écriture directe : un utilisateur authentifié ordinaire ne peut pas modifier les données historiques, tandis qu’un agent Selen actif conserve l’accès nécessaire.

## Incidents de harnais de test

Deux premières variantes du harnais SQL ont échoué avant exécution métier :

1. tentative d’utiliser directement un `UPDATE` comme sous-requête ;
2. table temporaire de résultats non accessible après `SET ROLE authenticated`.

Le harnais a été corrigé en utilisant un CTE `WITH changed AS (...)` puis en accordant temporairement `INSERT/SELECT` sur la table de résultats au rôle `authenticated`. Ces erreurs ne concernaient ni le brouillon RLS ni les données métier.

## Garantie de non-modification

- transactions terminées par `ROLLBACK` ;
- aucune donnée métier persistée ;
- aucune policy `legacy_*` persistée ;
- aucun changement durable de privilège ou de RLS ;
- aucune opération Auth.

## Suite

Avant promotion en migration permanente :

- vérifier les dernières routes Studio qui utilisent encore un client Supabase de session ;
- contrôler les parcours NDA Vitrine essentiels via leurs API serveur ;
- tester si nécessaire une écriture supplémentaire sur `documents` avant minimisation des grants ;
- seulement ensuite promouvoir le brouillon en migration et exécuter les Security Advisors.
