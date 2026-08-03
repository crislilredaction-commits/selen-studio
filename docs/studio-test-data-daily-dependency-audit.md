# Audit complementaire des dependances Daily avant suppression de donnees test Studio

Date: 2026-08-03  
Projet Supabase: Selen Studio `pjbilmywwkpghhayftph`  
Branche: `chore/studio-cleanup-consolidation`  
Mode: lecture seule uniquement

## 1. Cadre de securite

Aucune suppression reelle n'a ete effectuee.

Aucune commande `DELETE`, meme transactionnelle ou avec `ROLLBACK`, n'a ete executee pendant cet audit.  
Aucune modification Auth, aucune migration, aucun changement distant et aucun nettoyage partiel n'ont ete faits.

Les emails complets ont ete verifies dans la base pour etablir les associations, mais ils sont masques dans ce rapport afin d'eviter d'exposer des donnees personnelles inutiles.

Elements strictement hors perimetre:

- Haïm Levi et toutes ses dependances;
- `client_tool_access` `15a61ca7-445f-4b8d-9052c38ace52520c3330025bb66b74`;
- les 8 lignes de `lil_invoices`;
- les 13 lignes de `external_audits`;
- la ligne de `selen_expenses`.

## 2. Comptes Auth audites

| Compte candidat | Auth ID | Email masque | Organisation associee par email | Statut organisation | Derniere connexion connue | Recommandation |
| --- | --- | --- | --- | --- | --- | --- |
| barthauxauto / Barthaux Auto | `fdbb00c8-148c-4d13-976d-2856d5218813` | `ba***@gmail.com` | `barthauxauto` (`f6c5f386-9513-4a0a-b457-43cd5cf71693`) | active | 2026-07-05 | Suppression possible uniquement si Lil confirme que tout le parcours Barthaux Auto est test |
| Selen Formation | `b129473c-bcf5-49b8-8bed-bcd07bd478a0` | `li***@outlook.fr` | `Selen Formation` (`0df0dc02-40c3-431c-a19e-ac998e90bf37`) | active | 2026-07-07 | Exclusion temporaire du compte Auth faute de preuve suffisante sur les dependances non Daily |

## 3. Lignes Daily detectees

### 3.1 Compte Auth `barthauxauto`

| Table | ID | Libelle / type | Statut | Relation | Creation | Derniere mise a jour | Appartenance probable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `daily_subscriptions` | `14cdf836-3ec2-4194-a427-83c0109e5632` | tier `base`, limite 150 apprenants | active | checkout Stripe `cs_test_`, periode 2026-07-05 -> 2027-07-05 | 2026-07-05 03:18 UTC | 2026-07-29 18:31 UTC | Barthaux Auto, test |
| `daily_document_templates` | `c9ea51c3-463a-48f4-b634-095045ccc0a1` | convocation / Modele convocation client | archived | user_id Auth barthauxauto, pas de storage_path, pas de public_url | 2026-07-05 04:32 UTC | 2026-07-05 04:45 UTC | Barthaux Auto, test probable |
| `daily_document_templates` | `892401be-b843-4041-8347-bd499c909e90` | convention / Modele convention client | archived | user_id Auth barthauxauto, pas de storage_path, pas de public_url | 2026-07-05 04:32 UTC | 2026-07-05 04:45 UTC | Barthaux Auto, test probable |
| `daily_document_templates` | `4f682d23-88c7-4743-8f79-ba73edde2983` | politique_handicap / Politique handicap client | archived | user_id Auth barthauxauto, pas de storage_path, pas de public_url | 2026-07-05 04:32 UTC | 2026-07-05 04:45 UTC | Barthaux Auto, test probable |
| `daily_trainers` | `dd63b3a9-326c-40ae-818d-14f86f4f89ba` | Laurent Barthaux | `to_prepare` | user_id Auth barthauxauto, email masque `ba***@gmail.com`, pas de CV en attente | 2026-07-05 04:45 UTC | 2026-07-05 04:45 UTC | Barthaux Auto, test probable |
| `daily_formations` | `af57d09c-eebf-4268-9fe6-1b0751785968` | La mecanique facile | draft | user_id Auth barthauxauto, version 1, pas de version precedente | 2026-07-05 04:54 UTC | 2026-07-05 04:54 UTC | Barthaux Auto, test probable |
| `daily_sessions` | `413d01e2-9f38-422e-b614-90c510a80a03` | presentiel | ready / inscription `to_prepare` | formation_id `af57d09c-eebf-4268-9fe6-1b0751785968` | 2026-07-05 04:58 UTC | 2026-07-05 04:58 UTC | Barthaux Auto, test probable |
| `daily_onboarding` | non detaille dans la sortie nominative | onboarding Daily | present | user_id Auth barthauxauto | n/a | n/a | Barthaux Auto, test probable |

Relations internes Daily:

- `daily_sessions.formation_id` pointe vers `daily_formations.id`.
- La session `413d01e2-9f38-422e-b614-90c510a80a03` est la seule session rattachee a la formation `af57d09c-eebf-4268-9fe6-1b0751785968`.
- Aucun enfant detecte sur la session dans:
  - `daily_conventions`;
  - `daily_convocations`;
  - `daily_convention_signatures`;
  - `daily_portal_access_tokens`;
  - `daily_registration_recipients`;
  - `daily_registration_responses`;
  - `daily_registration_reviews`.
- Aucun enfant detecte sur la formation dans `daily_formation_registration_requests`.
- Aucune version enfant detectee via `daily_formations.previous_version_id`.

Indices test:

- le compte est associe a deux paiements Stripe `cs_test_`;
- l'abonnement Daily est lui-meme `cs_test_`;
- la formation est en brouillon;
- les modeles documentaires sont archives et sans fichier Storage/public URL;
- aucune inscription, convention, convocation ou signature n'est rattachee a la session.

Conclusion: les dependances Daily de `barthauxauto` semblent exclusivement appartenir au parcours Barthaux Auto de test. Recommandation: **suppression sure avec perimetre exact**, sous reserve que Lil confirme que Barthaux Auto est bien faux/test.

### 3.2 Compte Auth `Selen Formation`

Aucune ligne trouvee dans les quatre tables Daily demandees:

- `daily_formations`: 0;
- `daily_sessions`: 0;
- `daily_document_templates`: 0;
- `daily_trainers`: 0.

Autres lignes liees au compte Auth:

| Table | ID | Detail | Statut | Relation |
| --- | --- | --- | --- | --- |
| `selen_client_profiles` | `1d3d90be-df7b-459b-bdb0-5baed07f3d02` | `Organisme Test`, email masque `li***@outlook.fr`, nom `Client Test` | n/a | user_id Auth Selen Formation |
| `selen_client_tool_access` | `dc42be10-1fe1-441c-9091-0633edf291d9` | `preaudit-qualiopi`, acces `limited` | active | user_id Auth Selen Formation |

Conclusion Daily: aucun blocage Daily detecte pour Selen Formation.  
Conclusion globale Auth: la suppression du compte Auth supprimerait aussi des lignes `selen_client_*` non listees explicitement dans la decision de suppression initiale. Recommandation: **exclusion temporaire du compte Auth faute de preuve suffisante**, ou nouvelle validation explicite des lignes `selen_client_profiles` et `selen_client_tool_access`.

## 4. Contraintes de cles etrangeres Daily

Contraintes principales observees:

| Source | Cible | On delete | Consequence |
| --- | --- | --- | --- |
| `daily_subscriptions.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait l'abonnement |
| `daily_formations.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait les formations |
| `daily_sessions.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait les sessions |
| `daily_document_templates.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait les modeles |
| `daily_trainers.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait les formateurs |
| `daily_onboarding.user_id` | `auth.users.id` | CASCADE | supprimer le compte Auth supprimerait l'onboarding |
| `daily_sessions.formation_id` | `daily_formations.id` | RESTRICT | supprimer une formation directement exige de supprimer ses sessions avant |
| `daily_formation_registration_requests.formation_id` | `daily_formations.id` | CASCADE | aucune ligne detectee pour la formation Barthaux |
| `daily_conventions.session_id` | `daily_sessions.id` | CASCADE | aucune ligne detectee pour la session Barthaux |
| `daily_convocations.session_id` | `daily_sessions.id` | CASCADE | aucune ligne detectee pour la session Barthaux |
| `daily_registration_* .session_id` | `daily_sessions.id` | CASCADE | aucune ligne detectee pour la session Barthaux |

Point important:

- supprimer un compte Auth declencherait beaucoup de cascades Daily;
- supprimer uniquement une organisation candidate ne supprime pas directement les lignes Daily, car ces lignes sont rattachees a `auth.users`, pas a `organisations`;
- supprimer une formation sans supprimer d'abord sa session serait bloque par `daily_sessions_formation_id_fkey` (`RESTRICT`).

## 5. Declencheurs Daily

Toutes les tables Daily principales auditees utilisent un trigger `BEFORE UPDATE` vers `set_daily_updated_at()`:

- `daily_subscriptions_set_updated_at`;
- `daily_formations_set_updated_at`;
- `daily_sessions_set_updated_at`;
- `daily_document_templates_set_updated_at`;
- `daily_trainers_set_updated_at`;
- et les triggers equivalents sur conventions, convocations, inscriptions, portail et onboarding.

Ces triggers ne se declenchent pas sur suppression; ils n'ajoutent donc pas de suppression automatique supplementaire.

## 6. Consequences exactes par compte Auth

### `fdbb00c8-148c-4d13-976d-2856d5218813` / barthauxauto

Suppression du compte Auth:

- supprimerait automatiquement par cascade:
  - `daily_subscriptions` `14cdf836-3ec2-4194-a427-83c0109e5632`;
  - 1 `daily_formations`;
  - 1 `daily_sessions`;
  - 3 `daily_document_templates`;
  - 1 `daily_trainers`;
  - 1 `daily_onboarding`;
  - les donnees Auth internes dependantes (`auth.identities`, sessions, tokens eventuels);
- ne toucherait pas directement l'organisation `barthauxauto`, car l'organisation est liee par email et non par FK Auth observee;
- ne supprimerait pas les objets Storage documentaires de l'organisation; ils necessiteraient une suppression explicite separee;
- ne supprimerait pas les paiements `selen_payments`, car ils sont lies par email/Stripe et non par FK Auth observee.

Risque orphelin:

- si l'organisation est supprimee sans suppression explicite du compte Auth, les lignes Daily resteraient rattachees au compte Auth et deviendraient incoherentes fonctionnellement avec le menage client;
- si le compte Auth est supprime sans suppression organisationnelle, l'organisation et ses dossiers/documents/paiements resteraient presents.

Recommandation: **suppression sure avec le perimetre exact**, si et seulement si Lil confirme que Barthaux Auto est integralement test:

- compte Auth `fdbb00c8-148c-4d13-976d-2856d5218813`;
- toutes les lignes Daily listees section 3.1;
- organisation `f6c5f386-9513-4a0a-b457-43cd5cf71693`;
- dependances documentaires/commerciales deja inventoriees dans `studio-test-data-deletion-report.md`;
- objets Storage rattaches aux documents Barthaux.

### `b129473c-bcf5-49b8-8bed-bcd07bd478a0` / Selen Formation

Suppression du compte Auth:

- ne supprimerait aucune ligne dans `daily_formations`, `daily_sessions`, `daily_document_templates`, `daily_trainers`, `daily_subscriptions`;
- supprimerait par cascade ou contraindrait des donnees hors Daily, notamment:
  - `selen_client_profiles` `1d3d90be-df7b-459b-bdb0-5baed07f3d02`;
  - `selen_client_tool_access` `dc42be10-1fe1-441c-9091-0633edf291d9`;
  - le preaudit lie au compte, deja inventorie precedemment.

Risque:

- les lignes `selen_client_*` ne sont pas les memes que `client_tool_access` `62a14112-9ed6-4561-8518-ebff7555fe21`;
- elles n'ont pas ete nommees explicitement dans la decision initiale;
- supprimer le compte Auth sans validation de ces lignes serait un elargissement de perimetre.

Recommandation: **exclusion temporaire faute de preuve suffisante** pour le compte Auth.  
L'organisation Selen Formation peut rester candidate a suppression, mais le compte Auth et les lignes `selen_client_*` doivent recevoir une validation humaine separee.

## 7. Consequences exactes par organisation candidate

| Organisation | ID | Effet sur Daily si seule l'organisation est supprimee | Donnees orphelines possibles | Recommandation |
| --- | --- | --- | --- | --- |
| Selen Formation | `0df0dc02-40c3-431c-a19e-ac998e90bf37` | Aucun effet Daily direct detecte | Compte Auth + `selen_client_*` peuvent rester sans organisation applicative correspondante | Exclusion temporaire du compte Auth; suppression organisationnelle possible seulement avec plan explicite |
| Atelier Horizon | `2e9b095a-5cca-47e9-b337-e59647fd0da6` | Aucun compte Auth/Daily detecte | Aucun orphelin Daily attendu | Suppression sure cote Daily |
| Didascalil | `59e2d76d-556d-4ce8-8810-6172293d1612` | Aucun compte Auth/Daily detecte | Aucun orphelin Daily attendu | Suppression sure cote Daily |
| barthauxauto | `f6c5f386-9513-4a0a-b457-43cd5cf71693` | Aucun effet Daily direct; les lignes Daily resteraient si le compte Auth n'est pas aussi traite | Daily + Auth + paiement test resteraient incoherents avec une organisation supprimee | Suppression sure uniquement avec perimetre Barthaux complet incluant Auth/Daily |
| Haïm Levi | `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` | Hors perimetre | Aucun traitement autorise | Conservation obligatoire |

## 8. Donnees qui seraient supprimees automatiquement par cascade

Uniquement si suppression du compte Auth barthauxauto:

- `daily_subscriptions` `14cdf836-3ec2-4194-a427-83c0109e5632`;
- `daily_formations` `af57d09c-eebf-4268-9fe6-1b0751785968`;
- `daily_sessions` `413d01e2-9f38-422e-b614-90c510a80a03`;
- `daily_document_templates`:
  - `c9ea51c3-463a-48f4-b634-095045ccc0a1`;
  - `892401be-b843-4041-8347-bd499c909e90`;
  - `4f682d23-88c7-4743-8f79-ba73edde2983`;
- `daily_trainers` `dd63b3a9-326c-40ae-818d-14f86f4f89ba`;
- `daily_onboarding`: 1 ligne;
- dependances Auth internes.

Uniquement si suppression du compte Auth Selen Formation:

- aucune ligne Daily demandee;
- mais suppression potentielle de `selen_client_profiles` et `selen_client_tool_access`, hors validation actuelle.

## 9. Donnees necessitant une suppression explicite

Pour Barthaux Auto, meme si le compte Auth et les lignes Daily sont traites, resteraient a supprimer explicitement dans un plan separe:

- organisation `barthauxauto`;
- dossiers, documents, messages, notifications;
- objets Storage documentaires;
- paiements Stripe test `selen_payments`;
- eventuelles lignes documentaires ou techniques non FK Auth.

Pour Selen Formation:

- organisation, dossiers, documents, messages, notifications;
- objets Storage documentaires;
- `client_tool_access` `62a14112-9ed6-4561-8518-ebff7555fe21`;
- eventuellement `selen_client_profiles` et `selen_client_tool_access` seulement apres decision humaine explicite.

## 10. Ordre theorique de suppression, non execute

Cet ordre est theorique et ne doit pas etre execute sans nouvelle validation humaine, sauvegardes fraiches et simulation separee.

### Option A — Barthaux Auto complet, si confirme test

1. Export cible et inventaire Storage a jour.
2. Supprimer explicitement les enfants organisationnels non Auth:
   - notifications;
   - messages;
   - documents et objets Storage;
   - variables/programmes/analyses/dossiers selon FK.
3. Supprimer les paiements Stripe test associes.
4. Supprimer le compte Auth barthauxauto pour cascader les lignes Daily test, ou supprimer explicitement les lignes Daily dans l'ordre:
   - `daily_onboarding`;
   - `daily_document_templates`;
   - `daily_trainers`;
   - `daily_subscriptions`;
   - `daily_sessions`;
   - `daily_formations`.
5. Supprimer les dossiers puis l'organisation.
6. Verifier l'absence d'orphelins et le maintien de Haïm Levi.

### Option B — Selen Formation sans suppression Auth

1. Export cible et inventaire Storage a jour.
2. Supprimer les dependances organisationnelles deja validees.
3. Supprimer `client_tool_access` `62a14112-9ed6-4561-8518-ebff7555fe21`.
4. Ne pas supprimer le compte Auth `b129473c-bcf5-49b8-8bed-bcd07bd478a0` tant que les lignes `selen_client_*` ne sont pas validees.
5. Verifier qu'aucune ligne Daily n'est touchee.

### Option C — Atelier Horizon / Didascalil

1. Export cible.
2. Supprimer les dependances organisationnelles.
3. Supprimer les dossiers puis l'organisation.
4. Aucun traitement Daily/Auth attendu.

## 11. Decisions demandees a Lil

Lil, j'ai besoin de tes validations ligne par ligne avant toute suppression:

1. Confirmer que tout le bloc Barthaux Auto, y compris le compte Auth `fdbb00c8-148c-4d13-976d-2856d5218813` et les lignes Daily listees, est bien du test supprimable.
2. Confirmer si le compte Auth Selen Formation doit rester conserve provisoirement, ou si les lignes `selen_client_profiles` et `selen_client_tool_access` doivent entrer dans le perimetre d'une future suppression.
3. Confirmer que l'on exclut toujours totalement Haïm Levi et `client_tool_access` `15a61ca7-445f-4b8d-9052c38ace52520c3330025bb66b74`.
4. Confirmer si Atelier Horizon et Didascalil peuvent rester dans le lot de suppression, sans traitement Daily/Auth.

## 12. Conclusion

Les dependances Daily detectees appartiennent a `barthauxauto`, pas a Haïm Levi.

Barthaux Auto parait supprimable comme donnees test, mais seulement avec un perimetre complet incluant Auth + Daily + organisation + documents + paiements test.

Selen Formation ne porte pas de dependance Daily dans les quatre tables demandees, mais son compte Auth porte des dependances `selen_client_*` hors validation initiale. Il doit donc rester exclu temporairement tant que ces lignes ne sont pas explicitement validees.
