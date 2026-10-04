# Accès aux programmes et aux documents depuis le dossier Daily

La nouvelle gestion des dossiers renvoyait vers le dossier organisme, où seuls les liens des tâches actives conduisaient aux programmes. Un programme sans tâche ou déjà validé devenait difficile à retrouver. La consultation des pièces de paramétrage ne recensait pas les fichiers actuels enregistrés dans `daily_documents`.

## Parcours

- Dossiers → dossier Daily de l’OF → **Programmes de formation** → **Modifier et valider le programme**. Le lien ouvre l’éditeur existant et ses onglets Programme, Positionnement et Évaluation. Les boutons existants enregistrent le brouillon ou valident. Un programme validé reste consultable ; les règles de modification et de version ne changent pas.
- Dossiers → dossier Daily de l’OF → **Documents client** → **Ouvrir le document**. La liste utilise les fichiers privés courants de `daily_documents`, y compris les fichiers déjà vérifiés. Les accès historiques aux pièces de paramétrage et aux justificatifs formateurs restent disponibles.
- Les deux rubriques figurent aussi dans la vue d’ensemble et dans la navigation permanente de l’OF. L’éditeur comporte un retour direct aux programmes de cet OF.

## Consultation documentaire

La route de lecture revérifie l’authentification, l’abonnement Daily actif et l’assignation canonique à chaque téléchargement. Un admin actif conserve le périmètre Daily canonique. L’identifiant doit désigner un document courant non archivé, du bucket `documents`, avec un chemin privé appartenant au même OF. Aucun lien public ou lien client nécessitant une autre session n’est envoyé au navigateur. L’empreinte enregistrée est vérifiée lorsqu’elle existe ; un fichier altéré bloque la réponse. Les anciens fichiers sans empreinte restent consultables dans ce même périmètre, sans leur inventer une preuve.

Les listes sont paginées par 100 jusqu’à épuisement : aucun plafond arbitraire ne masque les programmes ou pièces suivants. Les métadonnées de procédure sans fichier privé sont exclues. Aucun changement Auth, RLS, schéma, publication ou validation documentaire. Aucun email envoyé par ces nouveaux accès.

## Vérification

21 nouveaux cas exécutent les vrais composants, la route et les fonctions de lecture, avec le périmètre canonique réel et des transports strictement isolés. Ils couvrent les programmes sans session dans leurs quatre états, la consultation après validation, les pièces courantes, la pagination, le contenu réel et l’empreinte, l’admin de secours et le refus des comptes inactifs, réaffectations, désabonnements, autres OF, chemins traversants, buckets externes, versions anciennes et archives.

Les 402 tests complets passent, dont les tests existants de sauvegarde, validation et questionnaires, ainsi que le typage et le build complet (69/69 pages). Les contrôles Lenovo et Vercel doivent être lus sur le commit final avant de déclarer la livraison terminée. La recette avec une session Studio authentifiée reste distincte de ces contrôles isolés.
