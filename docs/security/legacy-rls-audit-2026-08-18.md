# Audit RLS des tables historiques — 18 août 2026

## Statut

Audit en lecture seule. **Aucune modification RLS, aucun REVOKE et aucune donnée réelle modifiée.**

Cette note documente le checkpoint de sécurité validé par Lil : cartographier les accès historiques avant de sécuriser les tables afin de ne pas casser les parcours NDA existants.

## Constat production

Les 10 tables historiques ci-dessous sont dans le schéma `public`, ont RLS désactivé et disposent encore de privilèges très larges pour `anon` et `authenticated` (notamment SELECT / INSERT / UPDATE / DELETE, et selon les tables REFERENCES / TRIGGER / TRUNCATE).

| Table | RLS | Lignes approx. | Portée métier observée |
|---|---:|---:|---|
| `documents` | OFF | 16 | pièces de dossiers, documents visibles client, métadonnées |
| `dossier_assignments` | OFF | 2 | affectation agent ↔ dossier |
| `dossier_program_versions` | OFF | 5 | versions de programme et décisions client |
| `dossiers` | OFF | 5 | racine des dossiers, avec `organisation_id` obligatoire |
| `formations` | OFF | 0 | ancienne table formations, avec `organisation_id` obligatoire |
| `internal_messages` | OFF | 6 | notes/messages internes, parfois rattachés à un dossier |
| `messages` | OFF | 3 | messagerie client/agent rattachée à un dossier |
| `nda_variables` | OFF | 2 | variables historiques NDA et données stagiaire/client |
| `profiles` | OFF | 0 | ancienne table de profils applicatifs |
| `program_ai_analyses` | OFF | 5 | analyses programme/CV, toujours rattachées à un dossier |

## Relations de portée disponibles

La structure actuelle permet de dériver la majorité des autorisations sans ajouter de colonne :

- `dossiers.organisation_id` est non nul et constitue la racine de portée organisationnelle ;
- `formations.organisation_id` est non nul ;
- `documents` possède `dossier_id` et/ou `organisation_id`, ainsi que `is_visible_to_client` ;
- `dossier_assignments`, `dossier_program_versions`, `messages` et `program_ai_analyses` se rattachent à `dossiers` ;
- `internal_messages` peut avoir un `dossier_id` nul : par défaut, une ligne sans dossier doit rester réservée au staff Selen ;
- `nda_variables` possède `dossier_id` et `organisation_id`, tous deux historiquement nullables ; une ligne non rattachable ne doit jamais devenir visible à un client par défaut ;
- `profiles` est actuellement vide et les nouveaux parcours agents utilisent `agent_profiles`.

## Helpers RLS déjà présents et réutilisables

Le socle Daily fournit déjà des fonctions d'autorisation cohérentes :

- `daily_is_selen_staff()` ;
- `has_active_organisation_membership(uuid)` ;
- `can_access_organisation(uuid)` ;
- `has_organisation_role(uuid, text)` ;
- plusieurs helpers de capacités Daily plus spécifiques.

Le durcissement historique doit **réutiliser ces fonctions** plutôt que créer une seconde logique d'identité.

## Matrice cible provisoire

Cette matrice est volontairement conservative. Elle ne devient pas une migration de production tant que les appels historiques NDA n'ont pas été confrontés au code réel et aux tests de parcours.

| Table | Staff Selen | Membre organisation | Client / utilisateur | Anonyme |
|---|---|---|---|---|
| `dossiers` | gestion | lecture selon organisation ; écriture uniquement si parcours confirmé | idem via membership | aucun accès direct |
| `documents` | gestion | lecture des documents autorisés ; écriture via parcours confirmé | visibilité bornée au dossier/organisation et `is_visible_to_client` | aucun accès direct |
| `dossier_assignments` | gestion | aucun accès direct prévu | aucun | aucun |
| `dossier_program_versions` | gestion | lecture/interaction seulement si le parcours client historique l'exige | borné au dossier | aucun |
| `formations` | gestion | accès organisationnel | accès organisationnel selon capacité historique | aucun |
| `nda_variables` | gestion | accès borné à l'organisation/dossier si nécessaire | aucun accès transversal | aucun |
| `messages` | gestion | accès borné au dossier ; création selon parcours messagerie | borné à ses dossiers | aucun |
| `internal_messages` | gestion | aucun par défaut | aucun | aucun |
| `program_ai_analyses` | gestion | lecture bornée au dossier seulement si l'UI l'expose | aucun accès brut par défaut | aucun |
| `profiles` | gestion | lecture de soi uniquement si encore nécessaire | lecture de soi uniquement | aucun |

## Stratégie de migration prévue

1. Cartographier les lectures/écritures de ces 10 tables dans `selen-studio` et `selen-editions-site`.
2. Identifier les appels exécutés avec un client utilisateur et ceux exécutés exclusivement avec le client serveur/service role.
3. Écrire des helpers de portée dossier uniquement si nécessaire, en restant `SECURITY INVOKER`.
4. Ajouter les policies explicites table par table.
5. Activer RLS.
6. Révoquer les privilèges anormalement larges (`TRUNCATE`, `TRIGGER`, `REFERENCES` et DML non requis) seulement après validation des parcours.
7. Tester au minimum : `anon`, utilisateur A, utilisateur B d'une autre organisation, manager de l'organisation, agent Selen, service role.
8. Vérifier les parcours NDA historiques avant et après migration.
9. Relancer les Security Advisors Supabase.

## Garde-fous

- pas de `SECURITY DEFINER` ajouté pour contourner un refus ;
- pas de policy `TO authenticated USING (true)` ;
- toute policy UPDATE devra comporter `USING` **et** `WITH CHECK` ;
- les lignes historiques sans portée déterminable restent staff-only ;
- aucune suppression ni réécriture de données pour « faciliter » les policies ;
- la migration de production restera séparée de cette branche d'audit jusqu'au checkpoint de validation.

## À valider avec Lil

Aucun choix métier n'est requis à ce stade. Le seul futur checkpoint sensible sera l'application effective du durcissement RLS / REVOKE en production, après tests de compatibilité.