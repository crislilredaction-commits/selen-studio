# Audit de l’historique des migrations Supabase

Date : 29 juillet 2026
Branche : `feature/forge-cody-supabase`
Projet audité : **Selen Studio** (`pjbilmywwkpghhayftph`)
Périmètre : 33 migrations antérieures à
`20260729183000_create_forge_persistence.sql`

## Synthèse générale

L’historique distant `supabase_migrations.schema_migrations` ne contient aucune
des 33 versions locales étudiées. Le schéma réel montre pourtant que la grande
majorité de leurs effets existe déjà.

Classification conservatrice :

| Classification | Nombre |
| --- | ---: |
| Déjà appliquée intégralement | 29 |
| Partiellement appliquée | 3 |
| Obsolète | 1 |
| Absente | 0 |
| Probablement appliquée | 0 |
| Impossible à confirmer | 0 |

Cette classification porte sur les effets observables actuels, pas sur la
preuve historique de la commande qui les a créés. Une migration n’est classée
« déjà appliquée intégralement » que lorsque les tables ou colonnes, contraintes,
index, fonctions, triggers, RLS et politiques qu’elle attend sont présents, ou
qu’une migration locale suivante explique explicitement leur remplacement.

Le réalignement ne doit pas commencer avant une décision humaine sur trois
migrations partielles et une migration obsolète :

- `20260624000000` : politique SELECT de `satisfaction_surveys` absente ;
- `20260701110000` : politique de `lil_billing_profiles` absente ;
- `20260703100000` : deux colonnes annuelles absentes de
  `daily_subscriptions`, alors que des fonctions distantes les référencent ;
- `20260701090000` : ancienne contrainte de statuts des factures remplacée par
  `20260701120000`.

## Méthode et preuves

Les contrôles ont été exclusivement réalisés en lecture seule :

- lecture des 33 fichiers SQL locaux ;
- `supabase migration list` et résultat du dry-run déjà documentés ;
- introspection de `pg_class`, `pg_attribute`, `pg_constraint`, `pg_index`,
  `pg_trigger`, `pg_proc` et `pg_policies` ;
- contrôle de RLS via `relrowsecurity` ;
- contrôle agrégé des données de seed et de migration, sans extraire de secret ;
- recherche des dépendances dans le code applicatif actuel ;
- prise en compte des migrations locales suivantes qui remplacent un objet.

Aucune migration, réparation ou modification distante n’a été exécutée.

## Tableau des 33 migrations

| Timestamp | Fichier | Objectif apparent | Objets principaux | Classification | Risque de rejeu |
| --- | --- | --- | --- | --- | --- |
| `20260616000000` | `create_articles.sql` | Gestion éditoriale Studio/Vitrine | `articles`, 2 index métier, fonction et trigger d’horodatage, 4 politiques | Déjà appliquée intégralement | Élevé : recréation de politiques non idempotente |
| `20260617000000` | `add_nda_liste_formateurs_variables.sql` | Variables de liste de formateurs | 7 colonnes sur `nda_variables` | Déjà appliquée intégralement | Faible, ajouts `if not exists` |
| `20260617001000` | `add_nda_phase_validations.sql` | Persistance des validations NDA | `nda_phase_validations` | Déjà appliquée intégralement | Faible |
| `20260617002000` | `add_nda_deposit_followup_fields.sql` | Suivi de dépôt NDA | 6 colonnes de code, statut et dates | Déjà appliquée intégralement | Faible |
| `20260617003000` | `add_nda_manual_analysis_texts.sql` | Textes d’analyse manuelle | `cv_manual_text`, `program_manual_text` | Déjà appliquée intégralement | Faible |
| `20260624000000` | `studio_read_vitrine_followup_tables.sql` | Lecture Studio des rendez-vous et satisfactions | RLS et politiques sur `appointment_requests`, `satisfaction_surveys` | **Partiellement appliquée** | Élevé : changement d’accès RLS |
| `20260625000000` | `create_client_reminders.sql` | Relances client | `client_reminders`, 4 index, fonction, trigger, 3 politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260625001000` | `allow_completed_preaudit_results_after_access_expiration.sql` | Lecture des préaudits terminés | RLS et 4 politiques SELECT | Déjà appliquée intégralement | Modéré : blocs conditionnels idempotents |
| `20260625002000` | `support_sav_v1.sql` | Codes de réduction et remboursements SAV | `discount_codes`, `support_refund_requests`, index, contraintes, politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260626000000` | `create_external_audits_and_admin_refunds.sql` | Audits externes et restriction admin des remboursements | `external_audits`, fonction, trigger, politiques ; remplacement politique refund | Déjà appliquée intégralement | Élevé : politiques et dépendance à la migration précédente |
| `20260626001000` | `create_selen_payments_and_expenses.sql` | Paiements et dépenses | `selen_payments`, `selen_expenses`, 5 index, 3 politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260626002000` | `support_reply_tokens_and_public_discount_codes.sql` | Réponses support et codes publics | `support_reply_tokens`, extension `discount_codes`, `discount_code_redemptions` | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260626003000` | `seed_nda_tool_catalog.sql` | Référencer l’outil NDA | ligne `selen_tools_catalog.slug = 'nda'` | Déjà appliquée intégralement | Faible mais réécrit les valeurs du catalogue |
| `20260629090000` | `external_audits_delivery_mode_reminders_and_meet.sql` | Modalité, Meet et rappels d’audits | 5 colonnes, contrainte, 2 index, backfill | Déjà appliquée intégralement | Modéré : réexécute un backfill |
| `20260629110000` | `create_lil_invoice_generator.sql` | Générateur de factures | 3 tables, 3 index, 2 triggers, 2 fonctions, 3 politiques, 2 singletons | Déjà appliquée intégralement | **Très élevé** : données singleton et fonction `security definer` |
| `20260701090000` | `lil_invoice_statuses_and_email.sql` | Statuts `sent`/`paid` et dates d’envoi | 3 colonnes, 2 index, ancienne contrainte de statut | **Obsolète** | **Très élevé** : rétablit une contrainte remplacée |
| `20260701100000` | `external_audit_lifecycle_to_invoice.sql` | Passage des audits à facturer | contrainte `external_audits_status_check`, 2 index | Déjà appliquée intégralement | Élevé : drop/recreate de contrainte |
| `20260701110000` | `lil_billing_profiles.sql` | Profils de facturation réutilisables | table, 3 index, fonction, trigger, RLS, politique ALL | **Partiellement appliquée** | Élevé : politique manquante et non idempotente |
| `20260701120000` | `lil_invoice_generated_deposited_statuses.sql` | Statuts finaux `generated`/`deposited` | colonne, index, contrainte finale, migration de données | Déjà appliquée intégralement | **Très élevé** : réécrit des statuts |
| `20260701130000` | `lil_invoice_settings_and_profile_details.sql` | Mentions légales et détails de facturation | 8 colonnes, index SIRET, mise à jour singleton | Déjà appliquée intégralement | **Très élevé** : réécrit des données de facturation |
| `20260703090000` | `create_selen_daily_v1.sql` | Socle Selen Daily | `daily_formations`, `daily_sessions`, index, fonction, triggers, 8 politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260703100000` | `add_selen_daily_onboarding_and_subscription.sql` | Abonnement, onboarding, formateurs et calcul annuel | 3 tables, colonne session, index, triggers, 3 fonctions, 8 politiques | **Partiellement appliquée** | **Critique** : rejeu ne recrée pas les colonnes manquantes |
| `20260703110000` | `add_selen_daily_registration_flow.sql` | Parcours d’inscription par session | colonnes session, `daily_registration_responses`, index, trigger, fonction, 3 politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260703120000` | `add_selen_daily_registration_recipients.sql` | Destinataires d’inscription | table, contrainte unique, index, trigger, politique | Déjà appliquée intégralement | Élevé : politique non idempotente |
| `20260703130000` | `add_selen_daily_registration_reviews.sql` | Revue du positionnement | table, contraintes, index, trigger, RLS | Déjà appliquée intégralement | Modéré |
| `20260703140000` | `add_selen_daily_positioning_questionnaire.sql` | Questionnaire de positionnement | 2 colonnes sur `daily_formations` | Déjà appliquée intégralement | Faible |
| `20260704100000` | `add_selen_daily_conventions.sql` | Conventions générées | table, contraintes, index, trigger, politique | Déjà appliquée intégralement | Élevé : politique non idempotente |
| `20260704110000` | `add_selen_daily_convention_signatures.sql` | Signatures de conventions | table, contraintes, 2 index, trigger, politique | Déjà appliquée intégralement | Élevé : politique non idempotente |
| `20260704120000` | `add_selen_daily_portal_access_tokens.sql` | Jetons d’accès aux portails Daily | table, contraintes, index, trigger, politique | Déjà appliquée intégralement | Élevé : politique non idempotente |
| `20260704130000` | `add_selen_daily_before_training_documents.sql` | Modèles et convocations | colonnes onboarding, 2 tables, index, triggers, politiques | Déjà appliquée intégralement | Élevé : politiques non idempotentes |
| `20260705110000` | `stabilize_selen_daily_ux.sql` | Stabilisation onboarding et inscription publique | colonnes sur 4 tables, modèle, demandes d’inscription, index, triggers, politiques | Déjà appliquée intégralement | Élevé : politique non idempotente |
| `20260707100000` | `add_client_notification_pause.sql` | Pause des notifications client | colonne et index sur `organisations` | Déjà appliquée intégralement | Faible |
| `20260707110000` | `create_agent_assistance_mode.sql` | Jetons et journal d’assistance agent | 2 tables, FK, contraintes et 3 index | Déjà appliquée intégralement | Modéré ; le distant a en plus RLS activée |

## Preuves par migration

### Articles et NDA — `20260616000000` à `20260617003000`

- `articles` possède exactement les 19 colonnes attendues, les contraintes
  `articles_status_check`, `articles_slug_not_blank`,
  `articles_category_not_blank` et `articles_reading_time_positive`.
- Les index `articles_status_published_at_idx` et
  `articles_updated_at_idx`, la fonction et le trigger
  `set_articles_updated_at`, RLS et les quatre politiques attendues existent.
- Les pages et services `src/app/agent/articles/*`,
  `src/components/articles/*` et `src/lib/server/articles.ts` consomment la
  table.
- Les 16 colonnes ajoutées par les quatre migrations NDA sont toutes visibles
  sur `nda_variables`, avec `nda_phase_validations` non nullable et sa valeur
  par défaut `{}`.
- Le code actuel utilise notamment `nda_phase_validations` dans la route de
  validation NDA.

Conclusion : ces cinq migrations ont des preuves structurelles complètes.

### Accès Studio/Vitrine — `20260624000000`

- `appointment_requests` existe, RLS est active et les deux politiques
  `Studio staff can read appointment requests` et
  `Studio staff can update appointment request follow-up` sont présentes.
- `satisfaction_surveys` existe et RLS est active.
- La politique attendue `Studio staff can read satisfaction surveys` est
  absente ; aucune politique n’est actuellement attachée à cette table.
- Le code `src/app/agent/satisfaction/page.tsx` interroge cette table.

Conclusion : migration partielle. La politique manquante nécessite une décision
humaine et une migration corrective dédiée ; un `repair` seul ne la créerait
pas.

### Relances et préaudit — `20260625000000` et `20260625001000`

- `client_reminders` possède les colonnes et contraintes initiales, les quatre
  index, le trigger d’horodatage, RLS et les trois politiques attendues. Des
  colonnes supplémentaires existent et proviennent d’évolutions ultérieures.
- Les quatre tables de préaudit existent avec RLS.
- Les quatre politiques de lecture des sessions terminées portent exactement
  les noms prévus, en complément des politiques d’accès actif existantes.
- Les services de relance et les routes de préaudit actuels dépendent de ces
  objets.

Conclusion : effets complets.

### SAV, audits et gestion — `20260625002000` à `20260629090000`

- `discount_codes`, `support_refund_requests`, `support_reply_tokens`,
  `discount_code_redemptions`, `external_audits`, `selen_payments` et
  `selen_expenses` existent.
- Leurs colonnes, contraintes, index et politiques correspondent à la chaîne
  des migrations locales.
- La politique initiale d’update des remboursements par le staff n’existe plus,
  car `20260626000000` la remplace explicitement par
  `Studio admins can update refund requests`, présente au distant.
- `external_audits` possède les cinq colonnes de modalité/Meet/rappel, la
  contrainte `external_audits_delivery_mode_check` et les deux index de rappel.
- Sur les 12 audits distants : aucun mode de livraison n’est nul, aucun lien
  Meet stocké dans les métadonnées ne reste non recopié et aucun ancien rappel
  Lil ne reste non recopié.
- La ligne `selen_tools_catalog.slug = 'nda'` existe une seule fois, est active
  et conserve `display_order = 30`.

Conclusion : effets complets. Les migrations contenant des politiques ou des
backfills restent dangereuses à rejouer malgré cette classification.

### Facturation — `20260629110000` à `20260701130000`

- Les tables `lil_invoice_settings`, `lil_invoice_sequence`, `lil_invoices` et
  `lil_billing_profiles` existent avec RLS.
- Les singletons settings et sequence existent une seule fois ; la séquence
  respecte son minimum.
- Les fonctions `set_lil_invoice_updated_at`,
  `next_lil_invoice_number` et `set_lil_billing_profiles_updated_at`, ainsi que
  les triggers attendus, sont présents. La définition distante de
  `next_lil_invoice_number()` correspond à la migration et reste
  `security definer`.
- Les colonnes `sent_at`, `paid_at`, `email_sent_at`, `deposited_at`, leurs
  index et les index de cycle de vie des audits sont présents.
- La contrainte actuelle autorise les statuts finaux
  `draft`, `generated`, `deposited`, `paid`, `cancelled`. Les données actuelles
  n’utilisent que `deposited`.
- La contrainte créée par `20260701090000` autorisait encore `issued` et `sent` ;
  elle est explicitement remplacée par `20260701120000`. Cette migration est
  donc obsolète prise isolément et dangereuse à rejouer.
- Les colonnes de mentions légales et de profil existent. Le singleton de
  configuration a tous les champs attendus renseignés ; aucune valeur bancaire
  ou personnelle n’a été extraite dans cet audit.
- `lil_billing_profiles` possède table, colonnes, index, fonction, trigger et
  RLS, mais la politique `Lil owner can manage billing profiles` est absente.

Conclusion : quatre migrations sont complètes, `20260701090000` est obsolète et
`20260701110000` est partielle.

### Socle Selen Daily — `20260703090000`

- `daily_formations` et `daily_sessions` possèdent toutes les colonnes,
  contraintes, index et triggers de la V1.
- RLS est active et les huit politiques CRUD attendues sont présentes.
- `set_daily_updated_at()` existe.
- Les pages Daily actuelles consomment ces tables.

Conclusion : effets complets.

### Abonnement et onboarding Daily — `20260703100000`

Objets présents :

- `daily_subscriptions`, `daily_onboarding`, `daily_trainers` ;
- colonne `trainer_ids` sur `daily_sessions` ;
- index et triggers attendus ;
- RLS et politiques attendues ;
- fonctions `daily_refresh_subscription_period(uuid)`,
  `daily_annual_learner_count(uuid)` et
  `daily_prepare_upper_tier_if_needed(uuid)`.

Écart critique :

- `daily_subscriptions.annual_period_start` est absente ;
- `daily_subscriptions.annual_period_end` est absente ;
- la contrainte `annual_period_end > annual_period_start` est donc absente ;
- les définitions distantes des fonctions à un argument référencent toujours
  ces deux colonnes absentes ;
- une ligne d’abonnement existe, ce qui rend un appel à ces fonctions
  susceptible d’échouer à l’exécution ;
- deux surcharges à deux arguments existent au distant mais ne figurent pas
  dans les 33 migrations locales, preuve d’une évolution hors historique local.

Rejouer le fichier ne corrigerait pas cet écart : `create table if not exists`
ne complète pas une table existante. Le rejeu atteindrait ensuite des créations
de politiques déjà présentes.

Conclusion : migration partielle et dangereuse. Une décision fonctionnelle est
requise pour savoir si le modèle annuel par périodes doit être restauré ou si
les anciennes fonctions à un argument doivent être remplacées dans une
migration corrective.

### Parcours d’inscription Daily — `20260703110000` à `20260703140000`

- Les colonnes de workflow d’inscription sont présentes sur `daily_sessions`,
  avec la contrainte de statut et l’index unique du token.
- `daily_registration_responses`, `daily_registration_recipients` et
  `daily_registration_reviews` ont leurs colonnes, FK, contraintes, index et
  triggers.
- Les politiques prévues existent sur responses et recipients. La migration
  reviews active RLS sans créer de politique ; le distant correspond à ce choix.
- `daily_registration_response_summary(uuid)` correspond à la définition
  locale.
- `positioning_mode` et `positioning_questions` existent avec leur contrainte.

Conclusion : effets complets.

### Documents et accès Daily — `20260704100000` à `20260705110000`

- `daily_conventions`, `daily_convention_signatures`,
  `daily_portal_access_tokens`, `daily_document_templates`,
  `daily_convocations` et `daily_formation_registration_requests` existent.
- Les colonnes, FK, uniques, checks, index, triggers, RLS et politiques de
  lecture attendus sont présents.
- Les colonnes ajoutées à `daily_onboarding`, `daily_trainers`,
  `daily_formations` et `daily_sessions` par la stabilisation UX sont présentes.
- `daily_document_templates` reprend volontairement une création déjà présente
  dans la migration précédente ; l’état final correspond aux deux fichiers.

Conclusion : effets complets.

### Notifications et assistance — `20260707100000` et `20260707110000`

- `organisations.client_notifications_paused` et son index existent. RLS reste
  désactivée sur `organisations`, conformément au constat de sécurité antérieur
  et hors périmètre de cet audit.
- Les tables d’assistance, leurs colonnes, FK, contraintes uniques et trois
  index métier existent.
- Le code actuel dépend des jetons d’assistance dans
  `src/lib/server/agentAssistanceTokens.ts`.
- Le distant a RLS activée sur les deux tables d’assistance alors que le fichier
  local ne l’active pas et ne crée aucune politique. C’est un durcissement ou
  une dérive postérieure, pas un élément manquant de la migration auditée.

Conclusion : effets structurels complets, avec dérive distante documentée.

## Migrations pouvant éventuellement être marquées comme appliquées

Sous réserve d’une validation humaine et d’une sauvegarde, les 29 migrations
classées « déjà appliquée intégralement » sont candidates à un marquage
historique, car leurs effets attendus sont présents.

Ne pas inclure automatiquement :

- `20260624000000` ;
- `20260701090000` ;
- `20260701110000` ;
- `20260703100000`.

Même pour les 29 candidates, le marquage doit être préparé sous forme de liste
explicite et relu avant exécution. Cet audit ne lance aucune réparation.

## Éléments réellement manquants

Aucune migration entière n’est absente, mais trois ensembles d’effets manquent :

1. politique `Studio staff can read satisfaction surveys` ;
2. politique `Lil owner can manage billing profiles` ;
3. `daily_subscriptions.annual_period_start`,
   `daily_subscriptions.annual_period_end` et leur contrainte de cohérence.

Ces éléments devraient, si leur comportement reste souhaité, être ajoutés dans
une nouvelle migration corrective ciblée. Ils ne doivent pas être obtenus en
rejouant les fichiers historiques.

## Migrations ambiguës ou dangereuses

- `20260701090000` est obsolète isolément : son ancienne contrainte serait
  remplacée seulement si `20260701120000` était rejouée ensuite.
- `20260703100000` est la plus dangereuse : le fichier ne peut pas compléter la
  table existante et les fonctions distantes sont incohérentes avec le schéma.
- Les migrations de facturation contiennent des updates métier et des valeurs
  singleton : ne pas les rejouer.
- Les migrations avec `create policy` sans `drop policy if exists` échoueront
  sur les politiques déjà présentes.
- Les migrations de statut utilisent `drop constraint` puis `add constraint` :
  un échec intermédiaire dégraderait l’intégrité.
- La fonction `next_lil_invoice_number` est `security definer`; son rejeu
  nécessite une revue séparée des droits EXECUTE et ne doit pas servir à
  réaligner l’historique.

## Ordre recommandé de réalignement

1. Réaliser une sauvegarde logique et un inventaire daté du schéma.
2. Décider du modèle annuel de `daily_subscriptions` et des fonctions associées.
3. Décider si les deux politiques manquantes doivent être restaurées.
4. Créer et tester, sur une branche ou un projet Supabase de développement, une
   migration corrective pour les seuls écarts validés.
5. Réexécuter cette introspection après correction.
6. Préparer la liste explicite des versions intégralement confirmées à marquer
   comme appliquées.
7. Traiter les quatre versions exclues individuellement selon la décision
   humaine, sans les rejouer en bloc.
8. Vérifier que `migration list` est aligné.
9. Relancer `db push --dry-run`.
10. N’envisager la migration Forge que si elle est l’unique migration proposée.

## Commandes proposées mais non exécutées

Les exemples suivants sont volontairement documentés, **pas exécutés** :

```powershell
# Sauvegarde logique préalable, vers un emplacement protégé à définir.
npx.cmd supabase db dump --linked --schema public --file <sauvegarde.sql>

# Exemple uniquement : marquage individuel après validation humaine.
npx.cmd supabase migration repair <version-validée> --status applied

# Contrôle après réalignement.
npx.cmd supabase migration list
npx.cmd supabase db push --dry-run
```

Aucune commande `db push`, `migration repair` ou `db reset` n’a été lancée.

## Plan de sauvegarde

Avant toute action ultérieure :

1. sauvegarde logique du schéma `public` et des données ;
2. export séparé des tables contenant des données métier, notamment factures,
   audits, Daily, SAV et assistance ;
3. capture de `supabase_migrations.schema_migrations` ;
4. inventaire des fonctions, triggers, contraintes, index et politiques ;
5. vérification de la restauration sur une cible isolée ;
6. conservation chiffrée de la sauvegarde, sans clé ou mot de passe dans Git.

## Plan de retour arrière

Un `migration repair --status applied` ne modifie que l’historique, mais doit
être réversible version par version :

1. conserver la liste exacte et l’ordre des versions marquées ;
2. si une erreur de classification est prouvée, marquer uniquement la version
   concernée comme `reverted`, après validation humaine ;
3. ne jamais utiliser `db reset` sur ce projet ;
4. pour une migration corrective, écrire une migration inverse dédiée et
   préserver les données avant toute suppression ou changement de contrainte ;
5. restaurer depuis la sauvegarde seulement dans une procédure d’incident
   approuvée.

## Décisions humaines nécessaires

1. La lecture Studio de `satisfaction_surveys` doit-elle être restaurée ?
2. La politique ALL de `lil_billing_profiles` doit-elle être restaurée telle
   quelle ou remplacée par une politique différente ?
3. Le modèle Daily doit-il utiliser les périodes annuelles de la migration
   locale ou les surcharges distantes avec année explicite ?
4. `20260701090000` doit-elle être marquée comme appliquée en raison de ses
   colonnes/index présents, ou traitée comme version obsolète absorbée par
   `20260701120000` ?
5. Quelle liste exacte de versions intégralement confirmées est autorisée pour
   un futur `migration repair` ?

## Risque de sécurité hors périmètre

Douze tables existantes ont toujours RLS désactivée : `profiles`,
`organisations`, `dossiers`, `dossier_assignments`, `formations`, `documents`,
`nda_variables`, `messages`, `notifications`, `internal_messages`,
`program_ai_analyses` et `dossier_program_versions`.

Elles n’ont pas été modifiées. Leur activation RLS sans politiques adaptées
pourrait casser les parcours actuels et exige un chantier séparé.

## Garanties de cette intervention

- aucun fichier SQL historique modifié ;
- aucun objet distant modifié ;
- aucune migration appliquée ou réparée ;
- aucun reset ou commande destructive ;
- aucun merge vers `main` ;
- aucun déploiement Vercel.
