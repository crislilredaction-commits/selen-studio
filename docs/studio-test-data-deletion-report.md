# Rapport de suppression controlee des donnees commerciales de test Studio

Date: 2026-08-03  
Environnement: Supabase Selen Studio `pjbilmywwkpghhayftph`  
Branche locale: `chore/studio-cleanup-consolidation`  
Etat: **ARRET DE SECURITE AVANT DRY-RUN DELETE ET AVANT SUPPRESSION REELLE**

## 1. Decision metier prise en compte

Donnees a conserver absolument:

- Haïm Levi;
- son organisation;
- son compte Auth;
- son preaudit;
- son acces outil `client_tool_access` `15a61ca7-445f-4b8d-9052-6ff83bc0b488`;
- toutes ses dependances.

Donnees reelles a conserver:

- `lil_invoices`: 8 lignes;
- `external_audits`: 13 lignes;
- `selen_expenses`: 1 ligne.

Donnees candidates initialement validees pour suppression apres sauvegarde et controle:

- Atelier Horizon;
- Didascalil;
- Barthaux Auto / `barthauxauto`;
- Selen Formation;
- 2 paiements Stripe test;
- 1 abonnement Daily test;
- 1 acces outil test probable.

## 2. Sauvegardes creees et verifiees

Les quatre sauvegardes PostgreSQL natives obligatoires ont ete creees avec les binaires PostgreSQL client 17.10 deja presents localement dans `supabase/.temp/postgresql-client-17/bin`.

Chaque archive a ete generee avec un role temporaire de sauvegarde fourni par la CLI Supabase, renouvele separement pour chaque archive. Les identifiants, mots de passe, chaines de connexion et roles temporaires n'ont pas ete affiches ni consignes.

Dossier local des sauvegardes:

`supabase/.temp/backups/20260803-studio-test-data-deletion/`

| Archive | Debut | Fin | Taille | Entrees `pg_restore --list` | SHA-256 | Controle |
| --- | --- | --- | ---: | ---: | --- | --- |
| `public-schema.dump` | 2026-08-03T12:27:22+02:00 | 2026-08-03T12:27:38+02:00 | 659 563 octets | 1051 | `ED7E4792F05F49894CE4EAB275DFC10CC09781AEDF2BCA992CB3F08743A8A8A4` | OK |
| `public-data.dump` | 2026-08-03T12:27:38+02:00 | 2026-08-03T12:35:38+02:00 | 754 821 621 octets | 109 | `BF386C0403FEDF13A2DDAED9692CC9F3A66CCB3E22D266313D7CDA6E40B1A10F` | OK |
| `auth-storage-schema.dump` | 2026-08-03T12:35:47+02:00 | 2026-08-03T12:35:59+02:00 | 132 252 octets | 255 | `AF63570928810716A4DB29B8BF80C603A6A8646AB960498C39C4F8EC45C90538` | OK |
| `targeted-deletion-context-data.dump` | 2026-08-03T12:35:59+02:00 | 2026-08-03T12:36:12+02:00 | 114 996 octets | 31 | `80823F515FBE537E44D3F1EEE4EE03803B3590479F22507921BFA2D5BDD6460D` | OK |

## 3. Identifiants candidats confirmes

Organisations candidates:

| Candidat | Identifiant organisation | Statut |
| --- | --- | --- |
| Selen Formation | `0df0dc02-40c3-431c-a19e-ac998e90bf37` | active |
| Atelier Horizon | `2e9b095a-5cca-47e9-b337-e59647fd0da6` | archived |
| Didascalil | `59e2d76d-556d-4ce8-8810-6172293d1612` | archived |
| barthauxauto / Barthaux Auto | `f6c5f386-9513-4a0a-b457-43cd5cf71693` | active |

Lignes commerciales candidates:

| Table | Identifiant | Classification |
| --- | --- | --- |
| `selen_payments` | `67cbc918-3a0d-4479-903e-cc357e2cecfa` | Stripe test |
| `selen_payments` | `f2856bed-f472-4044-80a9-c53f345ecc08` | Stripe test |
| `daily_subscriptions` | `14cdf836-3ec2-4194-a427-83c0109e5632` | Abonnement Daily test |
| `client_tool_access` | `62a14112-9ed6-4561-8518-ebff7555fe21` | Acces outil test probable |

Ligne explicitement conservee:

| Table | Identifiant | Raison |
| --- | --- | --- |
| `client_tool_access` | `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | Liee a Haïm Levi, a conserver |

## 4. Comptages candidats avant suppression

Comptages identifies en lecture seule pour les quatre organisations candidates, hors Haïm Levi:

| Table / dependance | Lignes candidates |
| --- | ---: |
| `organisations` | 4 |
| `dossiers` | 9 |
| `documents` | 16 |
| `messages` | 29 |
| `notifications` | 20 |
| `nda_variables` | 2 |
| `dossier_assignments` | 3 |
| `dossier_program_versions` | 6 |
| `program_ai_analyses` | 7 |
| `audit_blanc_cases` | 1 |
| `audit_blanc_agent_notes` | 1 |
| `audit_blanc_documents` | 16 |
| `audit_blanc_indicator_answers` | 110 |
| `audit_blanc_indicator_notes` | 16 |
| `audit_blanc_reports` | 1 |
| `preaudit_sessions` | 1 |
| `preaudit_answers` | 83 |
| `preaudit_profile_answers` | 21 |
| `preaudit_indicator_notes` | 1 |
| `preaudit_brand_usage_checks` | 1 |
| `selen_payments` | 2 |
| `daily_subscriptions` | 1 |
| `client_tool_access` test | 1 |
| `storage.objects` rattaches aux chemins documentaires candidats | 31 |
| comptes `auth.users` candidats | 2 |

Gardes verifies:

| Controle | Resultat |
| --- | --- |
| `lil_invoices` rattachees aux 4 candidats | 0 |
| `external_audits` rattaches aux 4 candidats | 0 |
| `selen_expenses` total | 1 ligne, conservee |
| `client_tool_access` Haïm Levi | 1 ligne, conservee |
| FK Forge sur les 2 comptes Auth candidats | 0 ligne detectee |

## 5. Blocage detecte avant dry-run

Les deux comptes Auth candidats ne sont pas isoles. Ils portent des dependances Daily metier au-dela du seul abonnement Daily test explicitement valide:

| Dependance liee aux 2 comptes Auth candidats | Lignes detectees |
| --- | ---: |
| `selen_client_profiles` | 1 |
| `selen_client_tool_access` | 1 |
| `daily_subscriptions` | 1 |
| `daily_formations` | 1 |
| `daily_sessions` | 1 |
| `daily_document_templates` | 3 |
| `daily_trainers` | 1 |
| `preaudit_sessions` | 1 |
| `preaudit_brand_usage_checks` | 1 |
| `audit_blanc_cases` via client ou agent | 1 |

La mission interdit explicitement de toucher au Daily metier. Or supprimer les comptes Auth candidats pourrait entrainer des cascades sur `daily_formations`, `daily_sessions`, `daily_document_templates` et `daily_trainers`.

Conclusion: **arret obligatoire avant dry-run DELETE et avant suppression reelle**.

## 6. Dry-run transactionnel

Non execute.

Raison: l'identification finale a revele des dependances Daily metier non explicitement validees pour suppression. Lancer un dry-run DELETE aurait deja constitue une simulation de modification distante sur un perimetre devenu ambigu.

## 7. Suppression reelle

Non executee.

Aucune ligne distante n'a ete supprimee ou modifiee.

## 8. Donnees reelles preservees

Verifications en lecture seule:

- Haïm Levi n'est pas dans les quatre organisations candidates;
- `client_tool_access` `15a61ca7-445f-4b8d-9052-6ff83bc0b488` est explicitement conserve;
- aucune facture `lil_invoices` n'est rattachee aux quatre organisations candidates;
- aucun audit externe `external_audits` n'est rattache aux quatre organisations candidates;
- `selen_expenses` reste hors perimetre.

## 9. Elements non supprimes

Tout est conserve pour l'instant:

- les 4 organisations candidates;
- leurs dossiers, documents, messages, notifications et objets Storage;
- les 2 paiements Stripe test;
- l'abonnement Daily test;
- l'acces outil test probable;
- les 2 comptes Auth candidats;
- toutes les dependances Daily, preaudit et audit blanc.

## 10. Recommandation minimale pour reprendre

Lil, j'ai detecte un risque pour les donnees Daily, donc je me suis arrete sans rien supprimer.

Pour reprendre, il faut une decision explicite sur les dependances Daily liees aux comptes Auth candidats:

1. conserver les comptes Auth et supprimer seulement les lignes commerciales/organisations sans toucher aux donnees Daily;
2. ou autoriser une mission separee d'audit Daily pour classer `daily_formations`, `daily_sessions`, `daily_document_templates`, `daily_trainers` et `selen_client_*`;
3. ou exclure totalement les comptes Auth de cette suppression et nettoyer uniquement les organisations/dossiers/documents si les FK le permettent.

La voie la plus sure: ne pas supprimer les comptes Auth tant que les dependances Daily ne sont pas qualifiees ligne par ligne.

## 11. Methode de restauration

En cas de future suppression, restauration possible depuis les archives locales:

- `public-schema.dump` et `public-data.dump` pour restaurer le schema et les donnees publiques;
- `auth-storage-schema.dump` pour verifier la structure Auth/Storage;
- `targeted-deletion-context-data.dump` pour retrouver le contexte des tables touchees.

Toute restauration doit etre testee dans un environnement isole avant d'etre envisagee sur le projet principal.
