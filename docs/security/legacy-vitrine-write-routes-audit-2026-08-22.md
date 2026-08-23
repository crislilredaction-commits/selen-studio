# Audit des routes d'écriture Vitrine NDA — 22 août 2026

## Objet

Compléter l'audit de compatibilité du futur durcissement RLS des dix tables historiques en inspectant les routes client NDA qui écrivent réellement dans la base ou le Storage.

Référence Vitrine inspectée : `134a79914429e1cd0b0fd07077574cec8a2aa950`.

Aucune migration, suppression de donnée ou écriture métier réelle n'a été effectuée dans ce lot.

## Résultat général

Les routes inspectées créent toutes le client serveur privilégié avec `getAdminSupabase()` et appellent `verifyClientNdaDossierAccess()` avant les écritures métier. Le contrôle d'accès client repose sur l'utilisateur authentifié puis sur la correspondance explicite entre le dossier, son organisation et l'email de l'organisation. Les opérations métier sont ensuite réalisées avec le client `service_role`.

Ce fonctionnement reste compatible avec la cible RLS préparée : les utilisateurs clients n'ont pas besoin d'un accès direct aux tables historiques pour utiliser ces parcours.

## Routes vérifiées

### Dépôt NDA déclaré

`app/api/client/nda/deposit-submitted/route.ts`

- contrôle le dossier avant toute opération ;
- bloque explicitement cette action en assistance agent ;
- vérifie que la phase `ready_for_deposit` est ouverte ;
- déduplique le message système ;
- écrit dans `messages`, `notifications` et `nda_variables` via le client admin ;
- aucune écriture directe depuis le navigateur vers les tables historiques.

### Documents finaux transmis

`app/api/client/nda/final-documents-submitted/route.ts`

- contrôle le dossier avant toute opération ;
- écrit le message système et la notification via le client admin ;
- peut faire passer le dossier à `under_review` via le même client ;
- journalise séparément l'assistance agent lorsqu'elle existe.

### Courrier de refus DREETS

`app/api/client/nda/refusal-letter/route.ts`

- contrôle le dossier avant upload ;
- calcule un chemin Storage borné par organisation et dossier ;
- charge le fichier dans le bucket `documents` avec le client admin ;
- crée ensuite le registre `documents`, le message, la notification et la mise à jour `nda_variables` via le client admin ;
- journalise l'assistance agent si nécessaire.

### Décision client sur le programme

`app/api/client/program/decision/route.ts`

- contrôle le dossier avant lecture ou écriture ;
- interdit la décision en mode assistance agent ;
- vérifie que la version appartient au dossier avant modification ;
- si le client renvoie un programme corrigé, l'upload Storage et la ligne `documents` sont créés côté serveur ;
- met à jour `dossier_program_versions`, éventuellement `dossiers`, puis écrit notification et message via le client admin.

## Conséquence pour le projet RLS

Pour les tables concernées ici (`dossiers`, `documents`, `nda_variables`, `messages`, `dossier_program_versions`), aucun des flux d'écriture client inspectés ne nécessite de conserver un privilège DML direct pour un utilisateur authentifié non staff.

La proposition reste donc :

- `anon` : aucun privilège direct ;
- `authenticated` non staff : aucun accès direct aux neuf tables métier historiques ;
- staff actif : policies via `daily_is_selen_staff()` ;
- client NDA : opérations autorisées exclusivement via les routes serveur après contrôle d'accès explicite ;
- `profiles` : auto-lecture minimale conservée séparément pour compatibilité.

## Risques restant à vérifier

- routes génériques d'upload et de téléchargement historiques hors sous-arbre `/api/client/nda` ;
- éventuels écrans Studio encore branchés directement sur un client Supabase de session ;
- fonctions/triggers PostgreSQL historiques qui pourraient supposer des privilèges `authenticated` plus larges ;
- régression fonctionnelle des parcours NDA avec un contexte client réel ou un scénario de test contrôlé.

## Statut

Le modèle RLS proposé gagne en confiance mais reste **brouillon non appliqué**. Aucun changement de sécurité distant permanent n'est effectué avant la fin des tests de non-régression.

## À valider avec Lil

Aucun nouveau choix requis à ce stade.
