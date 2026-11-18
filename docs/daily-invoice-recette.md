# Recette de la facturation automatique Daily

Recette du 18 novembre 2026 sur les branches des PR Studio 453 et Daily 522. Aucun paiement, email client, numéro de production ni migration distante n’a été créé pendant les essais.

| Scénario | Résultat attendu et observé dans le banc isolé |
|---|---|
| Signature erronée, émission désactivée | Rejet. Registre et compteur inchangés. |
| Paiement confirmé de 69 € après remise sur 89 € | Charge, client et abonnement revérifiés. La ligne et le total de la facture sont de 6 900 centimes. |
| Cycle du 14 décembre au 14 janvier, heure non nulle | Bornes exactes conservées. La facture indique du 14 décembre au 13 janvier inclus. |
| Archivage indisponible après numérotation | Reprise sur la facture existante. Un seul PDF archivé en privé. |
| Réponse perdue après acceptation de l’email | Même clé et mêmes octets à la relance. Une pièce jointe, un envoi capturé. |
| Huit appels à la même transaction | Même identifiant de facture et un seul numéro pour la nouvelle échéance. |
| Deux échéances différentes avec chevauchement | Une seule transaction acceptée. Le compteur reflète uniquement les transactions réussies. |
| Rejeu d’une échéance déjà facturée historiquement | Confirmation historique, aucun nouvel envoi, document ou numéro. |
| Numérotation commune | Registre de recette initialisé à 437. Après trois émissions synthétiques distinctes, compteur à 440. |

Depuis chaque dépôt, installer les dépendances avec `npm ci`, exécuter `npm test` et le contrôle TypeScript. Depuis Studio, exécuter la recette croisée avec `node scripts/recipe-daily-invoices.mjs ../selen-editions-site`. Les appels inter-applications exercent les deux handlers et les signatures du SDK Stripe. L’allocateur, les migrations fiscales et le générateur PDF sont ceux du dépôt. PostgreSQL embarqué exécute le SQL. Des adaptateurs locaux remplacent l’API Stripe, la couche HTTP PostgREST, Storage et Resend. Le test compare la pièce jointe octet par octet au fichier archivé.

Pour la concurrence sur plusieurs connexions PostgreSQL natives, le workflow dédié démarre un cluster jetable sur socket local. Le mode facultatif accepte le chemin d’un dossier contenant les dépendances de test `embedded-postgres` et `pg` en troisième argument de la commande Node (après le script et le dépôt Daily). Il n’accepte aucune URL de base existante.

Un projet Supabase hébergé et un abonnement Stripe de test permettent, avant activation, de compléter cette recette par le contrôle des politiques effectives du bucket, des droits PostgREST, du portail et des notifications du compte Stripe. Les trois factures historiques du compte réel ont été rapprochées uniquement en lecture. Voir [la procédure d’activation](daily-invoice-activation-checklist.md).
