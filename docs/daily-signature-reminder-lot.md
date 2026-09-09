# Relances de signature Daily — H+72

- La relance est créée par Daily uniquement après un envoi de signature réellement horodaté.
- `due_at` vaut `sent_at + 72 h`.
- Le rappel `daily_signature_pending_72h` reste hors de la file Studio avant son échéance.
- À H+72, il devient visible dans « Clients à relancer » ; la règle existante l'ouvre à toute l'équipe sans modifier l'assignation de l'organisme.
- Une clé de déduplication stable par signature empêche les doublons actifs.
- La signature réelle passe le rappel en `resolved` ; une simple consultation ne le ferme pas.
- La migration partagée ne supprime aucune donnée et ne modifie ni Auth ni RLS.
