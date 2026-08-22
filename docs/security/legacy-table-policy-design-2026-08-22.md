# Conception RLS des tables historiques — 22 août 2026

## Objet

Préparer le durcissement des 10 tables historiques exposées sans modifier encore la base de production. Ce lot s’appuie sur le modèle d’accès organisationnel déjà présent dans Daily afin d’éviter un second système d’autorisation.

## Socle d’autorisation réutilisé

Les contrôles directs sur Supabase Selen Studio confirment que le modèle moderne fournit déjà :

- `has_active_organisation_membership(organisation_id)` pour vérifier l’appartenance active d’un utilisateur à une organisation ;
- `has_organisation_role(organisation_id, role)` pour les rôles organisationnels ;
- `has_organisation_permission_block(organisation_id, permission_block)` pour les permissions ciblées ;
- `can_access_organisation(organisation_id)` pour la lecture organisationnelle incluant le personnel Selen ;
- `daily_is_selen_staff()` pour les agents/admins Selen.

Les policies modernes de `organisations`, `organisation_memberships`, `daily_documents`, `daily_formations`, `daily_sessions` et `daily_session_dossiers` utilisent déjà ces helpers. La future sécurisation historique doit donc reprendre ces primitives plutôt que l’email, `profiles.app_role` ou une nouvelle logique propriétaire.

## Cible V1 par table

| Table | Lecture client authentifié | Écriture client directe | Staff Selen | Cible V1 |
| --- | --- | --- | --- | --- |
| `profiles` | uniquement son propre profil si un usage client historique est confirmé | non par défaut | oui | réduire au strict nécessaire ; privilégier les profils modernes |
| `dossiers` | seulement les dossiers de son organisation active | non par défaut | oui | `organisation_id` + appartenance active |
| `dossier_assignments` | non | non | oui | staff uniquement |
| `formations` | seulement son organisation si un parcours historique le nécessite encore | non par défaut | oui | `organisation_id` + appartenance active |
| `documents` | seulement documents de son organisation/dossier et explicitement visibles côté client | non par défaut | oui | rattachement organisation + dossier ; éviter l’accès brut lorsque la route serveur suffit |
| `nda_variables` | seulement son organisation/dossier si nécessaire au parcours NDA | non par défaut | oui | rattachement organisation strict ; sinon serveur uniquement |
| `messages` | uniquement les messages de ses propres dossiers selon le sens client/agent | éviter l’écriture brute ; passer par route contrôlée | oui | policy dossier + routes applicatives gardées |
| `internal_messages` | jamais | jamais | oui | staff uniquement |
| `program_ai_analyses` | pas d’accès brut ; seulement restitution filtrée par route dédiée si nécessaire | jamais | oui | staff/serveur uniquement |
| `dossier_program_versions` | uniquement via le parcours NDA lié à un dossier appartenant à son organisation | non par défaut | oui | dossier + organisation, lecture minimale |

## Grants minimaux visés

La base présente actuellement des grants historiques très larges à `anon` et `authenticated`, incluant selon les tables `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` et `TRIGGER`.

La migration finale devra suivre deux étapes distinctes :

1. activer RLS et poser les policies compatibles ;
2. révoquer les privilèges inutiles, notamment `TRUNCATE`, `REFERENCES`, `TRIGGER` et les écritures directes non nécessaires.

Aucun privilège `anon` ne doit être conservé sur ces tables historiques sauf preuve explicite d’un parcours public qui ne peut pas être servi par une route serveur/tokenisée. À ce stade, aucun besoin de ce type n’est retenu par défaut.

## Règles de conception

- Les policies client ciblent `authenticated`, jamais `anon` par défaut.
- `TO authenticated` seul n’est jamais considéré comme une autorisation suffisante : il doit être associé à l’appartenance organisationnelle/dossier.
- Les policies `UPDATE` doivent définir à la fois `USING` et `WITH CHECK`.
- Les opérations staff réutilisent `daily_is_selen_staff()` ou restent derrière les routes serveur déjà protégées.
- Les tables sensibles sans besoin de lecture directe client (`internal_messages`, `program_ai_analyses`, `dossier_assignments`) restent staff/serveur uniquement.
- Les routes NDA client existantes restent la voie préférée lorsque leur filtrage serveur est plus précis qu’une exposition PostgREST directe.
- Aucune policy ne doit dépendre de `raw_user_meta_data`.

## Dépendances observées

Plusieurs fonctions SQL `SECURITY DEFINER` ou triggers référencent directement ou indirectement des objets historiques. Elles devront être incluses dans la recette de non-régression, mais ne justifient pas de conserver les grants publics : une fonction correctement autorisée peut continuer à opérer côté serveur indépendamment des policies utilisateur.

Le Security Advisor signale également d’autres sujets (vue `security_definer`, fonctions exécutables, `search_path`, etc.). Ils sont hors périmètre de ce lot et doivent rester séparés afin de ne pas transformer le durcissement des 10 tables en migration fourre-tout.

## Séquence de test avant application

1. Capturer l’état des policies, grants et volumes des 10 tables.
2. Tester le parcours agent actuel sur les routes déjà protégées.
3. Tester un client authentifié appartenant à l’organisation A : lecture autorisée uniquement sur A.
4. Tester le même client sur une organisation B : zéro ligne / accès refusé selon le chemin.
5. Tester un utilisateur authentifié sans membership actif : aucun accès historique.
6. Tester un appel `anon` : aucun accès direct aux 10 tables.
7. Tester les parcours NDA client qui consomment encore les données historiques via les routes dédiées.
8. Tester les messages, documents, versions de programme et variables NDA avec données appartenant à deux organisations distinctes.
9. Tester les écritures qui doivent rester serveur-only.
10. Rejouer les Security Advisors après migration et vérifier qu’aucune nouvelle alerte critique n’est créée.

## Décision de migration

Ce document ne déclenche aucune modification distante. La prochaine étape est de construire le SQL de migration et un jeu de tests transactionnels/rollback. L’application sur Supabase production ne doit intervenir qu’après validation technique de ces tests et confirmation que les parcours NDA historiques ne dépendent plus de grants publics non bornés.
