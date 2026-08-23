# Régression écriture — durcissement RLS historique

Date : 23 août 2026

## Objet

Compléter les tests du brouillon `legacy-table-rls-hardening-draft.sql` par des contrôles d'écriture directs sous rôle `authenticated`, sans modifier durablement Supabase.

## Méthode

Les contrôles ont été exécutés directement sur le projet Supabase Selen Studio à l'intérieur de transactions `BEGIN ... ROLLBACK`.

Le test active temporairement RLS sur `dossiers` et `messages`, installe les policies staff-only du brouillon, simule successivement :

- un compte staff actif existant, via des claims synthétiques correspondant à un profil staff déjà présent ;
- un utilisateur authentifié non staff avec un UUID et une adresse de test inexistants.

Les écritures testées sont des mises à jour neutres (`updated_at = updated_at` et `content = content`) sur une ligne existante. Elles sont entièrement annulées par `ROLLBACK`.

## Résultats staff actif

- `daily_is_selen_staff()` : `true` ;
- dossiers visibles : 5 ;
- messages visibles : 3 ;
- mise à jour directe d'un dossier : 1 ligne autorisée ;
- mise à jour directe d'un message : 1 ligne autorisée.

Le rôle staff conserve donc les écritures attendues sous RLS.

## Résultats authenticated non staff

- `daily_is_selen_staff()` : `false` ;
- dossiers visibles : 0 ;
- messages visibles : 0 ;
- mise à jour directe d'un dossier : 0 ligne ;
- mise à jour directe d'un message : 0 ligne.

Le rôle authentifié non staff ne peut ni lire ni modifier directement ces données historiques.

## Contrôle de rollback

Un premier essai de test utilisant une table temporaire a échoué sur un privilège d'insertion du rôle `authenticated`. La transaction a été abandonnée, puis l'état réel a été contrôlé avant reprise : les 10 tables historiques avaient toujours RLS désactivé, donc aucune modification durable n'avait été conservée.

Les deux tests suivants ont utilisé uniquement des CTE et des mises à jour neutres dans des transactions explicitement annulées.

## Compatibilité applicative inspectée

La route Studio `src/app/agent/api/documents/review-status/route.ts` vérifie `requireStudioAgent()` puis utilise `createSupabaseAdminClient()` pour les lectures/écritures historiques. La route `src/app/agent/api/internal-messages/list/route.ts` suit également le même modèle : garde agent explicite puis client serveur admin.

Cela reste compatible avec la cible RLS staff-only et avec les parcours serveur utilisant la service role.

## État du gate de promotion

Validé :

- brouillon SQL exécutable en transaction ;
- RLS et policies créables sans erreur ;
- aucun privilège anon pendant le test complet précédent ;
- aucun privilège dangereux authenticated pendant le test complet précédent ;
- lectures non-staff refusées ;
- lectures staff autorisées ;
- mises à jour staff autorisées sur `dossiers` et `messages` ;
- mises à jour non-staff refusées sur `dossiers` et `messages` ;
- rollback contrôlé.

Reste à vérifier avant promotion en migration :

- les écritures Studio sur les autres tables historiques ;
- les routes NDA client essentielles de bout en bout avec le modèle service-role après contrôle d'accès ;
- les derniers accès directs éventuellement encore présents côté Studio/Vitrine.

Aucune migration permanente n'est appliquée dans ce lot.
