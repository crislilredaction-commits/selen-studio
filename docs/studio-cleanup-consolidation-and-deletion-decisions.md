# Consolidation du menage Studio et decisions de suppression

Date de revue: 2026-08-01  
Branche: `chore/studio-cleanup-consolidation`  
Base: `origin/main` `89e9e4981c03d6c714cbf57a4d5ea93207d9599d`  
Projet audite: Selen Studio

## 1. Perimetre

Cette consolidation integre deux audits locaux deja produits:

| Travail | Commit source | Objet |
| --- | --- | --- |
| Navigation et menage UI Studio | `e321f7ffdc2bcb8d36980b29278c7305e6ca5fc8` | Forge retiree de la navigation principale, messagerie remise en navigation principale, acces Forge deplace dans Gestion Lil, rapport d'audit navigation/donnees |
| Compteurs de ventes et donnees commerciales test | `28ab0fa5ba224c4ddb6bcc9d8e91ccf801d01a61` | CA commercial Selen corrige, paiements Stripe test ou ambigus exclus, rapport d'audit des lignes candidates |

Aucune suppression distante, aucune migration et aucune modification Supabase n'ont ete faites pendant cette mission.

## 2. Integration Git

Methode: creation d'une branche propre depuis `origin/main`, puis cherry-pick sequentiel des deux commits d'audit.

Conflits rencontres: aucun conflit Git.  
Point de vigilance verifie: les deux commits modifiaient `src/app/agent/gestion/page.tsx`; l'auto-merge a conserve a la fois l'acces Forge depuis Gestion Lil et la correction du CA commercial Selen.

Fichiers finaux modifies:

- `src/app/agent/gestion/page.tsx`
- `src/components/layout/AgentSidebar.tsx`
- `src/components/layout/AgentSidebarMessaging.tsx`
- `docs/studio-cleanup-navigation-data-and-ui-audit.md`
- `docs/studio-sales-counters-and-test-data-audit.md`
- `docs/studio-cleanup-consolidation-and-deletion-decisions.md`

## 3. Etat final de la navigation

| Element | Etat final | Preuve locale |
| --- | --- | --- |
| Forge dans la navigation principale | Retiree de la barre laterale principale | `AgentSidebar.tsx` ne porte plus l'entree principale Forge |
| Messagerie | Visible dans la navigation principale | `AgentSidebarMessaging.tsx` affiche `Messagerie` |
| Compteur messagerie | Conserve | Le composant messagerie garde ses compteurs et etats |
| Acces Forge | Deplace dans Gestion Lil | `src/app/agent/gestion/page.tsx` affiche une carte `La Forge` |
| Routes Forge | Non supprimees | Aucun fichier route Forge n'est modifie par cette consolidation |
| Alertes Forge | Non ajoutees depuis `main` | Aucune nouvelle route d'alertes n'est introduite par cette consolidation |

## 4. Etat final des compteurs commerciaux

Le compteur `CA commercial Selen` utilise maintenant uniquement les paiements:

- au statut paye (`paid`, `succeeded`, `complete`, `completed`);
- explicitement live par `stripe_session_id` commencant par `cs_live_` ou metadata `environment/mode = live`.

Les paiements Stripe test ou ambigus restent conserves en base, mais ne gonflent plus les indicateurs commerciaux.

| Compteur | Avant | Apres attendu |
| --- | --- | --- |
| CA Selen mois | Paiements payes du mois, sans distinction test/live | Paiements commerciaux live du mois uniquement |
| CA Selen annee | 479,00 EUR car deux paiements `cs_test_` etaient inclus | 0,00 EUR tant qu'aucun paiement live n'existe |
| Paiements annee | 2 paiements test inclus | 0 paiement live |
| Net Selen annee | 439,00 EUR apres charges | 0,00 EUR si aucun CA live |

Les factures d'audit Lil ne sont pas assimilees au CA commercial Selen.

## 5. Candidats clients / organisations

Les emails sont masques volontairement. Les colonnes `Storage` et `Auth` indiquent les dependances a traiter avant toute suppression future.

| Candidat | Type | Identifiant technique | Email masque | Organisation associee | Creation | Dernier usage connu | Statut | Dossiers | Formations | Sessions | RDV | Documents | Messages | Notifications | Paiements | Abonnements | Acces outils | Factures | Audits externes | Storage | Auth | Motif test | Risque faux positif | Action proposee |
| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Selen Formation | Organisation + compte/client possible | `0df0dc02-40c3-431c-a19e-ac998e90bf37` | `li***@outlook.fr` | Selen Formation | 2026-03-12 | 2026-06-25 | active | 3 | 0 | 0 | 0 | 5 | 12 | 14 | 0 | Aucun repere | 1 | 0 | 0 | 5 objets | 1 compte | Adresse de Lil / donnees de demonstration probables | Moyen: dependances nombreuses, messages et documents | A INVESTIGUER avant suppression |
| Atelier Horizon | Organisation | `2e9b095a-5cca-47e9-b337-e59647fd0da6` | `bo***@horizon.test` | Atelier Horizon | 2026-03-12 | 2026-06-12 | archived | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Aucun repere | 0 | 0 | 0 | 0 | 0 | Domaine `.test`, archivee | Faible | SUPPRIMER APRES SAUVEGARDE si Lil confirme |
| Didascalil | Organisation | `59e2d76d-556d-4ce8-8810-6172293d1612` | `co***@gmail.com` | Didascalil | 2026-03-13 | 2026-06-08 | archived | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Aucun repere | 0 | 0 | 0 | 0 | 0 | Nom contenant Lil, archivee | Moyen: email non explicitement test | A INVESTIGUER |
| Haim Levi | Organisation + compte/client possible | `ea4fc721-5ac9-4d05-9cfe-91990ef2c193` | `ye***@gmail.com` | Haim Levi | 2026-06-08 | 2026-06-08 | active | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Aucun repere | 1 | 0 | 0 | 0 | 1 compte | Fiche isolee, acces outil manuel/ambigu | Eleve: compte Auth present et preaudit associe | A INVESTIGUER |
| barthauxauto | Organisation + compte/client possible | `f6c5f386-9513-4a0a-b457-43cd5cf71693` | `ba***@gmail.com` | barthauxauto | 2026-07-01 | 2026-07-05 | active | 2 | 0 | 0 | 0 | 11 | 17 | 6 | 2 | Daily test associe indirectement par email/paiement | 0 | 0 | 0 | 11 objets | 1 compte | Paiements Stripe `cs_test_`, donnees de test probables | Moyen a eleve: documents, messages, Storage et compte Auth | A INVESTIGUER puis suppression ciblee apres sauvegarde |

Table de decision a remplir par Lil:

| Candidat | Decision Lil | Commentaire |
| --- | --- | --- |
| Selen Formation | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER | Recommande: A INVESTIGUER |
| Atelier Horizon | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER | Recommande: SUPPRIMER APRES SAUVEGARDE |
| Didascalil | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER | Recommande: A INVESTIGUER |
| Haim Levi | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER | Recommande: A INVESTIGUER |
| barthauxauto | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER | Recommande: A INVESTIGUER |

## 6. Detail des deux client_tool_access

| Identifiant | Client masque | Outil | Creation | Debut acces | Fin acces | Source creation | Paiement lie | Code reduction lie | Prestation associee | Statut | Derniere utilisation connue | Classification | Dependances | Effet d'une suppression | Recommandation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `62a14112-9ed6-4561-8518-ebff7555fe21` | `li***@outlook.fr` | `preaudit_qualiopi` | 2026-05-23 13:29 UTC | 2026-05-23 15:12 UTC | 2026-08-23 15:12 UTC | Checkout Stripe test (`cs_test_`) | 9 900 cents, client Stripe present | Aucun usage confirme dans l'audit | Preaudit associe observe | active | 2026-05-23 15:12 UTC | TEST probable | Organisation Selen Formation, compte Auth, preaudit | Retirerait l'acces outil actif a ce compte | SUPPRIMER APRES SAUVEGARDE si Lil confirme |
| `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | `ye***@gmail.com` | `preaudit_qualiopi` | 2026-06-01 21:45 UTC | 2026-06-01 21:44 UTC | 2026-08-10 21:44 UTC | Creation manuelle ou source non tracee | Aucun checkout, montant 0 | Aucun usage confirme dans l'audit | Preaudit associe observe | active | 2026-06-01 21:45 UTC | AMBIGU | Organisation Haim Levi, compte Auth, preaudit | Retirerait l'acces outil actif a ce compte | A INVESTIGUER avant suppression |

## 7. Autres donnees candidates

| Identifiant | Type | Environnement | Client masque | Montant | Statut | Dependances | Effet sur compteurs | Proposition |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| `67cbc918-3a0d-4479-903e-cc357e2cecfa` | `selen_payments` / `prepa_nda` | Stripe test (`cs_test_`) | `ba***@gmail.com` | 39 000 cents | paid | Organisation barthauxauto, paiement intent present | Anciennement inclus dans CA annuel | SUPPRIMER APRES SAUVEGARDE si Lil confirme |
| `f2856bed-f472-4044-80a9-c53f345ecc08` | `selen_payments` / `selen_daily` | Stripe test (`cs_test_`) | `ba***@gmail.com` | 8 900 cents | paid | Organisation barthauxauto, abonnement Daily test probable | Anciennement inclus dans CA annuel | SUPPRIMER APRES SAUVEGARDE si Lil confirme |
| `14cdf836-3ec2-4194-a427-83c0109e5632` | `daily_subscriptions` | Stripe test (`cs_test_`) | Non rattache a un profil agent visible dans cette revue | 8 900 cents mensuels | active | Customer et subscription Stripe presents; periode 2026-07-05 -> 2027-07-05 | Ne doit pas alimenter le CA live | SUPPRIMER APRES SAUVEGARDE et validation Daily |
| `62a14112-9ed6-4561-8518-ebff7555fe21` | `client_tool_access` | Stripe test (`cs_test_`) | `li***@outlook.fr` | 9 900 cents | active | Selen Formation + preaudit | Ne doit pas etre interprete comme vente reelle sans preuve live | SUPPRIMER APRES SAUVEGARDE si Lil confirme |
| `15a61ca7-445f-4b8d-9052-6ff83bc0b488` | `client_tool_access` | Ambigu, pas de checkout | `ye***@gmail.com` | 0 cent | active | Haim Levi + preaudit + compte Auth | N'entre pas dans le CA | A INVESTIGUER |

## 8. Donnees reelles explicitement conservees

Ces donnees sont classees `REELLES - A CONSERVER`. Aucune suppression globale ne doit etre proposee sur ces tables.

| Table | Volume | Montant / statut | Decision |
| --- | ---: | --- | --- |
| `lil_invoices` | 8 lignes | 310 000 cents, status `deposited` | REELLES - A CONSERVER |
| `external_audits` | 13 lignes | status `completed`, `confirmed`, `to_invoice` | REELLES PAR DEFAUT - A CONSERVER |
| `selen_expenses` | 1 ligne | 4 000 cents, categorie `Outil` | REELLE PAR DEFAUT - A CONSERVER |

## 9. Controle fonctionnel local attendu

Navigation:

- Forge absente de la navigation principale.
- Messagerie visible dans la navigation principale.
- Compteur de messagerie conserve.
- Gestion Lil contient l'acces Forge.
- Aucune route Forge supprimee par cette consolidation.
- Aucune route d'alertes Forge ajoutee depuis `main`.

Compteurs:

- `CA commercial Selen` exclut les paiements test.
- Les paiements ambigus n'entrent pas dans le CA.
- Les vraies factures d'audit restent separees.
- Aucune valeur reelle n'est remise a zero.

## 10. Revue visuelle minimale

La revue visuelle authentifiee n'a pas pu etre finalisee dans cet environnement. Le lancement du serveur local sur le port `3060` a demarre puis la commande shell est restee bloquee; le processus a ete arrete proprement et les logs temporaires non suivis ont ete supprimes.

Les controles statiques et les validations techniques restent valides. Avant fusion, Lil doit effectuer les controles visuels manuels suivants:

- `/agent`: tableau de bord Studio; messagerie visible; Forge absente de la navigation principale.
- `/agent/gestion`: carte `La Forge`; libelle `CA commercial Selen`; message d'exclusion des paiements test.
- Messagerie: entree visible, compteur lisible, pas de regression evidente.
- Navigation desktop et mobile: pas de texte sombre sur fond sombre, pas de texte clair sur fond clair, pas de debordement visible.
- Compteur de messages: valeur visible et lisible dans la barre laterale.
- Contraste et responsive des liens `Messagerie`, `Gestion Lil`, `La Forge` et des compteurs CA.

## 11. Validations techniques

Resultats:

- `git diff --check`: OK.
- lint cible (`src/app/agent/gestion/page.tsx`, `src/components/layout/AgentSidebar.tsx`, `src/components/layout/AgentSidebarMessaging.tsx`): OK.
- lint global Studio (`npm.cmd run lint`): OK, 0 erreur, 18 avertissements preexistants.
- TypeScript (`npx.cmd tsc --noEmit`): OK.
- build Studio (`npm.cmd run build`): OK apres chargement local des variables ignorees dans l'environnement du processus uniquement, sans affichage ni copie de secret.
- tests existants pertinents: aucun script de test generique dans `package.json`; seul `tests/googleCalendarOAuth.test.ts` existe et ne couvre pas cette mission navigation/compteurs.
- scan anti-secret: OK sur les fichiers modifies; aucun token, mot de passe, cle ou chaine de connexion complete detecte.
- serveur local: tentative interrompue; aucun fichier metier modifie par le serveur.

## 12. Plan futur de suppression

Ne pas supprimer directement depuis l'interface ou une requete ad hoc. Procedure recommandee pour une mission separee:

1. obtenir la decision explicite de Lil ligne par ligne;
2. produire quatre sauvegardes PostgreSQL natives valides;
3. preparer un plan SQL transactionnel avec `BEGIN`, controles prealables et `ROLLBACK` de test;
4. supprimer d'abord les dependances enfants identifiees;
5. verifier les compteurs apres suppression;
6. documenter chaque ligne supprimee et chaque ligne conservee.

Ordre de prudence:

1. transactions commerciales test (`selen_payments`);
2. acces outil test confirme;
3. abonnement Daily test apres validation Daily;
4. organisations archivees a faible risque;
5. organisations actives ou avec Auth/Storage seulement apres validation humaine.

## 13. Decisions precises attendues de Lil

Lil, il me faut tes decisions sur ces points avant une future suppression:

1. Confirmer que les deux `selen_payments` Stripe test peuvent etre supprimes apres sauvegarde.
2. Confirmer le sort de l'abonnement `daily_subscriptions` test.
3. Confirmer que l'acces outil `62a14112-9ed6-4561-8518-ebff7555fe21` est bien un test.
4. Decider quoi faire de l'acces outil ambigu `15a61ca7-445f-4b8d-9052-6ff83bc0b488`.
5. Valider ligne par ligne le sort de Selen Formation, Atelier Horizon, Didascalil, Haim Levi et barthauxauto.
6. Confirmer que `lil_invoices`, `external_audits` et `selen_expenses` restent hors suppression.

## 14. Limites

- Aucune donnee distante n'a ete modifiee; les classifications restent des recommandations d'audit.
- Les emails sont masques; la validation finale doit se faire par Lil avec le contexte metier.
- Les comptes Auth et fichiers Storage indiquent un risque plus eleve: une suppression future doit etre transactionnelle, sauvegardee et documentee.
- Le `client_tool_access` de Haim Levi est ambigu, car il n'a pas de checkout Stripe mais possede un compte Auth et un preaudit associe.
