# Validation Studio sur le Lenovo existant

Le contrôle complet de Studio utilise le runner `selen-lenovo` dans le dépôt `crislilredaction-commits/selen-editions-site`, sur la branche de contrôle `fix/studio-lenovo-validation-20261003`. Cette branche de contrôle ne doit pas être fusionnée dans Daily.

Pour chaque commit Studio à valider :

1. Renseigner le SHA complet de ce commit dans la matrice du workflow `.github/workflows/selen-local-check.yml` de la branche de contrôle Daily, puis publier un seul changement cohérent.
2. Le workflow récupère `crislilredaction-commits/selen-studio` au SHA demandé et vérifie `git rev-parse HEAD`. Les jobs utilisent les labels existants `self-hosted, Linux, X64, selen-local`, la file `selen-codex-runner` et une matrice exécutée successivement.
3. Il exécute `npm ci`, `npm test`, `npm run typecheck` et `npm run build`, avec les mêmes valeurs factices de compilation. Aucun email réel de recette ni clé de production.
4. La session GitHub CLI déjà disponible au Lenovo publie sur ce SHA Studio le contexte `Selen local check / build-and-test`, avec le lien vers le run Daily. Le résultat commence à `pending` ; il passe à `success` uniquement après tous les contrôles réussis. Tout échec ou contrôle incomplet donne `failure`. Si la publication n'est pas possible, le job échoue et la fusion reste bloquée. Ne jamais ajouter de secret ou élargir les droits pour contourner cet échec.
5. Avant fusion, vérifier le head courant, son statut Lenovo et Vercel, les preuves du run et l'absence de contrôle échoué ou en attente. Après fusion, refaire la validation sur le SHA main exact et vérifier la production.

Le workflow Studio qui tentait d'affecter directement ces mêmes labels est remplacé par ce raccord effectif : un runner rattaché à un seul dépôt ne reçoit pas les jobs d'un autre dépôt. Les anciens runs en file sur des commits remplacés ne constituent pas une validation des nouveaux heads. Aucun test n'est supprimé, ignoré ou affaibli par ce déplacement du contrôle.

Référence : https://docs.github.com/en/actions/concepts/runners/self-hosted-runners
