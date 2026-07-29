# Plan de réalignement des migrations Supabase

Date : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Projet : **Selen Studio** (`pjbilmywwkpghhayftph`)
Statut : préparation locale uniquement

## Décision synthétique

Une migration corrective locale a été créée :

`supabase/migrations/20260729173634_realign_daily_and_satisfaction_access.sql`

Elle :

1. restaure de manière idempotente la politique SELECT nécessaire à l’écran
   Satisfaction ;
2. supprime les trois anciennes fonctions Daily liées au modèle de période
   glissante devenu incohérent ;
3. formalise les deux fonctions Daily du modèle actuel par année civile
   explicite ;
4. ne restaure pas les colonnes `annual_period_start` et `annual_period_end` ;
5. ne restaure pas la politique historique de `lil_billing_profiles` ;
6. ne touche ni aux données, ni aux statuts de facture.

Aucune commande distante mutante n’a été exécutée.

## Sources examinées

- les deux rapports précédents ;
- les 33 migrations historiques ;
- les pages Studio Daily et Satisfaction ;
- les routes serveur de facturation ;
- les clients Supabase navigateur, serveur et service-role ;
- les appels `.rpc()` du dépôt ;
- les types locaux déclarés dans les pages ;
- les fonctions et surcharges SQL distantes ;
- les tables, colonnes, politiques RLS, rôles et grants distants ;
- les migrations ultérieures à chaque objet.

Le dépôt ne contient pas de fichier de types Supabase générés. Les types Daily
sont déclarés localement dans les pages et aucun ne décrit
`daily_subscriptions`.

## Audit fonctionnel du modèle annuel Daily

### Modèle historique

`20260703100000_add_selen_daily_onboarding_and_subscription.sql` définissait une
période glissante :

- `annual_period_start` ;
- `annual_period_end` ;
- contrainte `annual_period_end > annual_period_start` ;
- `daily_refresh_subscription_period(uuid)` ;
- `daily_annual_learner_count(uuid)` ;
- `daily_prepare_upper_tier_if_needed(uuid)`.

La fonction de comptage historique filtrait les sessions entre les deux bornes
stockées sur l’abonnement.

### État distant actuel

La table distante ne possède plus les deux colonnes ni la contrainte. Elle
possède une ligne réelle d’abonnement.

Les anciennes fonctions à un argument existent toujours et référencent les
colonnes absentes. Elles sont donc incohérentes avec le schéma et susceptibles
d’échouer lorsqu’une ligne d’abonnement est trouvée.

Deux surcharges plus récentes existent au distant :

```sql
daily_annual_learner_count(uuid, integer default année_courante)
daily_prepare_upper_tier_if_needed(uuid, integer default année_courante)
```

La première compte les apprenants dont un bloc de session appartient à
`p_year`. La seconde utilise ce résultat pour préparer le changement de palier.
Elles ne dépendent pas des colonnes absentes.

### Code applicatif et interfaces

- Aucun fichier applicatif ne référence `annual_period_start` ou
  `annual_period_end`.
- Aucun appel RPC local ne cible les fonctions Daily annuelles.
- Les pages Daily utilisent formations, sessions, onboarding, inscriptions et
  documents, mais n’affichent ni ne modifient de période d’abonnement.
- Aucun formulaire du dépôt ne demande une date de début ou de fin de période
  annuelle.
- Les seuls paramètres de tarification retrouvés sont ceux du schéma
  `daily_subscriptions` et de la migration historique.

### Recommandation

**Conserver le modèle par année civile explicite et ne pas restaurer les deux
colonnes de période glissante.**

Justification :

1. le modèle distant récent à `p_year` est autonome et cohérent avec une limite
   annuelle ;
2. les colonnes glissantes ne sont utilisées par aucun code, type ou formulaire
   local ;
3. les restaurer créerait deux sources de vérité : année civile demandée à la
   fonction et bornes stockées sur l’abonnement ;
4. les anciennes fonctions sont déjà techniquement cassées ;
5. supprimer uniquement les anciennes signatures ne supprime aucune donnée.

La migration corrective recrée explicitement les deux fonctions à `p_year`,
afin qu’une reconstruction à partir des migrations locales aboutisse au même
modèle que le distant. Les fonctions sont `security invoker`; l’exécution
anonyme et `PUBLIC` est retirée, puis accordée à `authenticated` et
`service_role`. RLS continue donc de s’appliquer.

Point humain : confirmer que « annuel » signifie bien année civile et non année
glissante à partir de la souscription. Si le produit requiert finalement une
année glissante, ne pas appliquer cette migration : il faudra concevoir des
bornes fiables, leur initialisation et leur renouvellement.

## Audit de la politique Satisfaction

### Définition historique

La migration `20260624000000` prévoit une politique :

```sql
create policy "Studio staff can read satisfaction surveys"
on public.satisfaction_surveys
for select
to authenticated
using (
  exists (
    select 1
    from public.agent_profiles ap
    where ap.is_active = true
      and ap.role in ('agent', 'admin')
      and (
        ap.user_id = auth.uid()
        or lower(ap.email) = lower(auth.jwt() ->> 'email')
      )
  )
);
```

### État et dépendances

- `satisfaction_surveys` existe et RLS est active.
- Aucune politique n’est présente sur la table.
- `authenticated` possède le privilège SELECT, mais RLS bloque toute ligne sans
  politique.
- `src/app/agent/satisfaction/page.tsx` lit directement la table depuis le
  client Supabase du navigateur.
- La table `agent_profiles` possède les colonnes et rôles attendus.
- Ses politiques SELECT autorisent l’utilisateur authentifié à lire son propre
  profil actif.
- Aucune politique ultérieure ne remplace fonctionnellement la politique
  historique.

### Décision

**Restaurer la politique.**

Elle est nécessaire au parcours actuel, non redondante et limitée aux profils
Studio actifs de rôle `agent` ou `admin`. La migration corrective conserve sa
logique historique, utilise des appels `auth.uid()`/`auth.jwt()` scalaires et
ne la crée que si son nom est absent.

## Audit de la politique Billing

### Définition historique

`20260701110000_lil_billing_profiles.sql` prévoit une politique ALL basée sur :

```sql
exists (
  select 1
  from public.studio_admin_users sau
  where sau.email = auth.jwt() ->> 'email'
    and sau.role in ('owner', 'admin')
)
```

La politique ne comporte pas de clause `to`, donc cible implicitement
`PUBLIC`.

### État et dépendances

- `lil_billing_profiles` existe, RLS est active et aucune politique n’est
  présente.
- `public.studio_admin_users` n’existe pas.
- Le modèle d’administration actuel utilise `public.selen_admin_users` et
  `public.agent_profiles`.
- Les lectures et écritures de profils de facturation passent par des routes
  serveur.
- Ces routes appellent `requireLilOwner()`, puis utilisent le client
  service-role.
- Aucun composant navigateur n’interroge directement
  `lil_billing_profiles`.

### Décision

**Ne pas restaurer la politique historique.**

La restaurer telle quelle échouerait à cause de la table inexistante. La
transposer automatiquement vers `selen_admin_users` élargirait l’accès à des
rôles `admin`, alors que l’application actuelle exige précisément le
propriétaire Lil. L’absence de politique bloque correctement l’accès direct,
tandis que le parcours serveur vérifie l’identité avant le client service-role.

La migration corrective ne touche donc pas à cette table. Une politique directe
ne devra être ajoutée que si un futur parcours navigateur l’exige, avec une
règle propriétaire explicitement validée.

## Contenu de la migration corrective

La source canonique est :

[`supabase/migrations/20260729173634_realign_daily_and_satisfaction_access.sql`](../supabase/migrations/20260729173634_realign_daily_and_satisfaction_access.sql)

Résumé SQL :

- assertion de présence de `satisfaction_surveys` ;
- maintien de RLS ;
- création conditionnelle de la politique SELECT Studio ;
- suppression conditionnelle des trois fonctions Daily obsolètes à un argument ;
- création/remplacement de :
  - `daily_annual_learner_count(uuid, integer)` ;
  - `daily_prepare_upper_tier_if_needed(uuid, integer)` ;
- `security invoker` et `search_path` vide ;
- révocation EXECUTE pour `PUBLIC` et `anon` ;
- EXECUTE accordé à `authenticated` et `service_role`.

La migration n’exécute aucun `insert`, `update`, `delete` ou `truncate` au
moment de son application, ne supprime aucune table et ne modifie aucune
contrainte de facture. Le corps de `daily_prepare_upper_tier_if_needed`
contient un `update` métier qui ne s’exécute que lors d’un appel ultérieur de
la fonction.

## 29 migrations candidates au futur repair

Les commandes suivantes sont proposées **mais n’ont pas été exécutées** :

```powershell
npx.cmd supabase migration repair 20260616000000 --status applied
npx.cmd supabase migration repair 20260617000000 --status applied
npx.cmd supabase migration repair 20260617001000 --status applied
npx.cmd supabase migration repair 20260617002000 --status applied
npx.cmd supabase migration repair 20260617003000 --status applied
npx.cmd supabase migration repair 20260625000000 --status applied
npx.cmd supabase migration repair 20260625001000 --status applied
npx.cmd supabase migration repair 20260625002000 --status applied
npx.cmd supabase migration repair 20260626000000 --status applied
npx.cmd supabase migration repair 20260626001000 --status applied
npx.cmd supabase migration repair 20260626002000 --status applied
npx.cmd supabase migration repair 20260626003000 --status applied
npx.cmd supabase migration repair 20260629090000 --status applied
npx.cmd supabase migration repair 20260629110000 --status applied
npx.cmd supabase migration repair 20260701100000 --status applied
npx.cmd supabase migration repair 20260701120000 --status applied
npx.cmd supabase migration repair 20260701130000 --status applied
npx.cmd supabase migration repair 20260703090000 --status applied
npx.cmd supabase migration repair 20260703110000 --status applied
npx.cmd supabase migration repair 20260703120000 --status applied
npx.cmd supabase migration repair 20260703130000 --status applied
npx.cmd supabase migration repair 20260703140000 --status applied
npx.cmd supabase migration repair 20260704100000 --status applied
npx.cmd supabase migration repair 20260704110000 --status applied
npx.cmd supabase migration repair 20260704120000 --status applied
npx.cmd supabase migration repair 20260704130000 --status applied
npx.cmd supabase migration repair 20260705110000 --status applied
npx.cmd supabase migration repair 20260707100000 --status applied
npx.cmd supabase migration repair 20260707110000 --status applied
```

Chaque commande doit être validée puis exécutée dans l’ordre, après sauvegarde.

## Traitement des trois migrations partielles

### `20260624000000`

Après application et vérification de la politique Satisfaction corrective :

```powershell
npx.cmd supabase migration repair 20260624000000 --status applied
```

La correction restitue le seul effet manquant.

### `20260701110000`

Ne pas restaurer sa politique historique invalide. Après validation humaine du
choix « accès serveur propriétaire uniquement », considérer la politique comme
fonctionnellement obsolète et marquer la version :

```powershell
npx.cmd supabase migration repair 20260701110000 --status applied
```

Ce marquage reconnaît que les objets utiles sont présents et que l’effet absent
est volontairement abandonné ; il ne prétend pas que la politique historique
existe.

### `20260703100000`

Après application et vérification du remplacement par les fonctions à
`p_year` :

```powershell
npx.cmd supabase migration repair 20260703100000 --status applied
```

La migration corrective formalise la variante fonctionnelle distante plus
récente au lieu de restaurer les colonnes obsolètes.

## Traitement de la migration obsolète

`20260701090000` ne doit jamais être rejouée. Ses colonnes et index existent,
mais sa contrainte a été absorbée et remplacée par `20260701120000`.

Après vérification que la contrainte finale autorise uniquement `draft`,
`generated`, `deposited`, `paid`, `cancelled`, marquer la version historique :

```powershell
npx.cmd supabase migration repair 20260701090000 --status applied
```

Ce marquage empêche son rejeu sans restaurer son ancien état.

## Traitement de la migration corrective

La migration corrective est horodatée avant Forge et après les 33 migrations
historiques. Pour que le dry-run final ne propose que Forge, son SQL doit être
appliqué de façon ciblée, vérifié, puis son timestamp marqué comme appliqué :

```powershell
# Commande future mutante : ne l’exécuter qu’après sauvegarde et validation.
npx.cmd supabase db query --linked --file supabase/migrations/20260729173634_realign_daily_and_satisfaction_access.sql

# Après vérifications post-application uniquement.
npx.cmd supabase migration repair 20260729173634 --status applied
```

Un `db push` ne convient pas pour cette étape : tant que l’historique n’est pas
réaligné, il proposerait aussi les migrations historiques et Forge.

## Séquence opérationnelle sûre

### 1. Validation humaine

Confirmer :

- année civile comme période de comptage Daily ;
- accès Satisfaction pour les agents Studio actifs ;
- accès Billing exclusivement via les routes serveur propriétaire ;
- marquage de la migration de statuts obsolète comme absorbée.

### 2. Sauvegarde

- dump du schéma et des données ;
- export séparé des tables Daily, Satisfaction et facturation ;
- copie de `supabase_migrations.schema_migrations` ;
- capture des fonctions, politiques et grants actuels ;
- test de restauration sur une cible isolée.

### 3. Application ciblée de la correction

Après revue du fichier, exécuter uniquement la commande `db query --linked
--file` documentée ci-dessus. Ne pas utiliser `db push`.

### 4. Vérifications post-correction

Vérifier en lecture seule :

- présence exacte de la politique Satisfaction ;
- absence de politique sur `lil_billing_profiles` ;
- absence des trois anciennes signatures Daily ;
- présence des deux signatures `(uuid, integer)` ;
- fonctions `security invoker` ;
- absence EXECUTE pour `anon` et présence pour `authenticated`/`service_role` ;
- résultat du comptage sur une année connue ;
- mise à jour de palier uniquement sous un rôle autorisé ;
- aucune donnée métier modifiée hors éventuel test transactionnel annulé.

### 5. Réalignement de l’historique

Exécuter les 29 commandes candidates, puis les commandes conditionnelles des
trois migrations partielles, de la migration obsolète et de la corrective.

### 6. Contrôle de l’historique

```powershell
npx.cmd supabase migration list
```

Toutes les versions jusqu’à `20260729173634` doivent apparaître localement et
au distant. Forge doit rester uniquement locale.

### 7. Dry-run final

```powershell
npx.cmd supabase db push --dry-run
```

La seule migration proposée doit être :

```text
20260729183000_create_forge_persistence.sql
```

Arrêter immédiatement si une autre version, un repair ou une suppression est
proposé.

## Plan de retour arrière

Avant le repair, la correction SQL peut être inversée par une migration dédiée :

1. supprimer la politique Satisfaction seulement si sa restauration est jugée
   incorrecte ;
2. recréer les anciennes fonctions uniquement si les colonnes de période ont
   été rétablies et validées ;
3. restaurer les définitions des fonctions depuis la sauvegarde ;
4. restaurer les grants capturés.

Après repair, conserver la liste exacte des timestamps marqués. Si une erreur
de classification est prouvée, proposer individuellement :

```powershell
npx.cmd supabase migration repair <version> --status reverted
```

Cette commande est un exemple non exécuté. Aucun reset ne doit être utilisé.

## Validations locales réalisées

- Aucun SQL historique n’est modifié.
- Le parseur natif PostgreSQL 17 `libpg-query`, installé temporairement hors du
  dépôt, valide les 10 instructions de la migration.
- Les types d’instructions reconnus sont : un bloc `DO`, trois `DROP FUNCTION`,
  deux `CREATE FUNCTION` et quatre `GRANT`/`REVOKE`.
- Le contrôle du rapport retrouve exactement 29 commandes candidates et
  5 commandes conditionnelles supplémentaires.
- `npm.cmd run lint` réussit avec 0 erreur et 18 avertissements préexistants.
- `npm.cmd run build` réussit : compilation, TypeScript et 83 pages générées.
  Les avertissements préexistants concernent `pdfjs/canvas` et la convention
  Next.js `middleware`.
- `npx.cmd supabase db lint --local --schema public --level error --fail-on
  error` a été tenté, mais aucun PostgreSQL local n’est disponible. La CLI
  échoue à la connexion avant tout lint. Aucun environnement local n’a été
  démarré ou réinitialisé.

Le dépôt ne définit aucun script de test automatisé. Les tests pertinents
disponibles sont donc lint, build, parsing PostgreSQL et contrôles statiques.

## Risques et validations humaines restantes

1. Le sens métier exact de « annuel » doit être confirmé par le produit.
2. Des consommateurs externes au dépôt pourraient encore appeler les anciennes
   signatures Daily ou dépendre d’EXECUTE anonyme.
3. `daily_prepare_upper_tier_if_needed` modifie l’abonnement sous RLS ; son
   appel normal doit être serveur/service-role ou reposer sur une future
   politique UPDATE explicitement propriétaire.
4. Le marquage de `20260701110000` accepte intentionnellement qu’une politique
   historique invalide ne soit pas restaurée.
5. La correction ciblée par `db query` n’écrit pas elle-même l’historique ; le
   repair de `20260729173634` est indispensable après vérification.
6. Les douze tables sans RLS restent hors périmètre et ne sont pas modifiées.

## Garanties de cette étape

- aucun `db push` ;
- aucun `migration repair` ;
- aucun reset ;
- aucune donnée ou objet distant modifié ;
- aucun fichier SQL historique modifié ;
- aucun merge ;
- aucun déploiement Vercel.
