# Audit des routines PostgreSQL liées aux tables historiques

Date : 25 août 2026

## Objet

Compléter le gate de promotion du durcissement RLS des dix tables historiques en contrôlant les dépendances PostgreSQL susceptibles de contourner ou de casser la future politique d'accès.

Tables contrôlées : `profiles`, `dossiers`, `dossier_assignments`, `formations`, `documents`, `nda_variables`, `messages`, `internal_messages`, `program_ai_analyses`, `dossier_program_versions`.

Ce lot est strictement en lecture côté Supabase : aucune migration, aucune policy, aucun privilège et aucune donnée métier n'ont été modifiés.

## Contrôles exécutés

### Triggers utilisateur

La base contient cinq triggers utilisateur sur le périmètre :

- `documents.set_updated_at_on_documents` ;
- `dossier_program_versions.trg_dossier_program_versions_updated_at` ;
- `dossiers.set_updated_at_on_dossiers` ;
- `formations.set_updated_at_on_formations` ;
- `program_ai_analyses.trg_program_ai_analyses_updated_at`.

Ils sont tous des triggers `BEFORE UPDATE` dédiés à la maintenance de `updated_at`. Aucun trigger utilisateur d'INSERT, DELETE ou émission externe n'a été trouvé sur les dix tables.

Conséquence : les tests transactionnels `UPDATE id = id` déjà ajoutés au gate ne déclenchent que la maintenance locale de l'horodatage, puis sont entièrement annulés par `ROLLBACK`.

### Dépendances de routines

Un contrôle de `pg_depend` entre les routines `public` et les dix relations historiques ne retourne aucune dépendance directe.

Une seconde recherche dans les définitions de fonctions, bornée aux formes SQL usuelles `FROM`, `JOIN`, `UPDATE`, `INSERT INTO` et `DELETE FROM` sur les noms exacts des dix tables, ne retourne aucune routine `public` correspondante.

Les nombreuses fonctions Daily contenant des termes génériques tels que « documents », « dossiers » ou « formations » concernent les tables `daily_*` et ne constituent donc pas, à elles seules, une dépendance aux tables historiques.

## Impact sur le candidat RLS

Aucun mécanisme PostgreSQL identifié dans ce contrôle ne nécessite de conserver les privilèges historiques excessifs de `anon` ou d'un utilisateur `authenticated` non staff sur les dix tables.

Le modèle candidat reste cohérent :

- `anon` : aucun accès direct ;
- `authenticated` non staff : aucun accès direct aux neuf tables métier historiques ;
- `profiles` : self-read minimale uniquement ;
- staff actif : accès direct contrôlé par `daily_is_selen_staff()` ;
- parcours NDA client : accès métier via routes serveur contrôlées et `service_role`.

## Limite volontaire

Ce contrôle porte sur les routines et triggers PostgreSQL. Il ne remplace pas les gardes applicatifs déjà en cours dans Studio et la Vitrine, ni la recette fonctionnelle NDA de bout en bout avant promotion permanente du candidat RLS.

## Suite sûre

Poursuivre les gardes de non-régression applicatifs et les tests comportementaux sans appliquer encore le durcissement RLS en production.

## À valider avec Lil

Aucun point métier nouveau. La promotion permanente du candidat RLS reste un checkpoint séparé après la recette de non-régression NDA/Studio.
