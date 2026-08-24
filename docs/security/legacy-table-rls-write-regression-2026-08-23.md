# Régression écriture — durcissement RLS historique

Date : 23 août 2026

## Objet

Compléter les tests du brouillon `legacy-table-rls-hardening-draft.sql` par des contrôles de lecture et d'écriture directs sous rôle `authenticated` sur les dix tables historiques, sans modifier durablement Supabase.

## Méthode

Les contrôles ont été exécutés directement sur le projet Supabase Selen Studio à l'intérieur d'une transaction unique `BEGIN ... ROLLBACK`.

Le test :

- active temporairement RLS sur les dix tables historiques ;
- applique les policies du brouillon ;
- révoque temporairement les privilèges `anon` et les privilèges dangereux `TRUNCATE`, `REFERENCES` et `TRIGGER` de `authenticated` ;
- simule un compte staff actif existant via des claims synthétiques correspondant à `agent_profiles` ;
- simule ensuite un utilisateur authentifié non staff avec un UUID et une adresse de test inexistants ;
- mesure les lignes visibles ;
- tente une mise à jour neutre `id = id` sur au plus une ligne de chaque table ;
- annule intégralement la transaction.

Les mises à jour sont neutres et entièrement annulées par `ROLLBACK`.

## État des tables au moment du test

| Table | Lignes réelles |
| --- | ---: |
| `profiles` | 0 |
| `dossiers` | 5 |
| `dossier_assignments` | 2 |
| `formations` | 0 |
| `documents` | 16 |
| `nda_variables` | 2 |
| `messages` | 3 |
| `internal_messages` | 6 |
| `program_ai_analyses` | 5 |
| `dossier_program_versions` | 5 |

## Résultats staff actif

`daily_is_selen_staff()` retourne `true`.

Pour les huit tables contenant des lignes réelles :

- toutes les lignes existantes restent visibles ;
- une mise à jour neutre sur une ligne est autorisée.

Résultats observés :

| Table | Lignes visibles | Lignes mises à jour |
| --- | ---: | ---: |
| `dossiers` | 5 | 1 |
| `dossier_assignments` | 2 | 1 |
| `documents` | 16 | 1 |
| `nda_variables` | 2 | 1 |
| `messages` | 3 | 1 |
| `internal_messages` | 6 | 1 |
| `program_ai_analyses` | 5 | 1 |
| `dossier_program_versions` | 5 | 1 |

`profiles` et `formations` contiennent actuellement 0 ligne ; leur visibilité et leur mise à jour restent donc à 0 pendant ce test, sans signaler un refus de policy.

## Résultats authenticated non staff

`daily_is_selen_staff()` retourne `false`.

Pour les dix tables :

- 0 ligne visible ;
- 0 ligne mise à jour.

Cela confirme que les policies staff-only du brouillon bloquent les lectures et mises à jour directes des données historiques pour un utilisateur authentifié non staff.

## Contrôle de rollback

Après `ROLLBACK`, un contrôle direct a confirmé :

- RLS désactivé sur 10/10 tables, comme avant le test ;
- 0 policy `legacy_*` persistée sur les dix tables ;
- aucune modification permanente de privilège ;
- aucune donnée métier modifiée.

## Compatibilité applicative déjà inspectée

La route Studio `src/app/agent/api/documents/review-status/route.ts` vérifie `requireStudioAgent()` puis utilise `createSupabaseAdminClient()` pour les lectures/écritures historiques. La route `src/app/agent/api/internal-messages/list/route.ts` suit également le même modèle : garde agent explicite puis client serveur admin.

Les parcours NDA Vitrine inspectés passent eux aussi par des routes serveur qui vérifient le dossier / l'organisation avant d'utiliser la service role. Ce modèle reste compatible avec la cible RLS staff-only.

## État du gate de promotion

Validé :

- brouillon SQL exécutable en transaction ;
- RLS et policies créables sans erreur ;
- aucun privilège `anon` pendant le test ;
- aucun privilège dangereux `authenticated` pendant le test ;
- lectures non-staff refusées sur les dix tables ;
- lectures staff autorisées sur toutes les tables contenant des données ;
- mises à jour staff autorisées sur les huit tables contenant des données ;
- mises à jour non-staff refusées sur les dix tables ;
- rollback complet contrôlé.

Reste à vérifier avant promotion en migration :

- les derniers accès directs éventuellement encore présents côté Studio/Vitrine ;
- les routes NDA client essentielles de bout en bout avec le modèle service-role après contrôle d'accès ;
- les cas d'insertion/suppression historiques réellement utilisés, s'il en subsiste, afin de confirmer qu'ils passent bien par les routes serveur contrôlées ;
- le comportement de `profiles` et `formations` lorsqu'elles contiendront de nouveau des lignes, notamment la self-read minimale de `profiles`.

Aucune migration permanente n'est appliquée dans ce lot.
