# Audit Studio - navigation, donnees de test et revue UI

Date: 2026-08-01  
Branche: `audit/studio-cleanup-and-ui`  
SHA de depart: `89e9e4981c03d6c714cbf57a4d5ea93207d9599d`  
Depot: `selen-studio`  

## 1. Resume executif

La branche d'audit a ete creee depuis `origin/main` a jour. Aucune migration n'a ete creee, aucune donnee distante n'a ete modifiee, aucune suppression n'a ete effectuee et aucun deploiement n'a ete declenche manuellement.

Corrections locales appliquees:

- La Forge n'apparait plus comme entree principale de la barre laterale Studio.
- La messagerie active existante est replacee dans la zone principale de navigation.
- Un acces discret a La Forge est ajoute dans `Gestion Lil`.
- Le panneau Messagerie s'ouvre maintenant vers le bas, adapte a sa nouvelle position.

Limites importantes:

- Le schema distant contient `public.forge_alerts`, mais la branche `main` locale ne contient pas de route UI `/agent/forge/alerts`. Aucun lien vers une page inexistante n'a ete ajoute.
- La revue visuelle automatisee complete n'a pas pu etre faite: `agent-browser` et Playwright ne sont pas installes dans l'environnement. Le serveur local Next a bien demarre sur `http://localhost:3017`, mais aucune capture automatisee fiable n'a pu etre produite.
- Supabase signale encore 12 tables publiques avec RLS desactivee. Ce point est hors correction dans cette mission et ne doit pas etre modifie sans plan RLS dedie.

## 2. Verification Git initiale

Worktree cree: `C:/Users/Poste 1/Documents/Selen-workspace/selen-studio-cleanup-audit`

Etat initial:

- Branche: `audit/studio-cleanup-and-ui`
- Base: `origin/main`
- SHA: `89e9e4981c03d6c714cbf57a4d5ea93207d9599d`
- `git status`: propre avant modifications
- Aucun `MERGE_HEAD`, `CHERRY_PICK_HEAD` ou `REBASE_HEAD`

Le depot principal `selen-studio` etait reste sur `fix/google-calendar-oauth-renewal` avec un fichier non suivi `docs/selen-global-audit-and-cleanup-plan.md`. Il n'a pas ete utilise pour eviter de melanger les scopes.

## 3. Navigation actuelle cartographiee

Fichiers principaux:

- `src/components/layout/AgentSidebar.tsx`
- `src/components/layout/AgentSidebarMessaging.tsx`
- `src/app/agent/layout.tsx`
- `src/app/agent/gestion/page.tsx`

Entrees principales avant correction:

| Route | Libelle | Regle |
| --- | --- | --- |
| `/agent` | Tableau de bord | Tous agents connectes |
| `/agent/dossiers` | Dossiers | Tous agents connectes |
| `/agent/daily` | Selen Daily | Tous agents connectes |
| `/agent/forge` | La Forge | Tous agents connectes dans la sidebar, page conservee |
| `/agent/rendez-vous` | Rendez-vous | Tous agents connectes |
| `/agent/satisfaction` | Satisfaction | `adminOnly` |
| `/agent/clients` | Clients | Tous agents connectes |
| `/agent/articles` | Articles | `adminOnly` |
| `/agent/gestion` | Gestion Lil | `ownerOnly`, via `isOwnerLil(email)` |
| `/agent/profil` | Mon profil | Tous agents connectes |
| `/agent/admin/agents` | Acces agents | `adminOnly` |

Roles et controles:

- `AgentSidebar` charge le role via `selen_admin_users` puis `agent_profiles`.
- `adminOnly` est visible uniquement si le role charge vaut `admin`.
- `ownerOnly` repose sur `isOwnerLil(email)`.
- `Gestion Lil` recontrole cote serveur avec `isLilOwner()`.

## 4. Messagerie identifiee

Parcours existants:

- Messagerie active de sidebar: `AgentSidebarMessaging`.
- Donnees: `notifications` via `/agent/api/notifications/list` et `internal_messages` via `/agent/api/internal-messages/list`.
- Compteur visible: nombre de notifications non lues et non dismiss.
- Temps reel: abonnement Supabase Realtime sur `notifications` et `internal_messages`.
- Messagerie client par dossier: `AgentMessagingDrawer` utilise dans `/agent/dossiers/[id]`, via table `messages`.
- Route/page dediee globale de messagerie: absente sur `main`.

Decision appliquee:

- Ne pas consolider les messageries.
- Ne pas creer de nouvelle route.
- Rendre visible le panneau actif existant dans la navigation principale.

## 5. Navigation cible appliquee

Modifications:

- Retrait de l'entree principale `/agent/forge` dans `AgentSidebar`.
- Deplacement de `AgentSidebarMessaging` dans la zone principale de navigation, apres `Rendez-vous`.
- Suppression de l'ancien emplacement bas de sidebar pour eviter un doublon.
- Ajout d'un bouton `La Forge` dans l'en-tete de `Gestion Lil`.
- Ajout d'une carte discrete `La Forge` dans `Gestion Lil` pointant vers `/agent/forge`.

Non applique:

- Aucun lien `alertes Forge` n'a ete ajoute, car la route UI `/agent/forge/alerts` est absente du code de depart.

## 6. Forge et alertes

Routes Forge locales suivies par Git:

- `src/app/agent/forge/page.tsx`
- `src/app/agent/forge/cody/page.tsx`
- `src/app/agent/forge/layout.tsx`

Tables Forge distantes observees:

- `forge_alerts`: 3 lignes
- `forge_alert_events`: 2 lignes
- `forge_missions`: 6 lignes
- `forge_mission_plans`: 3 lignes
- `forge_mission_checkpoints`: 50 lignes
- `forge_execution_runs`: 2 lignes
- autres tables Forge presentes

Risque:

- Le distant est plus avance que le code `main` pour le centre d'alertes Forge. Ajouter un lien UI vers les alertes sans route produirait une page introuvable.

Decision requise:

- Lil doit confirmer si le centre d'alertes Forge doit etre integre depuis une branche Forge existante avant le menage final de navigation.

## 7. Faux clients candidats

Requete effectuee en lecture seule sur `organisations`, avec emails masques et dependances agregees.

| Candidat | Identifiant | Email masque | Statut | Dossiers | Documents | Messages | Notifications | Motif | Risque faux positif |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| Selen Formation | `0df0dc02-40c3-431c-a19e-ac998e90bf37` | `li***@outlook.fr` | active | 3 | 5 | 12 | 14 | lie a Barthaux/Laurent selon marqueurs | Moyen |
| Atelier Horizon | `2e9b095a-5cca-47e9-b337-e59647fd0da6` | `bo***@horizon.test` | archived | 3 | 0 | 0 | 0 | domaine `.test` | Faible |
| Didascalil | `59e2d76d-556d-4ce8-8810-6172293d1612` | `co***@gmail.com` | archived | 1 | 0 | 0 | 0 | nom contenant Lil | Moyen |
| barthauxauto | `f6c5f386-9513-4a0a-b457-43cd5cf71693` | `ba***@gmail.com` | active | 2 | 11 | 17 | 6 | Barthaux Auto | Faible a moyen |

Autres organisations observees non classees test sans validation:

- `ROULIN Antoine`: active, 4 dossiers, 13 documents, 3 messages.
- `PR CONCEPT`: active, 1 dossier, 3 documents.
- `Haim Levi`: active, 0 dossier.

Dependances candidates a verifier avant toute suppression:

- `dossiers`
- `documents`
- `messages`
- `notifications`
- `nda_variables`
- `selen_agent_assistance_tokens`
- `selen_agent_assistance_logs`
- fichiers Storage references par `documents.storage_path`
- eventuels utilisateurs Auth associes, non supprimes ni modifies dans cette mission

Storage:

- 16 documents candidats avec `storage_path`.
- Prefixes observes: UUID organisations candidates, `generated`, `program-versions`.

## 8. Validation requise de Lil - clients

| Candidat | Choix Lil |
| --- | --- |
| Selen Formation | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER |
| Atelier Horizon | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER |
| Didascalil | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER |
| barthauxauto | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER |
| Haim Levi | CONSERVER / SUPPRIMER APRES SAUVEGARDE / A INVESTIGUER |

## 9. Inventaire des fausses ventes et transactions candidates

Lil indique qu'aucune vente enregistree actuellement n'est reelle. Aucune suppression n'a ete faite.

| Categorie | Lignes | Montant cents | Statuts/types | Classification |
| --- | ---: | ---: | --- | --- |
| `selen_payments` | 2 | 47900 | paid | Transactions Stripe candidates factices |
| `client_tool_access` | 2 | 9900 | active | Acces outil lies a achat ou test |
| `daily_subscriptions` | 1 | 8900 | active | Abonnement Daily de test a valider |
| `lil_invoices` | 8 | 310000 | deposited | Factures internes Lil, ne pas assimiler automatiquement a Stripe |
| `selen_expenses` | 1 | 4000 | Outil | Depense interne Lil |
| `support_refund_requests` | 0 | 0 | - | Aucun remboursement |
| `discount_codes` | 1 | 0 | active | Configuration/code, ne pas supprimer sans validation |
| `discount_code_redemptions` | 0 | 0 | - | Aucun usage |
| `external_audits` | 13 | 0 | completed, confirmed, to_invoice | Audits externes, certains peuvent alimenter factures |
| `appointment_requests` | 7 | 0 | completed | Rendez-vous, dependances calendrier possibles |

Details masques:

- 2 `selen_payments` payes: `prepa_nda` et `selen_daily`, email masque `ba***@gmail.com`.
- 2 `client_tool_access`: un acces `preaudit_qualiopi` payant pour `li***@outlook.fr`, un acces a 0 cent pour `ye***@gmail.com`.
- 1 `daily_subscriptions`: active, tier `base`, montant 8900 cents.
- 8 `lil_invoices`: status `deposited`, total 310000 cents.

Distinction importante:

- Donnees transactionnelles factices possibles: `selen_payments`, `client_tool_access`, `daily_subscriptions`.
- Configurations a conserver par defaut: `discount_codes`, catalogues, produits, tarifs, fonctions, tables.
- Donnees internes Lil a ne pas supprimer automatiquement: `lil_invoices`, `selen_expenses`.
- Parcours metier a auditer avant suppression: `external_audits`, `appointment_requests`.

## 10. Plan futur de suppression transactionnelle

Toute suppression future doit suivre cet ordre:

1. Sauvegarde PostgreSQL native complete et export cible.
2. Liste approuvee par Lil, element par element.
3. Verification des cles et dependances.
4. Transaction SQL de test avec `ROLLBACK`.
5. Comptages avant/apres.
6. Suppression ordonnee des dependances enfants avant parents.
7. Verification Storage.
8. Verification Auth.
9. Journal des suppressions.
10. Validation finale.

## 11. Revue visuelle page par page

Statut de la revue:

- Serveur local lance: `npm.cmd run dev -- --port 3017`
- URL locale: `http://localhost:3017`
- `agent-browser`: non disponible
- Playwright: non disponible
- Captures automatisees: non produites
- Routes protegees: non testees visuellement avec authentification dans cet environnement

Table de revue preliminaire:

| Route | Page | Resolution | Probleme | Gravite | Fichier probable | Correction recommandee |
| --- | --- | --- | --- | --- | --- | --- |
| `/agent` | Tableau de bord | non capturee | Non testable sans navigateur automatise/auth | NON TESTABLE | `src/app/agent/page.tsx` | Revue manuelle apres Preview |
| `/agent/dossiers` | Dossiers | non capturee | Non testable sans navigateur automatise/auth | NON TESTABLE | `src/app/agent/dossiers/page.tsx` | Revue manuelle desktop/mobile |
| `/agent/dossiers/[id]` | Dossier detail | non capturee | Messagerie client existe par dossier | NON TESTABLE | `src/app/agent/dossiers/[id]/page.tsx` | Revue avec dossier test approuve |
| `/agent/daily` | Daily | non capturee | Hors modification metier | NON TESTABLE | `src/app/agent/daily/page.tsx` | Revue sans correction Daily |
| `/agent/rendez-vous` | Rendez-vous | non capturee | Non testable sans navigateur automatise/auth | NON TESTABLE | `src/app/agent/rendez-vous/page.tsx` | Revue manuelle |
| `/agent/gestion` | Gestion Lil | code revu | Acces Forge ajoute | CORRECTION MINEURE | `src/app/agent/gestion/page.tsx` | Verifier visuel en admin |
| `/agent/forge` | Forge | code revu | Retiree de sidebar principale mais route conservee | CONFORME A LA CIBLE | `src/app/agent/forge/page.tsx` | Verifier acces depuis Gestion Lil |
| `/agent/forge/cody` | Cody | non capturee | Route conservee | NON TESTABLE | `src/app/agent/forge/cody/page.tsx` | Revue manuelle admin |
| `/agent/support` | Support | non capturee | Non testable sans navigateur automatise/auth | NON TESTABLE | `src/app/agent/support/page.tsx` | Revue manuelle |
| `/agent/clients` | Clients | non capturee | Non testable sans navigateur automatise/auth | NON TESTABLE | `src/app/agent/clients/page.tsx` | Revue manuelle |
| `/agent/articles` | Articles | non capturee | Admin-only | NON TESTABLE | `src/app/agent/articles/page.tsx` | Revue manuelle admin |
| `/agent/admin/agents` | Acces agents | non capturee | Admin-only | NON TESTABLE | `src/app/agent/admin/agents/page.tsx` | Revue manuelle admin |

Defauts bloquants visuels confirmes par capture: aucun, car captures non disponibles.

## 12. Fichiers suffixes `(1)`

Fichiers Studio compares:

| Fichier copie | Fichier canonique | Statut |
| --- | --- | --- |
| `src/lib/server/notifyClientVisibleDocuments (1).ts` | `src/lib/server/notifyClientVisibleDocuments.ts` | Ancienne version probable, diff: 60 lignes |
| `src/app/agent/gestion/page (1).tsx` | `src/app/agent/gestion/page.tsx` | Ancienne version probable, diff: 322 lignes |
| `src/app/agent/api/program/send-to-client/route (1).ts` | `src/app/agent/api/program/send-to-client/route.ts` | Contient des elements differents, diff: 159 lignes |
| `src/app/agent/api/gestion/audits/email-confirmation/route (1).ts` | `src/app/agent/api/gestion/audits/email-confirmation/route.ts` | Ancienne version probable, diff: 120 lignes |

Usages:

- Aucun import direct detecte vers les noms suffixes `(1)`.
- Historique Git observe: `69a170d`, `005af84`.
- Aucune suppression effectuee.

Fichier Vitrine mentionne par le brief:

- `components/Footer (1).tsx`: non modifie dans cette mission Studio.

## 13. Corrections realisees

Fichiers modifies:

- `src/components/layout/AgentSidebar.tsx`
- `src/components/layout/AgentSidebarMessaging.tsx`
- `src/app/agent/gestion/page.tsx`
- `docs/studio-cleanup-navigation-data-and-ui-audit.md`

Corrections:

- Navigation principale allegee.
- Messagerie active remise en visibilite dans la navigation principale.
- Acces Forge deplace vers Gestion Lil.
- Panneau Messagerie ajuste pour sa nouvelle position.

## 14. Corrections proposees mais non realisees

- Integrer ou recreer une route UI `/agent/forge/alerts` seulement apres decision produit et verification de la branche source.
- Revue visuelle complete avec captures desktop/tablette/mobile dans un environnement avec navigateur automatise ou session Studio authentifiee.
- Plan dedie RLS pour les 12 tables publiques signalees par Supabase.
- Suppression des donnees de test uniquement apres validation Lil, sauvegardes et transaction de test.

## 15. Validations techniques

Resultats:

- `git diff --check`: OK, avertissements CRLF Windows seulement.
- lint cible (`AgentSidebar`, `AgentSidebarMessaging`, `Gestion Lil`): OK.
- lint global Studio: OK, 0 erreur, 18 avertissements preexistants.
- TypeScript (`npx.cmd tsc --noEmit`): OK.
- build Studio: OK apres chargement des variables ignorees depuis `.env.local` dans l'environnement du processus uniquement, sans affichage ni copie de secret.
- premier build sans variables locales: echec attendu sur `/agent/daily` avec `supabaseUrl is required`; non lie aux modifications.
- routes Forge conservees dans le build: `/agent/forge` et `/agent/forge/cody`.
- route `/agent/forge/alerts`: absente du code `main`, non ajoutee.
- messagerie accessible par composant existant `AgentSidebarMessaging`; aucune route dediee creee.
- tests existants concernes: aucun test navigation/messagerie/Forge trouve. `tests/googleCalendarOAuth.test.ts` est hors perimetre de cette mission.
- controle visuel automatise: non realise, `agent-browser` et Playwright absents.

## 16. Decisions necessitant l'accord de Lil

- Confirmer quels candidats clients conserver, supprimer apres sauvegarde ou investiguer.
- Confirmer le traitement de `Haim Levi`, organisation sans dependance mais non explicitement citee dans les faux clients.
- Confirmer si toutes les transactions Stripe candidates peuvent etre supprimees plus tard.
- Decider si les factures internes `lil_invoices` et la depense `selen_expenses` doivent rester hors suppression.
- Decider comment reintegrer le centre d'alertes Forge absent du code `main`.
- Valider une future mission RLS pour les 12 tables publiques historiques.
