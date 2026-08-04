# Audit technique préalable — Selen Daily Lot 1

Date de revue : 4 août 2026  
Branche : `chore/daily-lot1-foundation-audit`  
Worktree dédié : `C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-foundation-audit`  
Base Git : `origin/main` au commit `ed355b533f55c724e59843fcc2749ec08c6d73b4`

## 1. Résumé exécutif

Le cahier des charges “Selen Daily — Lot 1” décrit un socle opérationnel complet de gestion des actions de formation : organismes, rôles cumulables, programmes versionnés, inscriptions permanentes, conventions, signatures, convocations, portails, émargement, évaluations, satisfaction, réclamations, adaptations, aléas, historique et suivi réglementaire.

L’existant Daily dans Selen Studio est une base partielle, orientée cockpit opérateur, avec des écrans utiles pour préparer des formations, sessions, dossiers d’inscription, conventions, signatures, liens de portail et convocations. Il ne constitue pas encore le socle Lot 1 attendu.

Conclusion courte : le projet n’est pas prêt pour un développement direct du Lot 1 complet. Il est prêt pour une mission de fondations 1A, à condition de décider d’abord le modèle d’organisme, d’appartenance utilisateur, de rôles, de permissions, d’historique et de stockage documentaire. Plusieurs briques sont réutilisables, mais le modèle actuel centré sur `user_id` doit être revu avant d’étendre Daily.

Aucune donnée distante n’a été modifiée. Aucune migration n’a été créée ou appliquée. Aucun développement fonctionnel n’a été réalisé.

## 2. Périmètre réellement audité

Éléments audités :

- document de référence : `Cahier_des_charges_Selen_Daily_Lot_1.docx` ;
- routes Studio contenant Daily ;
- actions serveur Daily ;
- génération documentaire Daily ;
- migrations locales `daily_*` ;
- état distant Supabase en lecture seule : tables, RLS, politiques, fonctions, grants, données et objets Storage candidats ;
- dépendances directes avec Auth, Storage, satisfaction, navigation, documents et Vitrine.

Éléments non modifiés :

- fichiers applicatifs ;
- migrations ;
- données Supabase ;
- Auth ;
- Storage ;
- variables Vercel ;
- déploiements.

## 3. État Git et branche utilisée

Le dépôt initial n’a pas été modifié. Le fichier non suivi `docs/selen-global-audit-and-cleanup-plan.md` présent dans le worktree principal n’a pas été touché.

Un worktree propre a été créé depuis `origin/main` :

- chemin : `C:\Users\Poste 1\Documents\Selen-workspace\selen-studio-daily-lot1-foundation-audit` ;
- branche : `chore/daily-lot1-foundation-audit` ;
- état avant audit : propre ;
- suivi : `origin/main`.

## 4. Cartographie des routes et écrans Daily

| Élément | Emplacement | Fonction actuelle | État pour Lot 1 |
|---|---|---:|---|
| Cockpit Daily | `src/app/agent/daily/page.tsx` | Liste formations/sessions, validation formation, indicateurs opérateur | Réutilisable avec adaptation |
| Détail session Daily | `src/app/agent/daily/sessions/[id]/page.tsx` | Préparation dossier, revue, conventions, signatures, portails, convocations | Réutilisable avec forte adaptation |
| Téléchargement convention | `src/app/agent/api/daily/conventions/download/route.ts` | Télécharge un document lié à `daily_conventions` depuis Storage | Réutilisable avec durcissement droits/organisation |
| Téléchargement convocation | `src/app/agent/api/daily/convocations/download/route.ts` | Télécharge un document lié à `daily_convocations` depuis Storage | Réutilisable avec durcissement droits/organisation |
| Navigation Daily | `src/components/layout/AgentSidebar.tsx` | Entrée `/agent/daily` visible pour les agents Studio | Réutilisable côté opérateur, insuffisant côté clients/formateurs/apprenants |

Preuves :

- `src/app/agent/daily/page.tsx:136` contient l’action serveur `updateDailyFormation`.
- `src/app/agent/daily/page.tsx:191` expose la page principale `AgentDailyPage`.
- `src/app/agent/daily/page.tsx:204` lit `daily_formations`.
- `src/app/agent/daily/page.tsx:216` lit `daily_sessions` avec `daily_registration_responses`.
- `src/app/agent/daily/sessions/[id]/page.tsx:743`, `839`, `892`, `1009`, `1072`, `1115` et `1224` protègent les actions via `requireSupportAgent()`.
- `src/app/agent/daily/sessions/[id]/page.tsx:1287` expose la page de détail session.
- `src/app/agent/daily/sessions/[id]/page.tsx:980` et `1191` écrivent des documents HTML dans le bucket Storage `documents`.
- `src/components/layout/AgentSidebar.tsx:81` déclare l’entrée `/agent/daily`.

Les URL publiques de signature et portail sont générées dans Studio mais pointent vers Vitrine :

- `src/app/agent/daily/sessions/[id]/page.tsx:237` : `/daily-signature/{token}` ;
- `src/app/agent/daily/sessions/[id]/page.tsx:242` : `/daily/portail/{role}/{token}` ;
- `src/app/agent/daily/sessions/[id]/page.tsx:246` : `/api/client/daily/convocations/download?id=...`.

## 5. Cartographie des composants, services et actions serveur

### Services et bibliothèques

| Élément | Emplacement | Fonction actuelle | État |
|---|---|---:|---|
| Questions d’inscription et positionnement | `src/lib/dailyRegistrationConfig.ts` | Définit les questions bénéficiaire, entreprise et positionnement | Réutilisable |
| Génération HTML convention | `src/lib/server/dailyConventionDocumentHtml.ts` | Génère une convention Daily déterministe | Réutilisable avec modèle documentaire versionné |
| Génération HTML convocation | `src/lib/server/dailyConvocationDocumentHtml.ts` | Génère une convocation Daily déterministe | Réutilisable avec versionnage et traçabilité |

### Actions serveur observées

Dans `src/app/agent/daily/sessions/[id]/page.tsx` :

- `sendRegistrationDossiers` prépare et envoie les dossiers d’inscription ;
- `saveRegistrationReview` enregistre une revue de dossier ;
- `generateDailyConvention` génère une convention ;
- `prepareDailyConventionSignatureLinks` prépare les liens de signature ;
- `prepareDailyPortalLinks` prépare les accès portail ;
- `generateDailyConvocation` génère une convocation ;
- `sendDailyConvocation` envoie une convocation.

Ces actions utilisent `createSupabaseAdminClient()` après contrôle `requireSupportAgent()`. C’est cohérent pour un cockpit Studio, mais insuffisant comme modèle cible multi-organismes : le Lot 1 demande des contrôles d’autorisation explicites par organisme, rôle et bloc fonctionnel, pas seulement un accès agent interne.

## 6. Cartographie Supabase : tables, fonctions, triggers, RLS

### Migrations locales Daily

| Migration | Objet apparent |
|---|---|
| `20260703090000_create_selen_daily_v1.sql` | `daily_formations`, `daily_sessions`, trigger `set_daily_updated_at`, politiques CRUD client |
| `20260703100000_add_selen_daily_onboarding_and_subscription.sql` | `daily_subscriptions`, `daily_onboarding`, `daily_trainers`, fonctions de période annuelle |
| `20260703110000_add_selen_daily_registration_flow.sql` | Champs d’inscription sur sessions, `daily_registration_responses`, résumé JSON |
| `20260703120000_add_selen_daily_registration_recipients.sql` | `daily_registration_recipients` |
| `20260703130000_add_selen_daily_registration_reviews.sql` | `daily_registration_reviews` |
| `20260703140000_add_selen_daily_positioning_questionnaire.sql` | Mode et questions de positionnement |
| `20260704100000_add_selen_daily_conventions.sql` | `daily_conventions` |
| `20260704110000_add_selen_daily_convention_signatures.sql` | `daily_convention_signatures` |
| `20260704120000_add_selen_daily_portal_access_tokens.sql` | `daily_portal_access_tokens` |
| `20260704130000_add_selen_daily_before_training_documents.sql` | `daily_document_templates`, `daily_convocations`, documents avant formation |
| `20260705110000_stabilize_selen_daily_ux.sql` | stabilisation UX, demandes d’inscription permanentes |
| `20260729173634_realign_daily_and_satisfaction_access.sql` | période annuelle glissante Daily et politique Satisfaction |

### Tables Daily présentes au distant

Requête distante en lecture seule : introspection `pg_class`, `pg_policy`, `pg_proc`, `information_schema.role_table_grants`.

| Table | RLS | Politiques | Données actuelles |
|---|---:|---:|---:|
| `daily_formations` | activée | 4 | 0 |
| `daily_sessions` | activée | 4 | 0 |
| `daily_subscriptions` | activée | 1 | 0 |
| `daily_onboarding` | activée | 3 | 0 |
| `daily_trainers` | activée | 4 | 0 |
| `daily_registration_responses` | activée | 3 | 0 |
| `daily_registration_recipients` | activée | 1 | 0 |
| `daily_registration_reviews` | activée | 0 | 0 |
| `daily_conventions` | activée | 1 | 0 |
| `daily_convention_signatures` | activée | 1 | 0 |
| `daily_portal_access_tokens` | activée | 1 | 0 |
| `daily_document_templates` | activée | 1 | 0 |
| `daily_convocations` | activée | 1 | 0 |
| `daily_formation_registration_requests` | activée | 1 | 0 |

Point d’attention : `daily_registration_reviews` a RLS activée mais aucune politique distante. Elle est exploitable via service role dans le cockpit Studio, mais pas accessible par un client authentifié standard. Ce n’est pas forcément bloquant pour l’existant, mais c’est incompatible avec un futur modèle multi-acteurs sans correction.

### Fonctions Daily présentes

| Fonction | Sécurité | Usage apparent |
|---|---|---|
| `daily_refresh_subscription_period(uuid)` | `SECURITY INVOKER` | initialise/renouvelle la période annuelle glissante |
| `daily_annual_learner_count(uuid)` | `SECURITY INVOKER` | compte les apprenants dans la période active |
| `daily_prepare_upper_tier_if_needed(uuid)` | `SECURITY INVOKER` | prépare le passage de palier |
| `daily_registration_response_summary(...)` | `SECURITY INVOKER` | produit un résumé JSON d’inscription |

### Relations et contraintes observées

Le modèle actuel repose principalement sur :

- `user_id` vers `auth.users` ;
- `daily_sessions.formation_id` vers `daily_formations(id)` avec suppression restreinte ;
- tables enfants reliées aux sessions/formations avec cascades ou `set null` selon le cas ;
- unicités ciblées, par exemple `daily_subscriptions.user_id`, `daily_registration_reviews.session_id`, `daily_conventions(session_id, recipient_type, recipient_key, version)`, `daily_convention_signatures.token`, `daily_convention_signatures(convention_id, signatory_type)`.

Cette structure est suffisante pour une V0 centrée utilisateur, mais pas pour une séparation stricte entre organismes avec plusieurs comptes, rôles cumulables et historique transversal.

### Grants

Les grants distants montrent des privilèges larges pour `anon`, `authenticated` et `service_role` sur plusieurs tables Daily et Satisfaction, incluant notamment `TRUNCATE`, `REFERENCES` et `TRIGGER`.

Risque important : RLS protège les lignes pour `SELECT`, `INSERT`, `UPDATE`, `DELETE`, mais ne protège pas `TRUNCATE`. Ce sujet doit être corrigé dans une future mission de sécurité avant ouverture large de Daily.

## 7. Cartographie Auth et Storage

### Auth

Le modèle Daily actuel rattache les formations, sessions et dépendances à `auth.users` via `user_id`. Ce choix ne correspond pas encore au cahier des charges Lot 1, qui demande :

- plusieurs utilisateurs par organisme ;
- cumul de rôles ;
- désactivation sans perte d’historique ;
- réaffectation des tâches et dossiers ;
- permissions par blocs fonctionnels.

Le modèle cible devra introduire ou réutiliser une notion d’organisation canonique et des appartenances utilisateurs. La décision reste ouverte : réutiliser `organisations` existant ou créer un espace Daily dédié.

### Storage

L’existant utilise le bucket `documents` pour les conventions et convocations générées :

- `src/app/agent/daily/sessions/[id]/page.tsx:980` ;
- `src/app/agent/daily/sessions/[id]/page.tsx:1191`.

L’introspection distante a trouvé des objets candidats par nom dans `documents` et `selen-documents` contenant `daily`, `formation`, `convocation` ou `convention`. Ces objets ne peuvent pas être qualifiés comme données Daily ou données de test uniquement par leur nom. Ils doivent rester conservés tant qu’un rattachement documentaire fiable n’a pas été établi.

## 8. Dépendances avec les autres modules de Studio

| Module | Dépendance | État |
|---|---|---|
| Auth Supabase | `auth.users`, sessions, rôles agents | Critique à refonder pour multi-organismes |
| Support agent | `requireSupportAgent()` dans pages/actions Daily | Adapté au cockpit interne, insuffisant pour clients |
| Storage | bucket `documents`, documents générés | Réutilisable avec métadonnées et politiques renforcées |
| Vitrine | signatures et portails publics Daily | Dépendance à auditer côté Vitrine avant Lot 1B/1C |
| Satisfaction | `satisfaction_surveys` et politique staff | Partiel, non relié à un parcours Daily complet |
| Documents/dossiers | composants et tables documentaires générales | Potentiellement réutilisable, rattachement Daily à clarifier |
| Commercial/abonnements | `daily_subscriptions` | Partiel, aucune ligne distante active |

## 9. Données réelles, données de test et éléments impossibles à qualifier

État distant au moment de l’audit :

- toutes les tables `daily_*` auditées contiennent 0 ligne ;
- `satisfaction_surveys` contient 0 ligne ;
- organisations restantes identifiées : Haïm Levi, PR CONCEPT, ROULIN Antoine.

Haïm Levi est explicitement réel et protégé. Aucune conclusion de suppression n’est formulée dans ce rapport.

Objets Storage : plusieurs objets candidats existent dans `documents` et `selen-documents`, mais leur appartenance Daily réelle ou test n’est pas démontrée. Ils sont classés “impossibles à qualifier sans audit documentaire complémentaire”.

## 10. Comparaison avec chaque domaine du cahier des charges

| Domaine Lot 1 | État existant | Classification |
|---|---|---|
| Onboarding organisme | `daily_onboarding` existe, champs partiels | Partiellement conforme |
| Utilisateurs, rôles, droits | Modèle `user_id`, pas de rôles Daily cumulables | Présent mais incompatible |
| Formateurs/sous-traitants | `daily_trainers`, `trainer_ids` JSON/array | Partiellement conforme |
| Programmes versionnés | `daily_formations.version`, `previous_version_id` | Partiellement conforme |
| Lien permanent d’inscription | Champs token/public sur formations | Partiellement conforme |
| Particuliers et entreprises multi-apprenants | Champs JSON sur sessions/réponses | Présent mais fragile |
| Conventions et signatures | Tables conventions/signatures + génération HTML | Partiellement conforme |
| Sessions multi-séances | `daily_sessions` avec blocs et dates simples | Présent mais incompatible pour multi-séances robuste |
| Convocations | `daily_convocations` + génération HTML | Partiellement conforme |
| Portails | Tokens générés vers Vitrine | Partiellement conforme, dépendance externe |
| Positionnement | Questions/config et réponses JSON | Partiellement conforme |
| Adaptations | Booléen `adaptation_needed`, revue décisionnelle | Partiellement conforme |
| Émargements | Non trouvé | Absent |
| Évaluations/acquis | Non trouvé comme parcours complet | Absent |
| Satisfaction multi-parties | `satisfaction_surveys` générique | Dépendance à sécuriser |
| Réclamations/aléas/incidents | Non trouvé côté Daily | Absent |
| Documents permanents | `daily_document_templates` partiel | Partiellement conforme |
| Suivi réglementaire/BPF | Non trouvé | Absent |
| Historique/journalisation | Pas de journal d’audit Daily transversal | Absent |

## 11. Analyse spécifique du futur sous-lot 1A

Le sous-lot 1A doit être traité comme une mission de fondations, pas comme une extension de page.

Fondations nécessaires :

- organisation canonique ;
- appartenance utilisateur à une organisation ;
- rôles cumulables ;
- permissions par grands blocs ;
- contrôle serveur systématique ;
- RLS par organisation et rôle ;
- désactivation sans suppression ;
- réaffectation des tâches ;
- statuts partagés ;
- journal d’audit ;
- métadonnées documentaires ;
- versionnage documentaire ;
- traçabilité des validations ;
- préparation de l’archivage.

Existant conservable :

- certaines tables Daily comme source d’inspiration ;
- générateurs HTML ;
- configuration des questionnaires ;
- écran cockpit opérateur ;
- logique de période annuelle glissante.

Existant à ne pas étendre tel quel :

- modèle `user_id` comme axe principal ;
- grants trop larges ;
- données structurantes stockées en JSON quand elles doivent être requêtables ;
- absence d’audit log transversal ;
- absence de politiques pour `daily_registration_reviews`.

## 12. Éléments réutilisables

- `src/lib/dailyRegistrationConfig.ts` pour les premières versions de questionnaires.
- `src/lib/server/dailyConventionDocumentHtml.ts` pour le rendu initial de conventions.
- `src/lib/server/dailyConvocationDocumentHtml.ts` pour le rendu initial de convocations.
- Les libellés et statuts actuels comme base de discussion.
- Les routes Studio `/agent/daily` et `/agent/daily/sessions/[id]` comme cockpit interne, après refonte des droits.
- La logique de période annuelle glissante corrigée dans `20260729173634_realign_daily_and_satisfaction_access.sql`.

## 13. Éléments à adapter

- Les tables `daily_formations` et `daily_sessions` doivent devenir organisation-centrées.
- Les bénéficiaires, entreprises, séances, formateurs et documents doivent être normalisés ou mieux typés.
- Les portails publics doivent être audités côté Vitrine.
- Les politiques RLS doivent vérifier organisation, appartenance et rôle.
- Les grants doivent être réduits.
- Les actions serveur doivent passer d’un modèle “agent Studio avec service role” à un modèle explicite : opérateur Selen, organisme, formateur, apprenant, entreprise.

## 14. Éléments obsolètes ou incompatibles

- Politiques “client CRUD” basées uniquement sur `auth.uid() = user_id` pour un futur contexte multi-utilisateur.
- Privilèges `TRUNCATE`, `REFERENCES`, `TRIGGER` pour `authenticated` et grants larges pour `anon`.
- Absence de politique sur `daily_registration_reviews`.
- Suppressions en cascade depuis `auth.users` sur plusieurs tables : risqué pour l’historique et la désactivation sans perte.
- Modèle de sessions trop plat pour représenter proprement des sessions multi-séances/multi-formateurs.

## 15. Manques identifiés

- Modèle d’organisation Daily validé.
- Rôles Daily cumulables.
- Permissions par bloc.
- Historique et audit log.
- Workflow de validation documentaire.
- Gestion complète des pièces jointes.
- Émargement.
- Évaluations/acquis.
- Satisfaction rattachée au parcours Daily.
- Réclamations, incidents, aléas et adaptations structurées.
- Indicateurs réglementaires et BPF.
- Archivage et conservation.
- Stratégie Storage par organisation.
- Tests RLS transactionnels.

## 16. Risques techniques et de sécurité

1. Grants trop larges : `TRUNCATE` n’est pas protégé par RLS.
2. Modèle `user_id` insuffisant pour séparer strictement les organismes.
3. `daily_registration_reviews` inaccessible côté clients à cause de RLS sans politique.
4. Usage du service role côté serveur : acceptable pour cockpit interne, mais ne doit pas masquer l’absence de modèle d’autorisation cible.
5. Portails publics dépendants de Vitrine non audités ici.
6. Objets Storage candidats impossibles à qualifier sans rattachement plus fort.
7. En 2026, les réglages Supabase Data API peuvent nécessiter une exposition explicite des nouvelles tables ; à vérifier avant toute future migration.

## 17. Questions nécessitant une décision de Lil

1. L’organisation Daily doit-elle réutiliser la table `organisations` existante ou avoir une table dédiée ?
2. Un organisme client peut-il avoir plusieurs établissements ou entités juridiques dans Lot 1 ?
3. Les utilisateurs clients doivent-ils être rattachés à `selen_client_profiles`, à une nouvelle table Daily, ou aux deux ?
4. Qui possède officiellement une formation : l’organisme, Selen, ou une relation organisme/Selen ?
5. Les portails publics Daily doivent-ils vivre dans Selen Studio ou Selen Vitrine ?
6. La signature doit-elle rester tokenisée en interne ou passer par un prestataire ?
7. Quels statuts doivent être communs à tous les blocs : brouillon, à valider, validé, correction demandée, archivé ?
8. Quelle durée de conservation et quelle règle d’archivage appliquer aux documents formation ?
9. Faut-il faire évoluer les tables Daily existantes ou repartir sur un nouveau modèle propre en conservant les générateurs ?

## 18. Proposition de schéma cible conceptuelle

Sans création de migration à ce stade, le socle 1A pourrait être organisé autour de :

- `daily_organisations` ou extension stricte de `organisations` ;
- `daily_memberships` : utilisateur, organisation, état actif/inactif ;
- `daily_roles` et `daily_membership_roles` : rôles cumulables ;
- `daily_permissions` ou matrice codée côté serveur avec vérification en base ;
- `daily_audit_logs` : acteur, organisation, objet, action, avant/après, contexte ;
- `daily_documents` : métadonnées Storage, propriétaire, version, statut, hash ;
- `daily_status_transitions` ou contraintes/fonctions par type d’objet ;
- tables métier Lot 1 ensuite : programmes, sessions, séances, participants, entreprises, signatures, évaluations, satisfaction.

Principe recommandé : toutes les tables métier Daily doivent porter un `organisation_id` ou un rattachement démontrable à une organisation, et toutes les politiques RLS doivent partir de ce rattachement.

## 19. Proposition de matrice des rôles et droits conceptuelle

| Rôle | Lecture | Création | Validation | Administration |
|---|---|---|---|---|
| Lil/admin Selen | Tout le périmètre Daily | Oui | Oui | Oui |
| Opérateur Selen | Dossiers attribués ou organisations suivies | Oui | Selon bloc | Non global |
| Référent organisme | Données de son organisme | Oui sur blocs autorisés | Oui sur validations organisme | Gestion utilisateurs limitée |
| Formateur | Sessions et documents associés | Limité | Émargement/présence selon règle | Non |
| Apprenant | Son portail et ses documents | Réponses/questionnaires | Signature/accusés | Non |
| Contact entreprise | Apprenants liés à son entreprise | Réponses entreprise | Signature entreprise | Non |

Cette matrice devra être validée avant migration.

## 20. Liste prévisionnelle des migrations nécessaires

Aucune migration n’a été créée. Les migrations futures probables sont :

1. fondations organisations/memberships/rôles Daily ;
2. journal d’audit Daily ;
3. durcissement grants/RLS Daily existants ;
4. migration ou remplacement progressif des tables `daily_formations` et `daily_sessions` ;
5. modèle documents/Storage versionné ;
6. modèle séances, participants, entreprises ;
7. modèle signatures et portails ;
8. modèle émargements ;
9. modèle évaluations/acquis ;
10. modèle satisfaction Daily ;
11. modèle réclamations/incidents/adaptations ;
12. indicateurs réglementaires/BPF ;
13. archivage.

## 21. Plan de tests futur

Tests prioritaires pour 1A :

- RLS : un organisme ne voit jamais les données d’un autre.
- Rôles cumulables : un même utilisateur peut avoir plusieurs droits sans duplication incohérente.
- Désactivation : un utilisateur désactivé perd l’accès sans suppression historique.
- Réaffectation : tâches et dossiers restent traçables après changement d’acteur.
- Audit log : chaque action sensible écrit une preuve.
- Storage : un utilisateur ne télécharge que les documents autorisés.
- Server actions : refus côté serveur même si l’UI est contournée.
- Grants : aucun accès `anon`, aucun `TRUNCATE` pour `authenticated`.
- Régression : les générateurs convention/convocation restent déterministes.

## 22. Découpage recommandé du sous-lot 1A

1. Décisions fonctionnelles : organisation canonique, rôles, portails.
2. Migration fondations : organisations/memberships/rôles/audit logs.
3. Durcissement sécurité : grants, RLS, fonctions, tests transactionnels.
4. Adaptation du cockpit Studio aux nouvelles fondations.
5. Stratégie Storage et documents versionnés.
6. Rapport de conformité et validation manuelle avant sous-lot suivant.

## 23. Ordre recommandé des prochaines missions

1. Atelier décisionnel Lil : modèle organisation et matrice des droits.
2. Audit Vitrine des routes publiques Daily.
3. Migration 1A fondations en dry-run avec sauvegardes PostgreSQL natives.
4. Tests RLS transactionnels par rôle.
5. Adaptation de `/agent/daily` au nouveau modèle.
6. Migration progressive ou remplacement contrôlé des tables Daily V0.
7. Sous-lot onboarding/utilisateurs/formateurs.

## 24. Conclusion : prêt ou non à développer les fondations

Le développement fonctionnel Lot 1 ne doit pas commencer tout de suite.

Le sous-lot 1A “Fondations” peut être préparé après validation humaine des décisions listées ci-dessus. L’existant Daily est utile comme prototype et source de composants, mais le modèle de données et de sécurité doit être consolidé avant toute extension.

Statut recommandé : audit préalable terminé, décision Lil requise avant conception/migration 1A.

