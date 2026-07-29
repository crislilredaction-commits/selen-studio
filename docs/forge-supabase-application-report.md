# Rapport d’application Supabase de La Forge

Date : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Statut : **arrêt contrôlé après dry-run, avant `db push`**

## Projet ciblé

- Nom confirmé par la CLI authentifiée : **Selen Studio**
- Référence : `pjbilmywwkpghhayftph`
- Région : `eu-west-2`
- État au moment du contrôle : `ACTIVE_HEALTHY`
- Migration Forge prévue :
  `supabase/migrations/20260729183000_create_forge_persistence.sql`

La sortie de `supabase projects list` associe explicitement cette référence au
projet Selen Studio. Deux autres projets accessibles ont des références
différentes et n’ont pas été liés.

## Commandes exécutées

```powershell
git branch --show-current
git status --short --branch
npx.cmd supabase projects list
npx.cmd supabase link --project-ref pjbilmywwkpghhayftph
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Résultats :

- branche active correcte ;
- CLI authentifiée ;
- cible Selen Studio confirmée ;
- liaison réussie avec `pjbilmywwkpghhayftph` ;
- historique local et distant comparé ;
- dry-run exécuté sans application de migration.

Aucun mot de passe, token ou clé n’a été transmis, affiché ou enregistré dans
le dépôt ou dans ce rapport.

## Résultat de l’historique des migrations

`supabase migration list` retourne 34 versions présentes localement et absentes
de l’historique distant. La colonne distante est vide pour chaque version, de
`20260616000000` à `20260729183000`.

L’historique local et l’historique distant ne sont donc pas synchronisés.
Aucune commande `migration repair` n’a été exécutée.

## Résultat du dry-run

Le dry-run a réussi techniquement, avec :

- `dryRun: true` ;
- `upToDate: false` ;
- aucune seed ;
- aucun rôle ;
- 34 migrations proposées.

Migrations que Supabase proposerait d’appliquer :

```text
20260616000000_create_articles.sql
20260617000000_add_nda_liste_formateurs_variables.sql
20260617001000_add_nda_phase_validations.sql
20260617002000_add_nda_deposit_followup_fields.sql
20260617003000_add_nda_manual_analysis_texts.sql
20260624000000_studio_read_vitrine_followup_tables.sql
20260625000000_create_client_reminders.sql
20260625001000_allow_completed_preaudit_results_after_access_expiration.sql
20260625002000_support_sav_v1.sql
20260626000000_create_external_audits_and_admin_refunds.sql
20260626001000_create_selen_payments_and_expenses.sql
20260626002000_support_reply_tokens_and_public_discount_codes.sql
20260626003000_seed_nda_tool_catalog.sql
20260629090000_external_audits_delivery_mode_reminders_and_meet.sql
20260629110000_create_lil_invoice_generator.sql
20260701090000_lil_invoice_statuses_and_email.sql
20260701100000_external_audit_lifecycle_to_invoice.sql
20260701110000_lil_billing_profiles.sql
20260701120000_lil_invoice_generated_deposited_statuses.sql
20260701130000_lil_invoice_settings_and_profile_details.sql
20260703090000_create_selen_daily_v1.sql
20260703100000_add_selen_daily_onboarding_and_subscription.sql
20260703110000_add_selen_daily_registration_flow.sql
20260703120000_add_selen_daily_registration_recipients.sql
20260703130000_add_selen_daily_registration_reviews.sql
20260703140000_add_selen_daily_positioning_questionnaire.sql
20260704100000_add_selen_daily_conventions.sql
20260704110000_add_selen_daily_convention_signatures.sql
20260704120000_add_selen_daily_portal_access_tokens.sql
20260704130000_add_selen_daily_before_training_documents.sql
20260705110000_stabilize_selen_daily_ux.sql
20260707100000_add_client_notification_pause.sql
20260707110000_create_agent_assistance_mode.sql
20260729183000_create_forge_persistence.sql
```

Le résultat ne satisfait pas la condition autorisant le vrai `db push`, car 33
migrations autres que celle de La Forge seraient également poussées.

## Migration appliquée

**Aucune migration appliquée.**

La commande suivante n’a pas été exécutée :

```powershell
npx.cmd supabase db push
```

Il n’y a eu ni `db reset`, ni suppression de table, ni `migration repair`.

## Objets créés

Aucun objet distant n’a été créé par cette intervention. Les quatre tables
`forge_*`, les fonctions Forge et leurs politiques RLS n’ont donc pas été
créées par cette tentative.

## Tests réalisés

### Contrôles réussis

- identité et état du projet ;
- correspondance entre le nom Selen Studio et la référence fournie ;
- liaison CLI ;
- lecture de l’historique des migrations ;
- dry-run non-mutant.

### Contrôles non réalisés

Les contrôles post-application ne sont pas applicables, puisque le push a été
interdit :

- présence des quatre tables `forge_*` ;
- présence de `forge_add_correction` et `forge_validate_mission` ;
- RLS activée et politiques présentes ;
- absence de données de démonstration ;
- preuve post-push qu’aucune autre table n’a été modifiée.

Les tests fonctionnels avec un compte Studio actif n’ont pas été exécutés :

- chargement de l’état vide ;
- création d’une première mission réelle ;
- modification et persistance de checklist ;
- correction, changement de statut et journal ;
- validation d’une mission.

URL de Preview testée : **aucune**.

## Anomalies

1. Les 33 migrations locales antérieures à La Forge sont absentes de
   l’historique distant retourné par la CLI.
2. Le dry-run propose donc 34 migrations au lieu de la seule migration Forge.
3. L’état réel de la base contient déjà des objets applicatifs observés lors de
   la revue préalable, ce qui suggère que le schéma et la table d’historique des
   migrations ont évolué par des chemins différents. Cette hypothèse doit être
   auditée ; elle ne justifie pas automatiquement un `migration repair`.

## Risques restants

- Un `db push` dans l’état actuel tenterait de rejouer 33 migrations
  historiques et pourrait échouer ou modifier des objets existants.
- Réparer l’historique sans preuve migration par migration pourrait marquer
  comme appliqué du SQL qui ne correspond pas exactement au schéma distant.
- Les douze tables existantes précédemment signalées sans RLS restent hors
  périmètre et n’ont pas été modifiées.
- La persistance Forge et son parcours Preview restent non testés.

## Reprise contrôlée recommandée

Avant toute nouvelle tentative, auditer séparément les 33 migrations
historiques et établir pour chacune si son effet est déjà présent sur la base.
Définir ensuite une stratégie d’alignement de l’historique explicitement validée.

Après cet alignement, reprendre par :

```powershell
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Ne lancer le vrai `db push` que si le nouveau dry-run désigne exclusivement :

```text
20260729183000_create_forge_persistence.sql
```

## Plan de retour arrière

Aucun retour arrière n’est requis pour cette tentative : le dry-run n’a produit
aucun changement distant.

Après une éventuelle application future, tout retour arrière devra passer par
une migration corrective dédiée et une sauvegarde préalable des données Forge.
Ne pas utiliser `db reset`, ne supprimer aucune table directement et ne pas
modifier les douze tables existantes signalées sans RLS.

## Garanties de périmètre

- aucun merge vers `main` ;
- aucun déploiement Vercel production ;
- aucune modification des douze tables existantes signalées sans RLS ;
- aucune suppression de table ;
- aucune migration appliquée.

## Tentative contrôlée du 29 juillet 2026 — arrêt sur sauvegarde

### Préconditions

- branche vérifiée : `feature/forge-cody-supabase` ;
- dépôt propre et synchronisé avec
  `origin/feature/forge-cody-supabase` avant la tentative ;
- projet lié : Selen Studio (`pjbilmywwkpghhayftph`) ;
- Supabase CLI : `2.110.0`.

La procédure imposait quatre sauvegardes valides avant toute modification
distante. Le dossier local choisi était :

```text
supabase/.temp/backups/20260729-forge-realignment/
```

Ce chemin est ignoré par Git. Aucun contenu de sauvegarde ni secret n'a été
affiché.

### Commandes de sauvegarde tentées

```powershell
npx.cmd supabase db dump --linked --schema public --file supabase/.temp/backups/20260729-forge-realignment/public-schema.sql
npx.cmd supabase db dump --linked --schema public --data-only --use-copy --file supabase/.temp/backups/20260729-forge-realignment/public-data.sql
npx.cmd supabase db dump --linked --schema supabase_migrations --file supabase/.temp/backups/20260729-forge-realignment/migration-history-schema.sql
npx.cmd supabase db dump --linked --schema supabase_migrations --data-only --use-copy --file supabase/.temp/backups/20260729-forge-realignment/migration-history-data.sql
```

Les quatre commandes ont échoué avec `LegacyDockerRunError` : Docker Desktop,
prérequis de `supabase db dump`, n'est pas disponible. Les quatre fichiers
créés par la CLI ont une taille de zéro octet et ne constituent donc pas des
sauvegardes valides.

La sauvegarde séparée des fonctions, politiques et grants concernés n'a pas été
tentée après cet échec, conformément à la consigne d'arrêt immédiat.

### État des opérations distantes

Aucune opération mutante n'a été exécutée :

- migration corrective
  `20260729173634_realign_daily_and_satisfaction_access.sql` non appliquée ;
- aucun `migration repair` ;
- aucun `db push` ;
- aucun objet ni donnée distante modifié.

Par conséquent, les vérifications post-application, `migration list` final et
`db push --dry-run` final n'ont pas été lancés. Il serait incorrect de prétendre
que seule Forge reste à appliquer tant que la sauvegarde, la correction et les
repairs validés n'ont pas abouti.

### Condition de reprise

Installer ou démarrer Docker Desktop, puis reprendre depuis le début des
sauvegardes. Les quatre dumps doivent terminer avec un code de sortie nul,
avoir une taille non nulle et recevoir une empreinte SHA-256 avant toute
application SQL. Les fichiers de zéro octet doivent être considérés comme
invalides et remplacés.

Alternative acceptable uniquement après validation humaine : produire des
sauvegardes restaurables équivalentes avec `pg_dump`/`psql` et une connexion
sécurisée, sans afficher ni enregistrer le mot de passe dans le dépôt ou le
rapport.
