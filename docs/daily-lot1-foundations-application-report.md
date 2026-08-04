# Rapport d'application - Daily Lot 1A Foundations

Date : 2026-08-04  
Branche : `chore/daily-lot1-foundation-audit`  
HEAD controle avant application : `8bd352dfa9d65d64239554258e5247d12dbfcfa2`

## Synthese

Les trois migrations Daily Lot 1A autorisees ont ete appliquees au projet Supabase Selen Studio apres controle du dry-run et validation des sauvegardes PostgreSQL natives.

Une premiere execution pgTAP a echoue avec 73/76 assertions. Apres autorisation de Lil, seules les assertions de test ont ete corrigees localement, sans migration corrective et sans modification distante persistante.

La seconde execution pgTAP est conforme : `77/77`, avec `ROLLBACK` final.

## Perimetre applique

Migrations appliquees :

- `20260804173000_daily_lot1a_foundation_memberships.sql`
- `20260804173100_daily_lot1a_audit_logs_and_documents.sql`
- `20260804173200_daily_lot1a_organisations_access_guards.sql`

Non effectue :

- aucun `migration repair` ;
- aucun `db pull` ;
- aucun `migration fetch` ;
- aucun push Git ;
- aucun deploiement ;
- aucune modification Auth ;
- aucune modification Storage ;
- aucune suppression ;
- aucun backfill de donnees metier.

## Controles prealables

- Branche : `chore/daily-lot1-foundation-audit`
- HEAD : `8bd352dfa9d65d64239554258e5247d12dbfcfa2`
- Worktree propre avant application : oui
- Aucun merge, rebase, cherry-pick ou sequencer en cours.
- `supabase migration list` : historique local et distant aligne avant Daily Lot 1A.

## Dry-run Supabase avant application

Commande :

```powershell
npx.cmd supabase db push --dry-run
```

Resultat :

- `dryRun`: `true`
- `seeds`: `[]`
- `roles`: `[]`
- migrations proposees uniquement :
  - `20260804173000_daily_lot1a_foundation_memberships.sql`
  - `20260804173100_daily_lot1a_audit_logs_and_documents.sql`
  - `20260804173200_daily_lot1a_organisations_access_guards.sql`

Aucune migration inattendue, aucun seed et aucun role global n'ont ete proposes.

## Sauvegardes PostgreSQL natives

Dossier :

```text
C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-application-backups-20260804-190301
```

| Archive | Taille | SHA-256 | Validation |
|---|---:|---|---|
| `public-schema.dump` | 687 320 octets | `A4D484E609135943D62D05F1BEEFFFAE9F41AAA51CAAF36ACF64ED818A4E75A4` | `pg_restore --list` OK ; objets `public.organisations` et `public.daily_*` presents |
| `public-data.dump` | 754 778 327 octets | `B922F505408A68AEE34686C4AF29A23B83264396592CD3991115E811D91C0342` | `pg_restore --list` OK ; donnees `public.organisations` et `public.daily_*` presentes |
| `globals-roles-grants-introspection.txt` | 477 022 octets | `8F1F29E7B99D2C983C359475490E4E46E0DA9E2E64CA9DD2E2DEF7552367B3A6` | Introspection SQL lisible ; roles et grants utiles presents |
| `critical-tables.dump` | 135 684 octets | `7C65BEB757297B0E445808F621BEABF30FA80B6340880A95DA2247CD39A87A55` | `pg_restore --list` OK ; tables critiques attendues presentes |

Tables critiques verifiees :

- `public.organisations`
- `public.selen_client_profiles`
- `public.agent_profiles`
- `public.selen_admin_users`
- `public.dossiers`
- `public.documents`
- `public.formations`
- `public.nda_variables`
- `public.daily_formations`
- `public.daily_sessions`
- `public.daily_document_templates`

Remarque : l'archive `public-data.dump` a signale des avertissements classiques sur des contraintes circulaires pour une restauration de donnees seules. Le fichier est non vide, lisible par `pg_restore --list` et exploitable comme archive de donnees.

## Verification Haim Levi avant application

Controle en lecture seule :

- organisations trouvees par criteres ASCII `haim` / `levi` : 1 ;
- organisation canonique : `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` ;
- comptes Auth detectes par ces criteres : 0 ;
- profils client detectes par ces criteres : 0 ;
- dossiers detectes par ces criteres : 0 ;
- documents detectes par ces criteres : 0.

Aucune modification n'a ete effectuee pendant ce controle.

## Application

Commande :

```powershell
npx.cmd supabase db push
```

Resultat :

- `dryRun`: `false`
- `seeds`: `[]`
- `roles`: `[]`
- les trois migrations Daily Lot 1A autorisees ont ete appliquees ;
- aucune autre migration n'a ete appliquee.

## Historique Supabase apres application

Commande :

```powershell
npx.cmd supabase migration list
```

Resultat :

- `20260804173000` alignee local = remote ;
- `20260804173100` alignee local = remote ;
- `20260804173200` alignee local = remote.

## Correction locale des tests pgTAP

Corrections appliquees uniquement dans `supabase/tests/daily_lot1a_foundations_rls.test.sql` :

1. Le test trainer ne cherche plus obligatoirement une exception sur `UPDATE`.
   - Il mesure maintenant le nombre de lignes affectees.
   - Il verifie ensuite explicitement que `metadata` conserve sa valeur initiale.

2. Les deux tests `anon` utilisent `throws_ok` avec SQLSTATE `42501` sans dependre du texte exact du message PostgreSQL.

3. Le plan pgTAP a ete recalcule :
   - ancien plan : `76`
   - nouveau plan : `77`
   - comptage statique : `77` assertions.

Aucune migration deja appliquee n'a ete modifiee.

## Resultat pgTAP final

Commande :

```powershell
psql -f supabase\tests\daily_lot1a_foundations_rls.test.sql
```

Mode : transactionnel avec `ROLLBACK` final.

Resultat :

- plan : `1..77`
- assertions : `77/77`
- `finish()` : aucune ligne d'echec
- fin de script : `ROLLBACK`

Point trainer :

- l'UPDATE sous role trainer affecte `0` ligne ;
- `metadata` reste `{}` ;
- conclusion : la RLS filtre correctement l'UPDATE ; le test initial etait trop strict en attendant une exception.

Points anon :

- `public.organisations` refuse `anon` avec SQLSTATE `42501` ;
- `public.daily_documents` refuse `anon` avec SQLSTATE `42501` ;
- les assertions ne dependent plus du texte exact du message PostgreSQL.

## Absence de donnees de test persistantes

Controle en lecture seule apres pgTAP :

| Objet | Lignes restantes avec UUID de test |
|---|---:|
| `auth.users` | 0 |
| `public.organisations` | 0 |
| `public.organisation_memberships` | 0 |
| `public.daily_documents` | 0 |
| `public.daily_audit_logs` | 0 |

Controle en lecture seule apres smoke test routes :

| Objet | Lignes restantes avec UUID de smoke test |
|---|---:|
| `public.organisations` | 0 |
| `public.dossiers` | 0 |
| `public.documents` | 0 |
| `public.notifications` | 0 |
| `public.internal_messages` | 0 |

## Controles RLS, grants et securite

Resultats :

- pgTAP disponible : oui ;
- 77/77 assertions reussies ;
- aucune recursion RLS observee pendant les tests ;
- `daily_is_selen_staff()` retourne `true` pour un staff Selen actif reel ;
- manager limite a son organisation ;
- trainer sans acces complet au profil juridique organisation ;
- admin assistant sans acces complet au profil juridique organisation ;
- membre desactive sans acces ;
- anon sans acces direct ;
- utilisateur authenticated sans membership sans acces ;
- separation inter-organisations verifiee ;
- audit log append-only verifie ;
- acteur du journal derive correctement depuis les profils reels ;
- documents signes et publies immuables ;
- unicite des versions verifiee ;
- aucun grant dangereux detecte pour `anon` ou `authenticated` sur les tables controlees :
  - pas de `TRUNCATE` ;
  - pas de `REFERENCES` ;
  - pas de `TRIGGER` ;
  - pas d'`INSERT` direct authenticated sur `daily_audit_logs`.

## Verification Haim Levi apres application

Controle en lecture seule par organisation canonique `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` :

| Objet | Nombre |
|---|---:|
| `public.organisations` | 1 |
| `public.dossiers` | 0 |
| `public.documents` | 0 |
| `public.organisation_memberships` | 0 |
| `public.daily_documents` | 0 |
| `public.daily_audit_logs` | 0 |

Conclusion : l'organisation Haim Levi reste presente et aucun rattachement Daily Lot 1A inattendu n'a ete observe.

## Verification des routes historiques Studio

Un smoke test transactionnel avec `ROLLBACK` a ete execute sous role authenticated avec un staff Selen actif.

Operations controlees :

- lecture de la liste `organisations` : OK ;
- creation d'une organisation de smoke test : OK, puis rollback ;
- lecture detail client via organisation : OK ;
- creation d'un dossier rattache : OK, puis rollback ;
- creation d'un document rattache : OK, puis rollback ;
- creation d'une notification rattachee : OK, puis rollback ;
- creation d'un message interne d'assistance agent rattache : OK, puis rollback.

Verification post-rollback :

- aucun UUID de smoke test ne persiste dans `organisations`, `dossiers`, `documents`, `notifications` ou `internal_messages`.

## Risques restants

- Les controles applicatifs ont ete realises au niveau base de donnees et routes historiques implicites, pas via une session navigateur Studio.
- Les changements de Data API Supabase recents peuvent exiger une verification separee de l'exposition API selon la configuration du projet, meme si les grants et RLS sont conformes cote base.
- Aucune migration corrective n'a ete creee ; si Lil souhaite renforcer davantage un garde-fou, cela devra faire l'objet d'une migration distincte autorisee.

## Etat final

- Trois migrations Daily Lot 1A appliquees et alignees local = remote.
- Tests pgTAP : `77/77`.
- Donnees de test : aucune persistence detectee.
- Haim Levi : intact sur les compteurs controles.
- Routes historiques : smoke test transactionnel OK.
- Aucun push Git.
- Aucun deploiement.
- Aucune operation Auth ou Storage.
