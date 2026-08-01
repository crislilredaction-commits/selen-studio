# Audit des compteurs de ventes et donnees commerciales de test

Date: 2026-08-01  
Branche: `audit/studio-sales-counters-test-data`  
SHA de depart: `89e9e4981c03d6c714cbf57a4d5ea93207d9599d`  
Projet Supabase lu: `pjbilmywwkpghhayftph`  

## 1. Resume

Cette mission distingue les donnees commerciales fictives des donnees reelles a conserver. Aucune ligne distante n'a ete modifiee, aucune migration n'a ete creee et aucun paiement, email, webhook ou appel externe n'a ete declenche.

Correction locale appliquee:

- Les compteurs `CA Selen` de `Gestion Lil` n'incluent plus les paiements Stripe test presents dans `selen_payments`.
- Les compteurs commerciaux Selen comptent uniquement les paiements payes et explicitement live (`stripe_session_id` commencant par `cs_live_` ou metadata `environment/mode = live`).
- Les paiements test ou ambigus sont conserves en base mais exclus de l'affichage commercial.
- Les libelles precisent maintenant `CA commercial Selen` pour eviter la confusion avec les factures d'audit reelles.

Ce qui reste conserve:

- `lil_invoices`: 8 factures, 310000 cents, considerees reelles par defaut.
- `external_audits`: 13 audits, consideres reels par defaut.
- `selen_expenses`: 1 depense, 4000 cents, conservee par defaut.

## 2. Compteurs analyses

| Compteur visible | Route | Composant/fichier | Source | Formule avant | Valeur avant | Formule apres | Valeur attendue |
| --- | --- | --- | --- | --- | ---: | --- | ---: |
| `CA mois` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` | paiements `paid/succeeded/complete/completed` du mois | 0,00 EUR | paiements payes explicitement live du mois | 0,00 EUR |
| `Net mois` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` + `selen_expenses` | CA mois - charges mois | 0,00 EUR | net commercial seulement si CA live > 0 | 0,00 EUR |
| `CA du mois` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` | somme payee mois | 0,00 EUR | somme live mois | 0,00 EUR |
| `CA de l'annee` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` | somme payee annee | 479,00 EUR | somme live annee | 0,00 EUR |
| `Paiements mois` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` | nombre paiements payes mois | 0 | nombre paiements live mois | 0 |
| `Paiements annee` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` | nombre paiements payes annee | 2 | nombre paiements live annee | 0 |
| `Net annee` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_payments` + `selen_expenses` | CA annee - charges annee | 439,00 EUR | net commercial seulement si CA live > 0 | 0,00 EUR |
| `Charges` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `selen_expenses` | somme charges mois + liste | 0,00 EUR mois, 40,00 EUR annee | conserve | conserve |
| `Audits a venir` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `external_audits` | audits `planned/confirmed`, non archives, futurs | activite audit | conserve | conserve |
| `Plans a envoyer` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `external_audits.metadata.plan_audit_sent` | audits actifs sans plan envoye | activite audit | conserve | conserve |
| `Remboursements` | `/agent/gestion` | `src/app/agent/gestion/page.tsx` | `support_refund_requests` | statuts `to_process/processed` | 0,00 EUR | conserve | 0,00 EUR |
| `Acces admin - Gestion Lil` | `/agent` | `src/app/agent/page.tsx` | valeur locale | description mentionnait `CA Selen` | libelle ambigu | description conservee hors compteur | pas de montant |

## 3. Sources et filtres identifies

### `Gestion Lil`

Fichier: `src/app/agent/gestion/page.tsx`

Sources lues:

- `support_refund_requests`: remboursements admin.
- `external_audits`: audits externes et plans d'audit.
- `selen_payments`: CA commercial Selen.
- `selen_expenses`: charges Lil.

Avant correction, `isPaid()` acceptait `paid`, `succeeded`, `complete`, `completed`, sans distinguer test/live. Les deux lignes `selen_payments` existantes etaient donc comptees dans le CA annuel.

Apres correction, `isLiveCommercialPayment()` impose:

- statut paye;
- `stripe_session_id` commencant par `cs_live_` ou metadata `environment/mode = live`.

Les lignes test restent lisibles et conserves, mais ne gonflent plus les compteurs commerciaux.

### Tableau de bord principal Studio

Fichier: `src/app/agent/page.tsx`

Compteurs analyses:

- nouveaux messages;
- dossiers a traiter;
- audits blancs Review;
- clients a relancer;
- support;
- remboursements a traiter.

Conclusion: aucun compteur de chiffre d'affaires ou vente directe n'est calcule dans le tableau de bord principal. La carte `Gestion Lil` mentionne le CA Selen dans sa description, mais sans montant.

## 4. Donnees reelles a conserver

| Table | Lignes | Montant | Classification | Decision |
| --- | ---: | ---: | --- | --- |
| `lil_invoices` | 8 | 310000 cents | REEL - A CONSERVER | Ne pas supprimer |
| `external_audits` | 13 | n/a | REEL PAR DEFAUT - A CONSERVER | Ne pas supprimer sans validation explicite |
| `selen_expenses` | 1 | 4000 cents | REEL PAR DEFAUT - A CONSERVER | Ne pas supprimer sans validation explicite |
| `discount_codes` | 1 | n/a | CONFIGURATION - A CONSERVER | Ne pas supprimer sans validation |
| `appointment_requests` | 7 | n/a | AMBIGU - A INVESTIGUER | Ne pas supprimer sans validation |

Precision metier:

- Les factures d'audit de `lil_invoices` ne doivent pas etre considerees comme ventes Selen fictives.
- Les audits externes peuvent etre reels et doivent rester dans les ecrans de gestion audit/facturation.
- La depense existante n'a pas ete modifiee.

## 5. Donnees de test candidates

| Table | Identifiant | Type | Montant | Client masque | Preuve | Classification | Effet sur compteurs |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `selen_payments` | `67cbc918-3a0d-4479-903e-cc357e2cecfa` | `prepa_nda` | 39000 | `ba***@gmail.com` | `stripe_session_id` de type `cs_test_` | TEST - A SUPPRIMER APRES VALIDATION | Gonflait le CA annuel |
| `selen_payments` | `f2856bed-f472-4044-80a9-c53f345ecc08` | `selen_daily` | 8900 | `ba***@gmail.com` | `stripe_session_id` de type `cs_test_` | TEST - A SUPPRIMER APRES VALIDATION | Gonflait le CA annuel et Daily |
| `client_tool_access` | `62a14112-9ed6-4561-8518-ebff7555fe21` | `preaudit_qualiopi` | 9900 | `li***@outlook.fr` | checkout Stripe test | TEST - A SUPPRIMER APRES VALIDATION | Peut representer un acces outil fictif |
| `client_tool_access` | `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | `preaudit_qualiopi` | 0 | `ye***@gmail.com` | aucun checkout Stripe | AMBIGU - A INVESTIGUER | Acces manuel ou test |
| `daily_subscriptions` | `14cdf836-3ec2-4194-a427-83c0109e5632` | tier `base` | 8900 mensuel | non rattache a `agent_profiles` | checkout Stripe test, periode 2026-07-05 -> 2027-07-05 | TEST - A SUPPRIMER APRES VALIDATION | Abonnement Daily fictif |

## 6. Faux clients candidats et dependances commerciales

| Organisation | Identifiant | Email masque | Statut | Dossiers | Documents | Messages | Notifications | Paiements | Acces outils | Factures | Classification |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Selen Formation | `0df0dc02-40c3-431c-a19e-ac998e90bf37` | `li***@outlook.fr` | active | 3 | 5 | 12 | 14 | 0 | 1 | 0 | AMBIGU / probable test |
| Atelier Horizon | `2e9b095a-5cca-47e9-b337-e59647fd0da6` | `bo***@horizon.test` | archived | 3 | 0 | 0 | 0 | 0 | 0 | 0 | TEST probable |
| Didascalil | `59e2d76d-556d-4ce8-8810-6172293d1612` | `co***@gmail.com` | archived | 1 | 0 | 0 | 0 | 0 | 0 | 0 | AMBIGU |
| Haim Levi | `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` | `ye***@gmail.com` | active | 0 | 0 | 0 | 0 | 0 | 1 | 0 | A CONFIRMER |
| barthauxauto | `f6c5f386-9513-4a0a-b457-43cd5cf71693` | `ba***@gmail.com` | active | 2 | 11 | 17 | 6 | 2 | 0 | 0 | TEST probable, mais validation requise |

Dependances a verifier avant suppression future:

- `dossiers`
- `documents`
- fichiers Storage references par `documents.storage_path`
- `messages`
- `notifications`
- `nda_variables`
- `selen_payments`
- `client_tool_access`
- `daily_subscriptions`
- utilisateurs Auth eventuellement associes

## 7. Vues, fonctions et agregats SQL

Recherche catalogue effectuee sur les vues et fonctions publiques liees a paiement, vente, facture, abonnement, audit ou Daily.

Resultat:

- Aucune vue commerciale utilisee comme source de compteur n'a ete identifiee dans le code Studio analyse.
- Fonctions notables sans correction dans cette mission:
  - `daily_annual_learner_count(p_user_id uuid)`
  - `daily_prepare_upper_tier_if_needed(p_user_id uuid)`
  - `daily_refresh_subscription_period(p_user_id uuid)`
  - `next_lil_invoice_number()`
  - fonctions preaudit/audit sans lien direct avec le CA commercial Selen.

Aucune fonction SQL n'a ete modifiee.

## 8. Corrections locales realisees

Fichier modifie:

- `src/app/agent/gestion/page.tsx`

Changements:

- Ajout de `isLiveCommercialPayment(row)`.
- Filtrage des paiements commerciaux sur `cs_live_` ou metadata live.
- Exclusion des paiements test ou ambigus du CA Selen.
- Renommage des libelles en `CA commercial Selen`, `CA Selen mois`, `Net Selen mois`.
- Ajout d'un message indiquant que les paiements test ou ambigus sont exclus.

Fichier de documentation cree:

- `docs/studio-sales-counters-and-test-data-audit.md`

## 9. Suppressions futures proposees

Aucune suppression n'a ete executee.

Liste a soumettre a Lil identifiant par identifiant:

| Ordre indicatif | Table | Identifiant | Action future possible | Condition |
| ---: | --- | --- | --- | --- |
| 1 | `selen_payments` | `67cbc918-3a0d-4479-903e-cc357e2cecfa` | suppression ciblee | validation Lil + sauvegardes |
| 2 | `selen_payments` | `f2856bed-f472-4044-80a9-c53f345ecc08` | suppression ciblee | validation Lil + sauvegardes |
| 3 | `daily_subscriptions` | `14cdf836-3ec2-4194-a427-83c0109e5632` | suppression ciblee | validation Lil + verification dependances Daily |
| 4 | `client_tool_access` | `62a14112-9ed6-4561-8518-ebff7555fe21` | suppression ciblee | validation Lil |
| 5 | `client_tool_access` | `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | investiguer puis suppression possible | validation Lil |
| 6 | organisations candidates | voir section 6 | suppression avec dependances | validation Lil ligne par ligne |

Plan securise obligatoire:

1. Quatre sauvegardes PostgreSQL natives.
2. Export cible des lignes candidates.
3. Validation de Lil.
4. Dry-run transactionnel avec `ROLLBACK`.
5. Controle des cles et dependances.
6. Controle Storage.
7. Controle Auth.
8. Suppression ciblee.
9. Comptages avant/apres.
10. Restauration testee.

## 10. Risques

- Un paiement manuel reel sans `cs_live_` ou metadata live ne serait pas compte. C'est volontaire pour eviter de compter des lignes ambigues comme reelles.
- Les donnees reelles d'audit et de facturation doivent rester separees du CA commercial Selen.
- Les futures suppressions doivent tenir compte des documents Storage et des eventuels comptes Auth.
- Les tables publiques historiques avec RLS desactivee restent un sujet de securite separe, hors correction dans cette mission.

## 11. Validations

Resultats:

- `git diff --check`: OK, avertissement CRLF Windows seulement.
- lint cible (`src/app/agent/gestion/page.tsx`): OK.
- lint global Studio: OK, 0 erreur, 18 avertissements preexistants.
- TypeScript (`npx.cmd tsc --noEmit`): OK.
- build Studio (`npm.cmd run build`): OK apres chargement local des variables ignorees dans l'environnement du processus uniquement, sans affichage ni copie de secret.
- tests cibles: aucun test existant specifique aux compteurs commerciaux n'a ete trouve.
- verification de scope: aucun fichier Daily, Forge, Telegram, configuration Stripe, facture reelle, audit reel ou depense reelle n'a ete modifie.

## 12. Decisions a prendre par Lil

- Confirmer la suppression future des deux lignes `selen_payments` test.
- Confirmer la suppression future ou la conservation de l'abonnement `daily_subscriptions` test.
- Confirmer le sort des deux lignes `client_tool_access`.
- Confirmer les faux clients a supprimer: Selen Formation, Atelier Horizon, Didascalil, Haim Levi, barthauxauto.
- Confirmer que les factures `lil_invoices`, audits `external_audits` et depenses `selen_expenses` restent hors suppression.
