# Revue de la migration Supabase de La Forge

Date de revue : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Migration revue : `supabase/migrations/20260729183000_create_forge_persistence.sql`

## Vérifications réalisées

### Schéma réel de `public.agent_profiles`

Le catalogue PostgreSQL du projet Supabase **Selen Studio** a été interrogé en
lecture seule. La table contient notamment les quatre colonnes utilisées par les
politiques Forge :

| Colonne | Type | Nullable |
| --- | --- | --- |
| `user_id` | `uuid` | oui |
| `email` | `text` | non |
| `role` | `text` | non |
| `is_active` | `boolean` | non |

La table contient également `id`, les dates de création et de mise à jour, ainsi
que des informations de profil et de facturation. La migration Forge ne dépend
pas de ces colonnes supplémentaires.

### Valeurs de rôle

La contrainte réelle `agent_profiles_role_check` est :

```sql
check (role = any (array['agent'::text, 'admin'::text]))
```

Les valeurs distinctes actuellement présentes sont également `agent` et
`admin`. Leur utilisation dans les politiques Forge est donc fondée sur le
schéma et les données réels, et non sur une supposition.

### RLS de `agent_profiles`

RLS est activée sur `public.agent_profiles` et n’est pas forcée pour le
propriétaire de la table. Les politiques SELECT pertinentes sont :

- `Agent can read own agent profile`, pour le rôle `authenticated`, par
  correspondance d’email et avec `is_active = true` ;
- `Agents can read own profile`, par `user_id = auth.uid()` ou correspondance
  d’email, avec accès administrateur complémentaire.

Une politique Forge qui interroge `agent_profiles` sous l’identité de
l’utilisateur connecté peut donc voir son propre profil. La condition Forge
ajoute elle-même `is_active = true` et limite le rôle applicatif à `agent` ou
`admin`. RLS reste activée et aucune fonction `security definer` n’est utilisée
pour contourner cette protection.

### Accès Data API

La migration retire tous les privilèges aux requêtes `anon`, accorde uniquement
les opérations requises à `authenticated`, active RLS sur chaque table Forge et
limite l’exécution des deux RPC au rôle `authenticated`.

## Corrections apportées

- Suppression intégrale des inserts de démonstration dans :
  - `forge_missions` ;
  - `forge_validation_items` ;
  - `forge_activity_logs`.
- Suppression de l’URL `example.com` et de toute fausse mission.
- Ajout de la contrainte :

```sql
constraint forge_validation_items_mission_position_key
  unique (mission_id, position)
```

- Conservation de l’état vide déjà pris en charge par l’interface :
  `Aucune mission n’est encore enregistrée pour Cody.`

## Risques restants

1. La migration n’a pas été exécutée. Les opérations réelles de lecture,
   checklist, correction et validation ne peuvent être testées avant son
   application à un environnement de développement.
2. Le dépôt ne contient ni `supabase/config.toml` ni environnement local actif ;
   Docker et Podman ne sont pas disponibles. La validation SQL locale par la CLI
   Supabase n’est donc pas possible dans cet environnement.
3. `user_id` est nullable dans `agent_profiles`. La politique conserve la
   correspondance par email utilisée par les politiques existantes pour les
   anciens profils qui n’ont pas encore de `user_id`.
4. L’audit Supabase signale que douze tables existantes sans rapport avec La
   Forge ont RLS désactivée : `profiles`, `organisations`, `dossiers`,
   `dossier_assignments`, `formations`, `documents`, `nda_variables`,
   `messages`, `notifications`, `internal_messages`, `program_ai_analyses` et
   `dossier_program_versions`. Cette revue ne les modifie pas afin de ne pas
   casser les parcours existants ; elles nécessitent un audit de sécurité
   séparé avant activation de RLS.

## SQL final

La source SQL finale, complète et canonique est :

[`supabase/migrations/20260729183000_create_forge_persistence.sql`](../supabase/migrations/20260729183000_create_forge_persistence.sql)

Elle contient uniquement :

- les quatre tables Forge vides ;
- leurs contraintes, relations et index ;
- les triggers de mise à jour ;
- les grants et politiques RLS ;
- les fonctions transactionnelles `security invoker` pour demander une
  correction et valider une mission.

Le SQL ne contient aucun `insert` de seed exécuté par la migration, aucune URL
de démonstration et aucune donnée métier initiale. Les seules instructions
`insert` restantes sont dans le corps des fonctions transactionnelles et ne
s’exécutent qu’à la demande d’un utilisateur autorisé.

## Procédure d’application

Ne pas appliquer directement sur la production. Utiliser d’abord un projet ou
une branche Supabase de développement explicitement identifié :

```powershell
npx.cmd supabase link --project-ref <reference-projet-dev>
npx.cmd supabase migration list
npx.cmd supabase db push
```

Contrôles post-application recommandés :

```sql
select to_regclass('public.forge_missions');
select to_regclass('public.forge_activity_logs');
select to_regclass('public.forge_validation_items');
select to_regclass('public.forge_corrections');

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename like 'forge_%'
order by tablename;

select count(*) from public.forge_missions;
```

Le dernier résultat doit être `0`. Tester ensuite avec un compte Studio actif,
un compte authentifié sans profil Studio et une requête anonyme.

## Plan de retour arrière

Avant un retour arrière sur un environnement contenant des données, exporter
les quatre tables. Si aucune donnée réelle ne doit être conservée, appliquer
dans une migration corrective dédiée :

```sql
drop function if exists public.forge_validate_mission(uuid);
drop function if exists public.forge_add_correction(uuid, text);

drop table if exists public.forge_corrections;
drop table if exists public.forge_validation_items;
drop table if exists public.forge_activity_logs;
drop table if exists public.forge_missions;

drop function if exists public.set_forge_updated_at();
```

Ne jamais supprimer les tables Forge sans sauvegarde si des missions réelles ont
déjà été créées.
