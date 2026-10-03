# Revue Studio des programmes et questionnaires

Le cahier maître demande trois onglets de revue avant validation. La PR Studio #247 est poursuivie depuis son HEAD réellement lu `faf23181a33f247e79219bd73c2bdf9967d1d588` ; les 538 blobs du checkout initial ont été comparés à l’arbre GitHub, sans divergence.

La même revue formation/session expose désormais Programme, Questionnaire de positionnement et Évaluation finale. Le positionnement Selen montre les questions et options réellement configurées, leur type et leur caractère obligatoire. Un questionnaire propre OF conserve son téléchargement privé canonique. L’évaluation intégrée affiche les questions, options, réponses attendues, barème et consignes de l’OF ; le mode externe conserve ses consignes sans afficher d’anciens contenus de quiz. Les contenus absents, historiques ou malformés restent signalés.

La lecture réutilise exclusivement la formation déjà chargée avec `loadScopedDailyFormation` et les gardes existants. Aucune nouvelle lecture distante, route, publication, écriture de questionnaire ou modification de périmètre. Le contenu est échappé par React. Les trois panneaux restent montés lors du changement d’onglet afin de conserver les champs non contrôlés et la saisie avant enregistrement. Navigation clavier, rôles et relations ARIA ; un champ invalide réaffiche son panneau et ouvre ses détails. Les colonnes peuvent se réduire sur petit écran. Programme modifiable selon les statuts existants ; questionnaires consultables pour revue.

Validation locale :

- `npm test` : **356 tests réussis, 0 échec, 0 ignoré**. Les six nouveaux scénarios passent par la vraie revue autorisée et le rendu React réel : configurations exactes, mode privé/externe, refus hors périmètre/inactif, échappement, absence/ancien format, consultation après validation.
- `npm run typecheck` : code 0.
- `npm run build` : code 0, compilation et génération complètes. Variables factices identiques au contrôle Lenovo existant ; aucune clé réelle.
- Contrôle ponctuel des vrais callbacks d’onglets avec hooks isolés : conservation des panneaux/champs, déplacement et bouclage du focus clavier, réouverture du panneau et des détails d’un champ invalide. Ce contrôle ne remplace pas une recette native dans un navigateur authentifié.
- La recette source antérieure conserve ses assertions métier ; seules les deux attentes de texte devenues obsolètes sont alignées sur la revue des questionnaires et « Valider la formation ». Les scénarios d’écriture privée, de concurrence et de lien stable sont conservés.

Cette passe ne termine pas la revalidation côté OF, l’assistance de modification des questionnaires ni le parcours Avant de bout en bout. Aucun email réel, migration, changement Auth/RLS, runner, scheduler, dépendance ou donnée de production. Pas de nouvelle mission Codex pendant le blocage de quota.

La PR #247 reste empilée sur #246. Au dernier contrôle, le Selen local check #5 de #246 est `queued`, sans runner attribué. Attendre les contrôles des HEADs exacts : livrer #246 seulement après réussite et vérification main/production, reprendre #247 sur main, puis valider et fusionner seulement si vert. Les résultats locaux ou une preview prête ne valent pas livraison Studio.
