# Vérification des écritures — durcissement RLS historique

Date : 22 août 2026

## Objet

Compléter le lot de préparation du durcissement RLS des dix tables historiques par un test transactionnel d’écriture, sans modification durable de Supabase Selen Studio.

## Méthode

Le brouillon `legacy-table-rls-hardening-draft.sql` a été rejoué dans une transaction `BEGIN ... ROLLBACK`.

Deux contextes JWT synthétiques ont ensuite été testés avec le rôle PostgreSQL `authenticated` :

- un utilisateur authentifié non staff ;
- un compte staff actif existant, sans exposer son identité dans ce document.

Le test d’écriture utilise un dossier historique existant et effectue uniquement une mise à jour neutre (`updated_at = updated_at`). La transaction est ensuite annulée.

## Résultats

| Test | Lignes affectées | Résultat attendu |
| --- | ---: | --- |
| Non-staff authenticated | 0 | ✅ refus direct par RLS |
| Staff actif | 1 | ✅ écriture directe autorisée |

Les règles `legacy_dossiers_staff_all` se comportent donc comme prévu pour l’écriture directe : un utilisateur authentifié ordinaire ne peut pas modifier un dossier historique, tandis qu’un agent Selen actif conserve l’accès nécessaire.

## Incidents de harnais de test

Deux premières variantes du harnais SQL ont échoué avant exécution métier :

1. tentative d’utiliser directement un `UPDATE` comme sous-requête ;
2. table temporaire de résultats non accessible après `SET ROLE authenticated`.

Le harnais a été corrigé en utilisant un CTE `WITH changed AS (...)` puis en accordant temporairement `INSERT/SELECT` sur la table de résultats au rôle `authenticated`. Ces erreurs ne concernaient ni le brouillon RLS ni les données métier.

## Garantie de non-modification

- transaction terminée par `ROLLBACK` ;
- aucune donnée métier persistée ;
- aucune policy `legacy_*` persistée ;
- aucun changement durable de privilège ou de RLS ;
- aucune opération Auth.

## Suite

Avant promotion en migration permanente :

- tester au moins un parcours d’écriture staff sur une autre table métier sensible, notamment `messages` ou `documents` ;
- vérifier les dernières routes Studio qui utilisent encore un client Supabase de session ;
- contrôler les parcours NDA Vitrine essentiels via leurs API serveur ;
- seulement ensuite promouvoir le brouillon en migration et exécuter les Security Advisors.
