# Conception RLS des tables historiques — 22 août 2026

## Objet

Préparer le durcissement des 10 tables historiques exposées sans modifier encore durablement la base de production. Le modèle a été resserré après inspection du parcours NDA Vitrine et tests transactionnels sur Supabase Selen Studio.

## Constat déterminant sur le parcours NDA historique

Le parcours NDA client principal ne dépend pas d’un accès PostgREST direct aux tables historiques :

- la page client utilise le client Supabase navigateur pour vérifier la session Auth ;
- les lectures et écritures métier passent par des routes serveur ;
- les routes serveur utilisent `verifyClientNdaDossierAccess()` avant d’interroger les données ;
- ce contrôle exige un utilisateur authentifié puis vérifie explicitement le dossier et son organisation ;
- pour le parcours NDA historique, l’accès client est notamment validé par correspondance entre l’email authentifié et `organisations.email` ;
- après cette autorisation applicative, les opérations métier utilisent le client Supabase service role ;
- les documents visibles sont en outre recontrôlés côté serveur avant génération d’un lien Storage signé.

La base contient actuellement 0 ligne active dans `organisation_memberships` alors que des dossiers historiques existent. Il serait donc incorrect de transformer rétroactivement ces parcours NDA en accès direct fondé sur les memberships sans migration fonctionnelle distincte.

Conclusion V1 : **les clients NDA n’ont pas besoin d’un accès direct aux neuf tables métier historiques**. Leur voie d’accès reste les API serveur contrôlées existantes. RLS doit donc protéger ces tables contre tout accès direct non-staff, plutôt que reproduire dans PostgreSQL une logique historique déjà correctement bornée dans les routes serveur.

## Socle d’autorisation réutilisé

Le modèle moderne Daily fournit notamment :

- `has_active_organisation_membership(organisation_id)` ;
- `has_organisation_role(organisation_id, role)` ;
- `has_organisation_permission_block(organisation_id, permission_block)` ;
- `can_access_organisation(organisation_id)` ;
- `daily_is_selen_staff()`.

Ces helpers restent la référence pour Daily et les tables modernes. Pour les tables historiques de ce lot, `daily_is_selen_staff()` suffit au contrôle direct des accès métier, puisque les clients passent par les routes serveur et la service role après vérification applicative.

## Cible V1 par table

| Table | Accès direct client authentifié | Écriture client directe | Staff Selen | Cible V1 |
| --- | --- | --- | --- | --- |
| `profiles` | lecture de son propre profil uniquement | non | oui | self-read minimal + staff |
| `dossiers` | non | non | oui | staff direct / routes serveur client |
| `dossier_assignments` | non | non | oui | staff uniquement |
| `formations` | non | non | oui | staff direct / serveur uniquement |
| `documents` | non | non | oui | staff direct ; téléchargement client via route contrôlée et URL signée |
| `nda_variables` | non | non | oui | staff direct ; NDA client via route serveur |
| `messages` | non | non | oui | staff direct ; messagerie client via routes contrôlées |
| `internal_messages` | jamais | jamais | oui | staff uniquement |
| `program_ai_analyses` | jamais | jamais | oui | staff/serveur uniquement |
| `dossier_program_versions` | non | non | oui | staff direct ; restitution client via route serveur |

## Grants minimaux visés

La base présente actuellement des grants historiques très larges à `anon` et `authenticated`, incluant selon les tables `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` et `TRIGGER`.

La cible de ce lot est :

1. activer RLS sur les 10 tables ;
2. retirer **tous** les privilèges directs de `anon` ;
3. retirer immédiatement `TRUNCATE`, `REFERENCES` et `TRIGGER` à `authenticated` ;
4. conserver temporairement les grants DML ordinaires de `authenticated` pour ne pas casser les anciens écrans Studio pendant la transition ;
5. laisser RLS borner ces opérations aux comptes staff ;
6. révoquer ensuite les grants DML réellement inutiles dans un lot de minimisation distinct, après inventaire complet des accès Studio.

Cette séquence évite de confondre deux protections différentes : les grants déterminent si PostgREST peut atteindre la table, RLS détermine quelles lignes et opérations sont permises une fois la table atteignable.

## Policies V1 proposées

### `profiles`

Deux policies seulement :

- `SELECT` sur son propre profil par correspondance email avec le JWT ;
- `ALL` pour le staff Selen via `daily_is_selen_staff()`.

### Neuf tables métier historiques

Une policy `ALL TO authenticated` par table, toujours avec :

- `USING (public.daily_is_selen_staff())` ;
- `WITH CHECK (public.daily_is_selen_staff())`.

Tables concernées :

- `dossiers` ;
- `dossier_assignments` ;
- `formations` ;
- `documents` ;
- `nda_variables` ;
- `messages` ;
- `internal_messages` ;
- `program_ai_analyses` ;
- `dossier_program_versions`.

Aucune policy `anon` n’est créée.

## Validation transactionnelle déjà réalisée

Le brouillon strict a été exécuté dans `BEGIN ... ROLLBACK` uniquement.

Résultat structurel pendant la transaction :

- 10 / 10 tables avec RLS activé ;
- 11 policies créées ;
- 0 privilège `anon` ;
- 0 privilège `TRUNCATE`, `REFERENCES` ou `TRIGGER` pour `authenticated`.

Test avec claims synthétiques `authenticated` non-staff :

- 0 dossier visible ;
- 0 document visible ;
- 0 message visible ;
- 0 variable NDA visible ;
- 0 version de programme visible ;
- 0 profil visible.

Test avec un compte staff actif existant :

- `daily_is_selen_staff()` retourne `true` ;
- les dossiers, documents et messages historiques restent visibles.

Après rollback, les 10 tables sont revenues à leur état initial : RLS désactivé, aucune policy `legacy_*` persistée et grants historiques restaurés.

## Règles de conception

- Aucune policy n’utilise `raw_user_meta_data`.
- `TO authenticated` seul n’est jamais considéré comme une autorisation.
- Les écritures staff utilisent toujours `USING` **et** `WITH CHECK`.
- Les clients NDA utilisent les API serveur vérifiées, pas l’accès direct aux tables historiques.
- La service role reste exclusivement côté serveur.
- Les liens Storage client sont signés côté serveur après contrôle d’accès et vérification de visibilité du document.
- Aucun besoin direct `anon` n’est retenu sur ces dix tables.

## Dépendances observées

Plusieurs fonctions SQL, triggers et anciens écrans Studio référencent directement ou indirectement des objets historiques. Ils doivent être inclus dans la recette de non-régression, mais ne justifient pas de conserver les grants publics non bornés.

Le Security Advisor signale également d’autres sujets distincts (vues, fonctions privilégiées, `search_path`, etc.). Ils restent hors périmètre pour éviter une migration de sécurité fourre-tout impossible à diagnostiquer proprement en cas de régression.

## Séquence restante avant application

1. Vérifier les anciens écrans Studio encore basés sur un client Supabase lié à la session.
2. Compléter la cartographie des accès directs éventuels côté Vitrine hors parcours NDA principal.
3. Tester les écritures staff nécessaires avec RLS actif dans une transaction annulée.
4. Rejouer les routes NDA client essentielles sur une preview compatible.
5. Promouvoir seulement alors le brouillon sous `supabase/migrations`.
6. Appliquer la migration au checkpoint sécurité autorisé.
7. Relancer les Security Advisors et les tests de non-régression après application.

## Décision de migration

Ce document et le brouillon SQL ne déclenchent encore aucune modification durable. L’application permanente reste volontairement bloquée jusqu’à la fin des tests de compatibilité Studio et NDA.
