# AI_CONTEXT — Selen Studio

## Rôle du projet

Ce dépôt correspond à **Selen Studio**.

Selen Studio contient l’espace **agent/admin** de Selen.

Il sert à gérer :

- les clients ;
- les organisations ;
- les dossiers ;
- les dossiers NDA ;
- les dossiers Review / audit blanc ;
- les préaudits côté agent ;
- les messages internes ;
- les documents client ;
- les rapports ;
- les actions de suivi agent/admin.

Selen Studio ne doit pas contenir le site vitrine public ni les pages commerciales publiques.

## Séparation des projets

La séparation validée est la suivante :

- **Selen Vitrine** = site public + espace client.
- **Selen Studio** = espace agent/admin.
- **Sélion** = robot/prospection, actuellement en pause.

Les clients utilisent principalement **Selen Vitrine**.

Les agents/admin utilisent principalement **Selen Studio**.

Toute fonctionnalité client finale ou publique doit être développée dans Selen Vitrine, sauf si elle sert uniquement à l’agent pour consulter ou administrer.

## Stack technique

Projet Next.js avec App Router.

Technologies principales :

- Next.js
- TypeScript
- Supabase
- Vercel
- Tailwind / styles existants
- Resend si utilisé pour les emails
- logique métier Qualiopi / NDA / Review

Avant toute modification importante, vérifier :

- l’architecture existante ;
- les routes déjà présentes ;
- les appels Supabase existants ;
- les tables utilisées ;
- les statuts existants ;
- les composants déjà disponibles.

## Règles de prudence

Ne pas modifier plusieurs parcours en même temps.

Ne pas casser les parcours NDA existants.

Ne pas casser les parcours Review / audit blanc existants.

Ne pas casser le dashboard agent.

Ne pas modifier la messagerie interne sans vérifier les notifications agent/admin.

Ne pas renommer les tables Supabase sans vérifier tous leurs usages.

Ne pas créer de nouveau projet Supabase.

Ne pas déplacer de logique client publique dans Studio.

Ne pas supprimer une page, une route, une table ou une fonction sans vérifier ses usages.

Ne pas remplacer le design Selen par un style générique SaaS bleu/blanc.

## Design

Respecter l’univers graphique Selen :

- registre ancien ;
- parchemin ;
- brun / sépia ;
- doré ;
- grimoire moderne.

Côté agent/admin, le fond peut être plus sombre que côté client, mais il doit rester lisible.

Priorité récente : éclaircir légèrement le fond agent sombre si nécessaire, sans perdre l’identité Selen.

## Priorités produit actuelles

Les priorités actuelles sont :

1. Finaliser le parcours **Préaudit côté agent**.
2. Finaliser le parcours **Review / audit blanc**.
3. Corriger le dashboard agent.
4. Corriger la messagerie et les notifications.
5. Ajouter ou améliorer le grimoire auditeur.
6. Finaliser les liens propres entre dossiers, clients, préaudit et Review.

Sélion est en pause pour le moment.

## Préaudit côté agent

Objectif : permettre à l’agent de consulter un dossier préaudit depuis Studio.

La fiche dossier préaudit côté agent doit idéalement afficher :

- nom client ;
- email client ;
- statut de session ;
- type d’audit ;
- nouvel entrant ou non ;
- nombre d’indicateurs applicables ;
- avancement global ;
- dernière mise à jour ;
- synthèse finale si disponible ;
- notes prises par le client ;
- indicateurs en défaut ;
- lien ou vue miroir permettant de voir le préaudit comme le client, sans dépendre du localStorage client.

Attention : ne pas mélanger la logique client de Selen Vitrine avec l’interface agent de Studio.

## Review / audit blanc

Le terme interface souhaité est plutôt **Review**, tout en gardant “audit blanc” dans les textes métier si nécessaire.

À finaliser :

- liens propres entre les dossiers Review et les fiches audit blanc ;
- disparition des actions dashboard Review quand le rapport est envoyé ou le dossier terminé ;
- correction des indicateurs non concernés ;
- correction de la notion de nouvel entrant appliquée par défaut ;
- simplification des questions côté auditeur ;
- accès client aux documents correctifs / rapport.

Les audits blancs Review ne doivent plus apparaître comme action dashboard une fois le rapport envoyé au client ou le statut terminé, sauf nouveau message client.

## Dashboard agent

Dashboard validé :

- carte “Nouveaux messages” ;
- carte “Dossiers à traiter” ;
- carte “Audits blancs Review” ;
- carte “Clients à relancer” ;
- section pleine largeur conditionnelle “Dossiers en attente d’un agent”.

Les anciennes cartes de navigation Clients / Dossiers / Audits blancs / Organisations ne doivent pas revenir sur le dashboard, car elles sont accessibles depuis la sidebar.

Corriger si nécessaire :

- doublon de carte “Nouveaux messages” ;
- carte formations inutile ;
- affichage des actions Review terminées.

## Messagerie

Règle métier validée :

- lorsqu’un agent écrit au client, le client reçoit une notification email ;
- lorsqu’un client écrit à l’agent, l’agent/admin reçoit une alerte visuelle dans Studio ;
- pas forcément d’email côté agent/admin ;
- les messages clients doivent être marqués comme lus après ouverture par l’agent.

Bug connu :

- certains messages clients restent affichés comme non lus même après ouverture.

À vérifier probablement :

- routes de lecture message côté agent ;
- mise à jour du statut lu/non lu ;
- affichage dashboard ;
- affichage dans la fiche dossier.

## NDA

Le parcours NDA existe déjà en partie.

Ne pas le casser en travaillant sur préaudit ou Review.

Logique NDA importante :

- import documents client ;
- analyse programme / CV ;
- cohérence entre programme et diplômes / compétences ;
- reformulation du programme si nécessaire ;
- édition agent ;
- validation client ;
- génération des documents utiles.

## Méthode de travail avec Codex

Avant de coder, toujours :

1. Lire ce fichier.
2. Vérifier que Git est propre.
3. Identifier les fichiers concernés.
4. Proposer un plan si la tâche est importante.
5. Modifier uniquement les fichiers nécessaires.
6. Lister les fichiers modifiés.
7. Indiquer les tests à faire.

Pour une tâche importante, commencer par proposer un plan sans modifier le code.

Ne jamais lancer une grosse refonte globale sans découpage.

## Commandes utiles

Vérifier l’état Git :

```powershell
git status
```
