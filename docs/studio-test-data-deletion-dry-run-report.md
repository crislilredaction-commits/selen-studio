# Dry-run de suppression controlee des faux clients Studio

Date: 2026-08-03  
Projet Supabase: Selen Studio `pjbilmywwkpghhayftph`  
Branche: `chore/studio-cleanup-consolidation`  
Mode: simulation transactionnelle avec `ROLLBACK` obligatoire

## 1. Statut

La suppression reelle n'a pas ete effectuee.

Operations executees:

- simulations PostgreSQL avec `BEGIN` puis `ROLLBACK`;
- controles de restauration apres rollback;
- requetes de lecture sur le perimetre et les protections.

Operations non executees:

- aucune suppression reelle;
- aucune migration;
- aucune modification Auth persistante;
- aucun changement distant persistant;
- aucun deploiement.

## 2. Perimetre exact simule

### Inclus

Organisations:

| Candidat | ID |
| --- | --- |
| Atelier Horizon | `2e9b095a-5cca-47e9-b337-e59647fd0da6` |
| Didascalil | `59e2d76d-556d-4ce8-8810-6172293d1612` |
| barthauxauto / Barthaux Auto | `f6c5f386-9513-4a0a-b457-43cd5cf71693` |

Compte Auth:

| Candidat | Auth ID |
| --- | --- |
| barthauxauto / Barthaux Auto | `fdbb00c8-148c-4d13-976d-2856d5218813` |

Donnees commerciales:

| Table | ID | Note |
| --- | --- | --- |
| `selen_payments` | `67cbc918-3a0d-4479-903e-cc357e2cecfa` | paiement Stripe test |
| `selen_payments` | `f2856bed-f472-4044-80a9-c53f345ecc08` | paiement Stripe test |
| `daily_subscriptions` | `14cdf836-3ec2-4194-a427-83c0109e5632` | supprimee par cascade Auth Barthaux dans la simulation |

Donnees Daily Barthaux Auto:

| Table | ID | Note |
| --- | --- | --- |
| `daily_formations` | `af57d09c-eebf-4268-9fe6-1b0751785968` | formation draft `La mecanique facile` |
| `daily_sessions` | `413d01e2-9f38-422e-b614-90c510a80a03` | session liee a la formation |
| `daily_document_templates` | `c9ea51c3-463a-48f4-b634-095045ccc0a1` | modele convocation archive |
| `daily_document_templates` | `892401be-b843-4041-8347-bd499c909e90` | modele convention archive |
| `daily_document_templates` | `4f682d23-88c7-4743-8f79-ba73edde2983` | modele politique handicap archive |
| `daily_trainers` | `dd63b3a9-326c-40ae-818d-14f86f4f89ba` | formateur Barthaux |
| `daily_onboarding` | 1 ligne | ligne user_id Barthaux |

### Exclus et proteges

| Element | Controle attendu |
| --- | --- |
| Haïm Levi | organisation et toutes dependances conservees |
| `client_tool_access` Haïm Levi | `15a61ca7-445f-4b8d-9052-6ff83bc0b488` conserve |
| Selen Formation | organisation, Auth, `selen_client_*`, `client_tool_access` et toutes dependances conservees |
| `lil_invoices` | 8 lignes conservees |
| `external_audits` | 13 lignes conservees |
| `selen_expenses` | 1 ligne conservee |

## 3. Ordre de suppression utilise en simulation

L'ordre simule respecte les dependances connues:

1. compte Auth Barthaux Auto, pour observer les cascades Daily;
2. paiements Stripe test exacts;
3. notifications de dossiers cibles;
4. messages de dossiers cibles;
5. affectations de dossiers;
6. versions programme de dossiers;
7. analyses IA programme de dossiers;
8. variables NDA;
9. cas audit blanc cible, attendu a 0 pour ce perimetre;
10. documents;
11. dossiers;
12. organisations.

Storage:

- 11 chemins Storage cibles et 11 objets Storage correspondants ont ete identifies en lecture seule.
- L'outil Supabase MCP a refuse la simulation `DELETE FROM storage.objects` avec `INVALID_ARGUMENT`, meme sous rollback.
- Aucun contournement n'a ete tente.
- La suppression Storage devra donc etre validee par un mecanisme separe avant suppression reelle si l'objectif est de ne laisser aucun objet Storage orphelin.

## 4. Simulation Auth + Daily

La suppression du compte Auth Barthaux Auto a ete executee dans une transaction puis rollbackee.

Resultat pendant transaction:

| Table | Avant | Apres simulation | Effet |
| --- | ---: | ---: | ---: |
| `auth.users` Barthaux | 1 | 0 | 1 compte supprime dans la transaction |
| `daily_subscriptions` | 1 | 0 | cascade OK |
| `daily_formations` | 1 | 0 | cascade OK |
| `daily_sessions` | 1 | 0 | cascade OK |
| `daily_document_templates` | 3 | 0 | cascade OK |
| `daily_trainers` | 1 | 0 | cascade OK |
| `daily_onboarding` | 1 | 0 | cascade OK |

Point technique:

- Dans un CTE unique, le compteur `auth.users` lisait encore le snapshot initial; une verification separee dans la meme transaction a confirme `auth.users = 0` apres le `DELETE`.
- Le `ROLLBACK` a ensuite restaure le compte Auth et toutes les lignes Daily.

## 5. Simulation paiements test

Les deux paiements Stripe test ont ete supprimes dans une transaction puis rollbackes.

| Table | Avant | Apres simulation | Effet |
| --- | ---: | ---: | ---: |
| `selen_payments` exacts | 2 | 0 | 2 lignes supprimees dans la transaction |

## 6. Simulation dependances publiques des organisations

Perimetre: Atelier Horizon, Didascalil, barthauxauto.  
Selen Formation est exclue.

| Table | Avant | Apres simulation | Effet |
| --- | ---: | ---: | ---: |
| `organisations` | 3 | 0 | 3 organisations supprimees dans la transaction |
| `dossiers` | 6 | 0 | 6 dossiers supprimes |
| `documents` | 11 | 0 | 11 documents supprimes |
| `messages` | 17 | 0 | 17 messages supprimes |
| `notifications` | 6 | 0 | 6 notifications supprimees |
| `nda_variables` | 1 | 0 | 1 ligne supprimee |
| `dossier_assignments` | 2 | 0 | 2 lignes supprimees |
| `dossier_program_versions` | 2 | 0 | 2 lignes supprimees |
| `program_ai_analyses` | 3 | 0 | 3 lignes supprimees |
| `audit_blanc_cases` | 0 | 0 | aucun cas dans le perimetre, Selen Formation exclue |

## 7. Simulation combinee Auth + public + paiements, hors Storage SQL

Une simulation combinee a ete executee avec rollback:

- suppression Auth Barthaux;
- suppression des paiements test;
- suppression des dependances publiques;
- suppression des trois organisations autorisees.

Resultat pendant transaction:

| Cible | Apres simulation |
| --- | ---: |
| Auth Barthaux | 0 |
| Organisations cibles | 0 |
| Paiements test | 0 |
| `daily_subscriptions` Barthaux | 0 |
| `daily_formations` Barthaux | 0 |
| `daily_sessions` Barthaux | 0 |

Protections verifiees pendant la simulation:

| Protection | Resultat |
| --- | ---: |
| Organisation Haïm Levi | 1 |
| Acces outil Haïm Levi | 1 |
| Organisation Selen Formation | 1 |
| Auth Selen Formation | 1 |
| `selen_client_profiles` Selen Formation | 1 |
| `lil_invoices` | 8 |
| `external_audits` | 13 |
| `selen_expenses` | 1 |

## 8. Verification orphelins pendant simulation

Resultat apres simulation combinee, avant rollback:

| Controle | Orphelins |
| --- | ---: |
| dossiers sans organisation | 0 |
| documents sans dossier | 0 |
| documents sans organisation | 0 |
| messages sans dossier | 0 |
| notifications sans dossier | 0 |
| sessions Daily sans formation | 0 |

Limite:

- les objets Storage n'ont pas ete supprimes dans la simulation combinee car le `DELETE` sur `storage.objects` a ete refuse par l'outil; ils restent donc a traiter explicitement dans une procedure separee.

## 9. Verification du rollback

Apres rollback, les donnees cibles ont ete restaurees:

| Controle apres rollback | Resultat |
| --- | ---: |
| Auth Barthaux restaure | 1 |
| Organisations cibles restaurees | 3 |
| Paiements test restaures | 2 |
| Abonnement Daily test restaure | 1 |
| Formation Daily Barthaux restauree | 1 |
| Session Daily Barthaux restauree | 1 |
| Modeles Daily Barthaux restaures | 3 |
| Formateur Daily Barthaux restaure | 1 |
| Acces outil Haïm Levi preserve | 1 |
| Selen Formation preservee | 1 |

## 10. Ecarts ou dependances imprevues

Ecart identifie:

- la simulation SQL de suppression Storage n'a pas pu etre executee via MCP Supabase (`INVALID_ARGUMENT` sur `DELETE FROM storage.objects`), meme dans une transaction rollbackee.

Dependance non problematique:

- la cascade Auth Barthaux supprime correctement les lignes Daily dans la transaction;
- la contrainte `daily_sessions.formation_id` en `RESTRICT` ne bloque pas la cascade Auth;
- aucune ligne Selen Formation ou Haïm Levi n'est touchee par le perimetre public/Daily simule;
- aucun lien vers `lil_invoices`, `external_audits` ou `selen_expenses` n'est modifie.

## 11. Conclusion d'autorisation

Conclusion relationnelle PostgreSQL:

- la suppression reelle du perimetre base de donnees, hors Storage, peut etre autorisee sans risque identifie dans la simulation;
- les protections Haïm Levi, Selen Formation, factures, audits externes et depense restent intactes;
- les cascades Auth/Daily Barthaux fonctionnent comme attendu;
- aucun orphelin relationnel n'a ete detecte pendant la simulation combinee.

Conclusion globale incluant Storage:

- la suppression complete ne doit pas encore etre executee tant que la suppression des 11 objets Storage n'a pas une procedure validee;
- le risque restant est de supprimer les documents SQL sans supprimer les objets Storage correspondants, ce qui laisserait des fichiers orphelins.

Recommandation:

Lil, le nettoyage relationnel est pret, mais je te conseille de valider une procedure Storage explicite avant la suppression reelle. Sans cette etape, on peut nettoyer la base proprement mais laisser 11 objets Storage inutiles.

## 12. Decision humaine requise

Avant suppression reelle, Lil doit confirmer:

1. autorisation de supprimer le bloc Barthaux complet en base, y compris Auth + Daily + paiements + organisation;
2. autorisation de supprimer Atelier Horizon et Didascalil;
3. choix pour Storage:
   - inclure les 11 objets Storage dans la suppression reelle avec une procedure separee;
   - ou conserver temporairement les objets Storage et accepter un reliquat a nettoyer plus tard.

Tant que cette decision Storage n'est pas prise, aucune suppression reelle ne doit etre lancee.

## 13. Complement du 2026-08-03 — Selen Formation

### 13.1 Pourquoi Selen Formation a ete exclue du dry-run initial

Selen Formation a ete exclue du dry-run initial pour une raison de **garde-fou metier**, pas par omission.

Avant le premier dry-run, la decision humaine alors active disait explicitement:

- Selen Formation doit etre entierement exclue de cette suppression pour le moment;
- ne pas supprimer son compte Auth;
- ne pas supprimer ses lignes `selen_client_profiles`;
- ne pas supprimer ses lignes `selen_client_tool_access`;
- ne supprimer aucune autre donnee qui lui est reliee.

L'exclusion venait donc d'une ambiguite metier levee provisoirement par prudence: les lignes `selen_client_*` n'etaient pas dans le perimetre initialement valide, et le compte Auth portait plus qu'une simple organisation. Le dry-run initial a conserve Selen Formation volontairement pour eviter un elargissement silencieux du perimetre.

Conclusion:

- ambiguite metier: oui, au moment du dry-run initial;
- dependance reelle bloquante: pas de facture/audit externe/depense, mais des dependances fonctionnelles nombreuses;
- garde-fou: oui;
- omission: non.

### 13.2 Inventaire exact de Selen Formation

Organisation:

| Element | Valeur |
| --- | --- |
| Organisation | Selen Formation |
| ID organisation | `0df0dc02-40c3-431c-a19e-ac998e90bf37` |
| Statut | active |
| Email masque | `li***@outlook.fr` |
| Creation | 2026-03-12 18:09 UTC |

Compte Auth:

| Element | Valeur |
| --- | --- |
| Auth ID | `b129473c-bcf5-49b8-8bed-bcd07bd478a0` |
| Email masque | `li***@outlook.fr` |
| Creation | 2026-05-04 10:23 UTC |
| Derniere connexion connue | 2026-07-07 21:07 UTC |

Profils et acces:

| Table | ID | Detail | Statut |
| --- | --- | --- | --- |
| `selen_client_profiles` | `1d3d90be-df7b-459b-bdb0-5baed07f3d02` | `Client Test`, organisation `Organisme Test` | n/a |
| `selen_client_tool_access` | `dc42be10-1fe1-441c-9091-0633edf291d9` | `preaudit-qualiopi`, acces `limited` | active |
| `client_tool_access` | `62a14112-9ed6-4561-8518-ebff7555fe21` | `preaudit_qualiopi` | active |

Dossiers:

| Dossier | ID | Statut |
| --- | --- | --- |
| Demande NDA initiale | `13c24e5b-8214-447e-a302-b767943247fe` | waiting_client |
| Mise en conformite 2026 | `059b4395-e8f8-4942-87cb-c0314d43a192` | in_progress |
| Selen Review - Audit blanc Qualiopi | `33536efc-7a65-4f1e-a5fc-6ac878a98f0c` | in_progress |

Comptages de dependances:

| Table / dependance | Volume |
| --- | ---: |
| `documents` | 5 |
| `storage.objects` rattaches aux documents | 5 |
| `messages` | 12 |
| `notifications` | 14 |
| `dossier_assignments` | 1 |
| `dossier_program_versions` | 4 |
| `program_ai_analyses` | 4 |
| `nda_variables` | 1 |
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
| `daily_formations` | 0 |
| `daily_sessions` | 0 |
| `daily_document_templates` | 0 |
| `daily_trainers` | 0 |
| `daily_subscriptions` | 0 |

Protections verifiees:

| Controle | Resultat |
| --- | ---: |
| Factures `lil_invoices` liees a Selen Formation | 0 |
| Audits externes `external_audits` lies a Selen Formation | 0 |
| Depenses `selen_expenses` liees a Selen Formation | 0 |
| Chevauchement organisation Haïm Levi | 0 |

### 13.3 Dry-run PostgreSQL separe Selen Formation

Un dry-run separe a ete execute avec `BEGIN` puis `ROLLBACK`.

Perimetre simule:

- compte Auth Selen Formation;
- organisation Selen Formation;
- `selen_client_profiles`;
- `selen_client_tool_access`;
- `client_tool_access` legacy `62a14112-9ed6-4561-8518-ebff7555fe21`;
- dossiers, documents, messages, notifications;
- dependances dossier/programme/NDA;
- dependances preaudit et audit blanc liees par cascade ou suppression explicite.

Resultats pendant la transaction:

| Table / cible | Avant | Pendant simulation |
| --- | ---: | ---: |
| `auth.users` Selen Formation | 1 | 0 |
| organisation Selen Formation | 1 | 0 |
| `selen_client_profiles` | 1 | 0 |
| `selen_client_tool_access` | 1 | 0 |
| `client_tool_access` legacy | 1 | 0 |
| dossiers | 3 | 0 |
| documents | 5 | 0 |
| messages | 12 | 0 |
| notifications | 14 | 0 |
| preaudit sessions | 1 | 0 |

Dependances comptees avant simulation:

| Table | Avant |
| --- | ---: |
| `dossier_assignments` | 1 |
| `dossier_program_versions` | 4 |
| `program_ai_analyses` | 4 |
| `nda_variables` | 1 |
| `audit_blanc_cases` | 1 |

Protections pendant simulation:

| Protection | Resultat |
| --- | ---: |
| Organisation Haïm Levi | 1 |
| Acces outil Haïm Levi `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | 1 |
| `lil_invoices` | 8 |
| `external_audits` | 13 |
| `selen_expenses` | 1 |

Orphelins pendant simulation:

| Controle | Orphelins |
| --- | ---: |
| dossiers sans organisation | 0 |
| documents sans dossier | 0 |
| messages sans dossier | 0 |
| notifications sans dossier | 0 |

Verification apres `ROLLBACK`:

| Cible | Apres rollback |
| --- | ---: |
| Auth Selen Formation | 1 |
| Organisation Selen Formation | 1 |
| `selen_client_profiles` | 1 |
| `selen_client_tool_access` | 1 |
| `client_tool_access` legacy | 1 |
| dossiers | 3 |
| documents | 5 |
| messages | 12 |
| notifications | 14 |

Conclusion Selen Formation:

- le dry-run relationnel separe est conforme;
- aucune facture reelle, aucun audit externe reel, aucune depense reelle et aucune donnee Haïm Levi ne sont lies;
- Selen Formation peut techniquement entrer dans un futur perimetre de suppression, mais cela requiert une validation humaine explicite car le perimetre inclut `selen_client_profiles`, `selen_client_tool_access`, le compte Auth, un preaudit et un audit blanc complet.

## 14. Complement du 2026-08-03 — inventaire Storage exact

Onze objets Storage ont ete identifies dans le perimetre deja simule Atelier Horizon / Didascalil / Barthaux Auto.

Verification d'appartenance:

| Controle | Resultat |
| --- | ---: |
| Chemins Storage cibles | 11 |
| Chemins Barthaux Auto | 11 |
| Chemins Haïm Levi | 0 |
| Chemins Selen Formation | 0 |

Inventaire:

| Bucket | Chemin | Taille | Organisation | Dossier | Document lie | Motif |
| --- | --- | ---: | --- | --- | --- | --- |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937523840-46f4ceb3-b13a-4d0e-9e16-8917815f86d4-avis-insee-fictif.pdf` | 22 936 | barthauxauto | Prepa NDA - Declaration d'activite | `Avis_INSEE_FICTIF.pdf` (`0fa844ac-275b-40d9-b52d-bc005099cee5`) | document rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939202661-d9b9e61d-ec5a-4be3-a354-cc9bf8112d74-convention-de-formation-creation-d-entreprise.doc` | 17 717 | barthauxauto | Prepa NDA - Declaration d'activite | `Convention de formation - creation d entreprise.doc` (`bd66e7fe-357a-4454-ade3-7fa9642f72e2`) | document rattache a Barthaux Auto test |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/convention-formation-creation-d-entreprise-2026-07-01T20-44-34-404Z.doc` | 17 717 | barthauxauto | Prepa NDA - Declaration d'activite | `Convention de formation - creation d entreprise.doc` (`f3b589ca-7a57-4b65-84e5-d52076e523bf`) | document genere rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939205173-2eda4c92-024f-44a2-b4f9-aae21663db12-cv-laurent-barthaux-fictif.pdf` | 23 075 | barthauxauto | Prepa NDA - Declaration d'activite | `CV_Laurent_Barthaux_FICTIF.pdf` (`f8e85f11-dbca-44e2-847c-11b5d6276fb8`) | document rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937521112-ef231765-43db-4568-8ef5-2e886864355a-cv-laurent-barthaux-fictif.pdf` | 23 075 | barthauxauto | Prepa NDA - Declaration d'activite | `CV_Laurent_Barthaux_FICTIF.pdf` (`bc6c4253-6493-46c4-8439-d97b27d76f2e`) | document rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939204227-464479ca-1aa9-423f-bd66-e1ca1e9512a5-diplome-bac-pro-mecanique-fictif.pdf` | 23 442 | barthauxauto | Prepa NDA - Declaration d'activite | `Diplome_Bac_Pro_Mecanique_FICTIF.pdf` (`ecb286ea-62d0-4622-93c0-8c10382b3fcf`) | document rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939206160-196b1c36-c0b7-4f08-88b5-05fefd449598-liste-des-formateurs-dreets-2.docx` | 112 765 | barthauxauto | Prepa NDA - Declaration d'activite | `Liste des formateurs DREETS (2).docx` (`37e58038-1cf7-4c35-b343-2737f5eb7394`) | document rattache a Barthaux Auto test |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/liste-formateurs-dreets-modules-2026-07-01T20-46-30-576Z.docx` | 112 765 | barthauxauto | Prepa NDA - Declaration d'activite | `Liste des formateurs DREETS.docx` (`1a500af1-80a2-4e94-a8ec-9116532525ad`) | document genere rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/final/1782939203394-95d81929-0b28-4d7e-8d8d-8c68f851e337-programme-de-formation-creation-d-entreprise.doc` | 10 327 | barthauxauto | Prepa NDA - Declaration d'activite | `Programme de formation - creation d entreprise.doc` (`deb95ad4-66a4-42c2-b6e6-85624f3584db`) | document rattache a Barthaux Auto test |
| `documents` | `generated/f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/programme-formation-creation-d-entreprise-2026-07-01T20-44-34-404Z.doc` | 10 327 | barthauxauto | Prepa NDA - Declaration d'activite | `Programme de formation - creation d entreprise.doc` (`0fb7f1e0-87d9-4023-b773-495e5d6f1202`) | document genere rattache a Barthaux Auto test |
| `documents` | `f6c5f386-9513-4a0a-b457-43cd5cf71693/a219f527-9b6b-4115-899c-451afd613c1d/initial/1782937522641-2fa4737d-eaa8-49d2-93ad-6b4342ee96e2-programme-formation-creation-entreprise-fictif.pdf` | 23 241 | barthauxauto | Prepa NDA - Declaration d'activite | `Programme_Formation_Creation_Entreprise_FICTIF.pdf` (`f1a4be37-d0c5-4bb9-bb5e-6b31d4f87862`) | document rattache a Barthaux Auto test |

## 15. Procedure Storage preparee, non executee

La suppression Storage doit utiliser l'API ou le SDK Supabase Storage, jamais un `DELETE` SQL direct sur `storage.objects`.

Procedure proposee pour une mission ulterieure:

1. Charger une cle serveur depuis l'environnement d'execution autorise, sans l'afficher ni l'ecrire dans le rapport.
2. Creer un client Supabase cote serveur uniquement.
3. Pour chaque ligne de l'inventaire:
   - appeler `storage.from(bucket).download(path)`;
   - ecrire le fichier dans un dossier local date hors Git, par exemple `supabase/.temp/backups/<date>/storage/documents/...`;
   - verifier taille locale > 0;
   - calculer SHA-256 local;
   - comparer la taille locale avec `storage.objects.metadata.size` quand disponible;
   - consigner bucket, chemin, taille et SHA-256 dans un manifeste local non secret.
4. Apres sauvegarde complete et validation humaine, appeler `storage.from(bucket).remove([path])` par lots controles.
5. Verifier apres suppression:
   - `storage.from(bucket).list()` ou requete metadata API: objet absent;
   - `storage.objects` ne contient plus la metadata;
   - les documents SQL correspondants ont ete supprimes dans la meme fenetre de nettoyage;
   - aucun objet Haïm Levi, Selen Formation ou client reel n'a ete touche.
6. Conserver le manifeste de sauvegarde dans le rapport final, sans secret.

Controle post-suppression a prevoir:

| Controle | Attendu |
| --- | --- |
| objet physique Storage absent | 11/11 |
| metadata `storage.objects` absente | 11/11 |
| objets Haïm Levi touches | 0 |
| objets Selen Formation touches, sauf si une decision separee l'autorise | 0 |
| objets client reel touches | 0 |
| objets orphelins du bloc supprime | 0 |

## 16. Liste finale exacte des donnees pouvant etre supprimees

### Autorisees par le dry-run deja conforme

- Atelier Horizon:
  - organisation `2e9b095a-5cca-47e9-b337-e59647fd0da6`;
  - dossiers et dependances associees deja simules.
- Didascalil:
  - organisation `59e2d76d-556d-4ce8-8810-6172293d1612`;
  - dossiers et dependances associees deja simules.
- Barthaux Auto:
  - organisation `f6c5f386-9513-4a0a-b457-43cd5cf71693`;
  - Auth `fdbb00c8-148c-4d13-976d-2856d5218813`;
  - Daily: abonnement, formation, session, 3 modeles, formateur, onboarding;
  - 2 paiements Stripe test;
  - documents SQL et 11 objets Storage listes section 14;
  - dossiers, messages, notifications, variables et dependances programme simules.

### Techniquement simulable mais necessite decision humaine separee

- Selen Formation:
  - organisation `0df0dc02-40c3-431c-a19e-ac998e90bf37`;
  - Auth `b129473c-bcf5-49b8-8bed-bcd07bd478a0`;
  - `selen_client_profiles` `1d3d90be-df7b-459b-bdb0-5baed07f3d02`;
  - `selen_client_tool_access` `dc42be10-1fe1-441c-9091-0633edf291d9`;
  - `client_tool_access` `62a14112-9ed6-4561-8518-ebff7555fe21`;
  - dossiers, documents, 5 objets Storage, messages, notifications, preaudit et audit blanc.

### Toujours protegees

- Haïm Levi et toutes ses dependances;
- `client_tool_access` `15a61ca7-445f-4b8d-9052-6ff83bc0b488`;
- 8 `lil_invoices`;
- 13 `external_audits`;
- 1 `selen_expenses`.

## 17. Conclusion mise a jour

Le nettoyage relationnel Atelier Horizon + Didascalil + Barthaux Auto reste conforme.

Selen Formation a ete exclue initialement par garde-fou metier, pas par omission. Son dry-run separe est techniquement conforme, mais son inclusion dans une suppression reelle doit etre revalidee explicitement, car elle implique un compte Auth, `selen_client_*`, un acces outil legacy, un preaudit et un audit blanc complet.

Les objets Storage du perimetre deja simule sont maintenant inventories: 11 objets, tous rattaches a Barthaux Auto. Leur suppression doit passer par l'API/SDK Storage avec sauvegarde locale prealable; aucune suppression Storage ne doit etre faite par SQL direct.
