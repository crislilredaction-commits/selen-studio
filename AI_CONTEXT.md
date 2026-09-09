# AI Context

## Priorité immédiate de validation Studio / Daily — 09/09/2026

Avant les prochains tests utilisateurs, traiter comme critères de recette obligatoires :

1. **Audit UI mobile côté client**
   - auditer l’ensemble du parcours client sur les largeurs mobiles courantes ;
   - conserver ce qui fonctionne déjà bien, puis corriger les incohérences de responsive, marges, tailles de zones tactiles, débordements horizontaux, champs ou boutons qui se superposent ;
   - aligner visuellement les écrans secondaires avec la page d’accueil Daily (typographie, cartes, espacements, titres, boutons, densité et hiérarchie visuelle) ;
   - ne pas considérer une page comme mobile friendly uniquement parce qu’elle ne déborde pas : elle doit rester lisible, manipulable au pouce et cohérente avec Daily.

2. **Espaces des parties prenantes**
   - prochains tests fonctionnels prioritaires : espaces apprenants, formateurs, entreprises/commanditaires et toute autre partie prenante exposée par Daily ;
   - vérifier chaque parcours complet : connexion/accès, navigation, lecture des informations, formulaires, validations, téléchargements, signatures ou confirmations quand applicables, retours d’erreur et états vides ;
   - vérifier les permissions et cloisonnements : une partie prenante ne doit voir que les données qui lui sont destinées ;
   - harmoniser tous ces espaces avec l’identité et l’UI de la page d’accueil Daily.

3. **Emails transactionnels**
   - établir la matrice des étapes qui doivent déclencher un email pour chaque parcours partie prenante ;
   - vérifier dans le code que chaque déclencheur appelle bien le service d’envoi et que les erreurs d’envoi ne sont pas silencieusement perdues ;
   - vérifier destinataire, sujet, contenu, variables, liens, contexte organisation/session/dossier, et absence de données d’une autre organisation ;
   - exécuter des tests réels ou de sandbox contrôlée de bout en bout pour chaque étape critique ; ne pas valider sur la seule présence d’une fonction d’envoi ;
   - vérifier les statuts de livraison côté fournisseur d’email quand disponible et documenter les éventuels échecs ;
   - éviter les doublons d’email sur rechargement, retry ou double clic ; privilégier des déclenchements idempotents quand nécessaire.

4. **Recette avant mise à disposition des tests**
   - tests locaux ciblés + typecheck/lint/build pertinents ;
   - test visuel mobile réel ou via navigateur automatisé sur les principaux parcours ;
   - test d’au moins un parcours complet par type de partie prenante ;
   - test des emails associés à chacune des étapes attendues ;
   - toute régression bloquante doit être corrigée avant de demander à Lil de tester.

## Règles existantes à préserver

- Distinguer strictement contrat de formation professionnelle et convention de formation professionnelle.
- Les modèles tiers servent uniquement de référence structurelle et ne doivent jamais être reproduits mot pour mot ou trop fidèlement.
- Limiter les Preview Deployments Vercel ; privilégier tests locaux et regroupement des corrections.
- Stopper avant toute action destructive, changement sensible d’Auth/sécurité/infrastructure/secrets ou migration destructive.
