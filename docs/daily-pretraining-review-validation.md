# Revue des documents avant formation

La revue Studio doit conserver la décision la plus récente et restituer le résultat réel de la notification. Un écran resté ouvert peut désormais recevoir un refus de conflit : l’agent doit relire la pièce courante avant de poursuivre.

- L’écran transmet `expected_updated_at`, issu de la liste réellement ouverte. Une valeur absente, vide, invalide ou périmée est refusée avant toute action.
- La validation et la demande de correction conditionnent l’écriture à l’OF autorisé, à `is_current`, au statut, à la version et à l’horodatage ouvert. Si un autre traitement a changé le document entre lecture et écriture, la réponse est 409 et aucune décision n’est écrasée.
- Le résultat de publication restitue la notification réelle du service existant : un nouvel envoi confirmé et une reprise sans nouvel email ont des messages distincts. La date enregistrée et la référence du service d’envoi restent consultables après rechargement ; elles ne constituent pas une preuve de réception par le destinataire.
- Les boutons de décision restent bloqués pendant une action. Les erreurs réseau sont affichées et permettent une nouvelle tentative ; annuler la demande de correction ne déclenche aucune mutation. Un conflit recharge la liste et conserve la consigne de relecture.

Les douze tests de `dailyPretrainingReviewActions.test.mjs` exécutent le vrai PATCH, le service existant de publication avec transport email isolé, ainsi que le rendu et les callbacks du vrai écran avec hooks isolés. Huit cas échouaient sur la production `79d681da` avant correction. Les contrôles de périmètre agent/OF, le mode silencieux, les preuves et les pièces historiques sont conservés. Le schéma réel confirme `daily_documents.updated_at` non nullable et son déclencheur de mise à jour ; aucune migration n’est nécessaire.

La recette navigateur avec comptes réels reste distincte de ces contrôles. Ce lot ne modifie pas les destinataires, le circuit privé de publication, les routes de téléchargement, les droits, ni les automatismes de signatures. Aucun email réel n’est envoyé pendant les tests. La validation complète du commit exact suit `studio-lenovo-validation.md` avant fusion et après fusion.
