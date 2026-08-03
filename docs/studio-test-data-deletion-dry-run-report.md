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
