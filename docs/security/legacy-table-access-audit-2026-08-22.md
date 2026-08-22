# Audit d’accès des tables historiques — 22 août 2026

## Objectif

Préparer le durcissement RLS des tables historiques du schéma `public` sans casser les parcours NDA encore actifs. Ce document est volontairement descriptif : aucune policy, révocation de privilège ou migration destructive n’est appliquée dans ce lot.

## État réel Supabase contrôlé

Les 10 tables ci-dessous ont actuellement RLS désactivé et aucune policy active. Les rôles `anon` et `authenticated` disposent encore de privilèges très larges sur ces tables, notamment `SELECT`, `INSERT`, `UPDATE`, `DELETE` et, selon les grants historiques, `TRUNCATE`, `REFERENCES` et `TRIGGER`.

| Table | Lignes approx. | Clé de rattachement disponible | Sensibilité | Cible de sécurisation V1 |
|---|---:|---|---|---|
| `profiles` | 0 | `id` | identité / rôle applicatif | aucun accès public direct ; accès staff/serveur uniquement sauf besoin client démontré |
| `dossiers` | 5 | `organisation_id` | dossier métier central | lecture/écriture bornée à l’organisation côté client ; staff via routes serveur |
| `dossier_assignments` | 2 | `dossier_id`, `agent_id` | affectation interne | staff/serveur uniquement |
| `formations` | 0 | `organisation_id` | catalogue historique | accès organisation si un parcours client l’utilise encore, sinon serveur |
| `documents` | 16 | `organisation_id`, `dossier_id` | fichiers, texte extrait, métadonnées | visibilité client conditionnée par organisation + `is_visible_to_client`; écritures via routes contrôlées |
| `nda_variables` | 2 | `organisation_id`, `dossier_id` | nombreuses données personnelles NDA | jamais public générique ; accès organisation strict ou serveur selon le flux |
| `messages` | 3 | `dossier_id` | messagerie client-agent | client uniquement sur ses dossiers ; staff via garde agent/serveur |
| `internal_messages` | 6 | `dossier_id` | échanges internes | staff uniquement |
| `program_ai_analyses` | 5 | `dossier_id` | analyses IA, texte source, résultats bruts | staff/serveur ; exposition client seulement via routes métier filtrées |
| `dossier_program_versions` | 5 | `dossier_id` | versions de programme et décisions client | lecture/écriture client via parcours NDA dédié et borné au dossier ; staff via garde agent |

## Relations confirmées

- `dossiers.organisation_id -> organisations.id`
- `formations.organisation_id -> organisations.id`
- `documents.dossier_id -> dossiers.id`
- `documents.organisation_id -> organisations.id`
- `documents.uploaded_by -> profiles.id`
- `dossier_assignments.dossier_id -> dossiers.id`
- `dossier_assignments.agent_id -> agent_profiles.id`
- `messages.dossier_id -> dossiers.id`
- `nda_variables.dossier_id -> dossiers.id`
- `nda_variables.organisation_id -> organisations.id`
- `program_ai_analyses.dossier_id -> dossiers.id`
- `dossier_program_versions.dossier_id -> dossiers.id`
- `dossier_program_versions.source_analysis_id -> program_ai_analyses.id`

## Accès Studio déjà durcis dans la chaîne de travail

Avant toute migration RLS, plusieurs routes historiques Studio ont été sécurisées pour ne plus dépendre d’un simple accès Supabase authentifié :

- messagerie Studio historique : garde `requireSupportAgent()` ajoutée sur les routes de lecture et d’envoi ;
- lectures historiques des versions de programme : garde `requireSupportAgent()` ajoutée sur `client-decision`, `client-latest` et `latest-version` ;
- deux anciennes routes NDA de type client exposées sous `/agent/api` ont été neutralisées dans un lot séparé afin d’éviter l’usage direct de la service role sans garde.

## Règles de conception pour la future migration

1. Ne pas appliquer une policy uniforme aux 10 tables.
2. Ne jamais considérer `TO authenticated` comme une autorisation suffisante : chaque policy doit inclure une condition d’appartenance ou de rôle.
3. Pour les données liées à une organisation, utiliser le rattachement au dossier/organisation réel plutôt qu’un email libre lorsque c’est possible.
4. Conserver les parcours publics ponctuels derrière des routes serveur ou des tokens métier dédiés, jamais via un accès `anon` générique aux tables.
5. `internal_messages`, `dossier_assignments` et les analyses IA brutes doivent rester staff/serveur uniquement.
6. Les documents visibles côté client doivent combiner l’appartenance à l’organisation et le statut de visibilité métier.
7. Toute policy `UPDATE` devra prévoir à la fois `USING` et `WITH CHECK`.
8. Les fonctions privilégiées éventuelles seront auditées séparément avant activation RLS.

## Séquence prévue

1. Cartographier les appels applicatifs restants table par table dans Studio et Vitrine.
2. Classer chaque appel : navigateur client, navigateur agent, route serveur avec session, route service-role, fonction SQL.
3. Identifier les flux historiques NDA qui nécessitent encore un accès direct authentifié.
4. Préparer une migration additive de policies et de révocation de grants inutiles.
5. Tester les accès autorisés et les refus dans une transaction avec rollback lorsque possible.
6. Vérifier les parcours NDA critiques et la messagerie.
7. Appliquer seulement après validation technique complète, puis lancer les Security Advisors Supabase.

## À valider avec Lil

Aucun point métier nouveau à valider dans ce lot. L’autorisation existante couvre l’audit et la préparation de la correction ; aucune modification RLS distante n’est effectuée ici.
