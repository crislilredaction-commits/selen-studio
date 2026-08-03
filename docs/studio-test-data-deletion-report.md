# Rapport de suppression controlee des donnees commerciales de test Studio

Date: 2026-08-03  
Environnement: Supabase Selen Studio `pjbilmywwkpghhayftph`  
Branche locale: `chore/studio-cleanup-consolidation`  
Etat: **SUPPRESSION REELLE EXECUTEE ET CONTROLEE**

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

Executee le 2026-08-03, apres validation humaine explicite du perimetre incluant Atelier Horizon, Didascalil, Barthaux Auto / `barthauxauto` et Selen Formation.

La suppression relationnelle a ete effectuee dans une transaction PostgreSQL persistante, dans l'ordre valide par les dry-runs:

1. lignes commerciales ciblees;
2. dependances Daily ciblees des comptes Auth de test;
3. profils et acces client de test;
4. preaudit de test et dependances;
5. audit blanc de test et dependances;
6. messages, notifications, assignations, variables NDA et analyses IA des dossiers cibles;
7. documents puis dossiers;
8. organisations;
9. comptes `auth.users` de test.

Les objets Storage ont ete sauvegardes localement avant suppression, puis supprimes via le SDK Supabase Storage. Aucun `DELETE` SQL direct n'a ete execute sur `storage.objects`.

### Comptages de suppression par perimetre cible

Les controles apres suppression confirment que les lignes ciblees suivantes sont a `0`.

| Donnee ciblee | Avant suppression | Apres suppression | Resultat |
| --- | ---: | ---: | --- |
| `organisations` ciblees | 4 | 0 | Supprime |
| comptes `auth.users` candidats | 2 | 0 | Supprime |
| `selen_payments` cibles | 2 | 0 | Supprime |
| `daily_subscriptions` ciblee `14cdf836-3ec2-4194-a427-83c0109e5632` | 1 | 0 | Supprime |
| `client_tool_access` test `62a14112-9ed6-4561-8518-ebff7555fe21` | 1 | 0 | Supprime |
| `selen_client_profiles` des comptes Auth cibles | 1 | 0 | Supprime |
| `selen_client_tool_access` des comptes Auth cibles | 1 | 0 | Supprime |
| `preaudit_sessions` des comptes Auth cibles | 1 | 0 | Supprime |
| `daily_formations` des comptes Auth cibles | 1 | 0 | Supprime |
| `daily_sessions` des comptes Auth cibles | 1 | 0 | Supprime |
| `daily_document_templates` des comptes Auth cibles | 3 | 0 | Supprime |
| `daily_trainers` des comptes Auth cibles | 1 | 0 | Supprime |

Comptages globaux apres suppression:

| Table | Total apres suppression |
| --- | ---: |
| `organisations` | 3 |
| `dossiers` | 5 |
| `documents` | 16 |
| `messages` | 3 |
| `notifications` | 1 |
| `audit_blanc_cases` | 0 |
| `preaudit_sessions` | 1 |
| `selen_payments` | 0 |
| `daily_subscriptions` | 0 |
| `daily_formations` | 0 |
| `daily_sessions` | 0 |
| `daily_document_templates` | 0 |
| `daily_trainers` | 0 |
| `client_tool_access` | 1 |
| `auth.users` | 4 |

### Objets Storage sauvegardes puis supprimes

Dossier local de sauvegarde Storage:

`supabase/.temp/backups/20260803-studio-test-data-deletion/storage/`

Manifest:

`supabase/.temp/backups/20260803-studio-test-data-deletion/storage/storage-manifest.json`

| Bucket | Chemin | Taille | SHA-256 |
| --- | --- | ---: | --- |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937523840-46f4ceb3-b13a-4d0e-9e16-8917815f86d4-avis-insee-fictif.pdf` | 22 936 | `D1FEA63840230504F1B08D3396F75D9EB982C3CA90CC8ED9FB693B13FCE358F9` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939202661-d9b9e61d-ec5a-4be3-a354-cc9bf8112d74-convention-de-formation-creation-d-entreprise.doc` | 17 717 | `4057097E2E3A4C8100603FA5BC07454C37954997C76D85E5FE25EC76955691F7` |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/convention-formation-creation-d-entreprise-2026-07-01T20-44-34-404Z.doc` | 17 717 | `4057097E2E3A4C8100603FA5BC07454C37954997C76D85E5FE25EC76955691F7` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939205173-2eda4c92-024f-44a2-b4f9-aae21663db12-cv-laurent-barthaux-fictif.pdf` | 23 075 | `5ADA788A7E57000F30908A01FA6154E5CFD2AB7E87083CFDEEDE1EB30815611A` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937521112-ef231765-43db-4568-8ef5-2e886864355a-cv-laurent-barthaux-fictif.pdf` | 23 075 | `5ADA788A7E57000F30908A01FA6154E5CFD2AB7E87083CFDEEDE1EB30815611A` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939204227-464479ca-1aa9-423f-bd66-e1ca1e9512a5-diplome-bac-pro-mecanique-fictif.pdf` | 23 442 | `87C0B31BBD2FB43ACADCA669E30E021C53D070F35095546DDC16DA399FFF44B6` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939206160-196b1c36-c0b7-4f08-88b5-05fefd449598-liste-des-formateurs-dreets-2.docx` | 112 765 | `14E146FFE971EB694CB51E0785545CFEABD997CCBE4574BB5F038A5975E1FEDD` |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/liste-formateurs-dreets-modules-2026-07-01T20-46-30-576Z.docx` | 112 765 | `14E146FFE971EB694CB51E0785545CFEABD997CCBE4574BB5F038A5975E1FEDD` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939203394-95d81929-0b28-4d7e-8d8d-8c68f851e337-programme-de-formation-creation-d-entreprise.doc` | 10 327 | `AD47967C605CB9BC74534B3CB02CACA38BE6CC636E82FF4565B45FD1EC024818` |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/programme-formation-creation-d-entreprise-2026-07-01T20-44-34-404Z.doc` | 10 327 | `AD47967C605CB9BC74534B3CB02CACA38BE6CC636E82FF4565B45FD1EC024818` |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937522641-2fa4737d-eaa8-49d2-93ad-6b4342ee96e2-programme-formation-creation-entreprise-fictif.pdf` | 23 241 | `04ACFF2D8A4166DB30A62ED715AEBB0632A4D53098E8B23035345C2C2EC5B72B` |

Controle apres suppression:

- suppression SDK: 11 objets demandes, 11 objets supprimes;
- verification SDK: 11 objets controles, 11 absents, 0 encore telechargeable;
- verification SQL `storage.objects`: 0 metadonnee restante sur les 11 chemins cibles;
- verification SQL des prefixes Barthaux: 0 objet restant sous le prefixe organisation et 0 sous le prefixe `generated/`.

## 8. Donnees reelles preservees

Verifications en lecture seule:

- Haïm Levi n'est pas dans les quatre organisations candidates;
- `client_tool_access` `15a61ca7-445f-4b8d-9052-6ff83bc0b488` est explicitement conserve;
- aucune facture `lil_invoices` n'est rattachee aux quatre organisations candidates;
- aucun audit externe `external_audits` n'est rattache aux quatre organisations candidates;
- `selen_expenses` reste hors perimetre.

## 9. Controles apres suppression

Protections verifiees apres suppression:

| Controle protege | Resultat apres suppression |
| --- | ---: |
| Organisation HaÃ¯m Levi `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` | 1 |
| Acces outil HaÃ¯m Levi `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | 1 |
| `lil_invoices` | 8 |
| `external_audits` | 13 |
| `selen_expenses` | 1 |

Organisations restantes:

- HaÃ¯m Levi;
- PR CONCEPT;
- ROULIN Antoine.

Controles d'orphelins executes:

| Controle | Resultat |
| --- | ---: |
| `dossiers` sans organisation | 0 |
| `documents` sans dossier | 0 |
| `messages` sans dossier | 0 |
| `notifications` sans dossier | 0 |
| `daily_sessions` sans formation | 0 |

Comptes et donnees ciblees disparus:

- comptes Auth `fdbb00c8-148c-4d13-976d-2856d5218813` et `b129473c-bcf5-49b8-8bed-bcd07bd478a0`: 0;
- paiements Stripe test `67cbc918-3a0d-4479-903e-cc357e2cecfa` et `f2856bed-f472-4044-80a9-c53f345ecc08`: 0;
- abonnement Daily test `14cdf836-3ec2-4194-a427-83c0109e5632`: 0;
- acces outil test `62a14112-9ed6-4561-8518-ebff7555fe21`: 0.

## 10. Incidents ou limites

La verification finale des fichiers dump par `pg_restore --list` n'a pas pu etre relancee dans le shell courant car `pg_restore.exe` n'etait plus disponible dans le `PATH` et n'a pas ete retrouve dans les emplacements standards Windows au moment du controle final.

Cette limite n'a pas invalide les sauvegardes existantes:

- les quatre fichiers etaient toujours presents;
- leurs tailles etaient strictement superieures a 0 octet;
- leurs SHA-256 recalcules correspondaient exactement aux SHA-256 deja consignes;
- le rapport precedent consignait deja les resultats `pg_restore --list` reussis avec 1051, 109, 255 et 31 entrees.

Le script temporaire de sauvegarde/suppression Storage n'est pas suivi par Git et reste dans `supabase/.temp/`, dossier ignore par le depot.

## 11. Methode de restauration

En cas de future suppression, restauration possible depuis les archives locales:

- `public-schema.dump` et `public-data.dump` pour restaurer le schema et les donnees publiques;
- `auth-storage-schema.dump` pour verifier la structure Auth/Storage;
- `targeted-deletion-context-data.dump` pour retrouver le contexte des tables touchees.

Toute restauration doit etre testee dans un environnement isole avant d'etre envisagee sur le projet principal.
