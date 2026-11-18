# Factures d'abonnement Selen Daily : contrat d'intégration Studio / Daily

Statut : spécification validée par Lil le 18 novembre 2026. **Non implémenté, non testé, non déployé.**

## Source de vérité
- Studio : `src/lib/server/lilInvoices.ts`, `lil_invoices`, `lil_invoice_sequence`, RPC `next_lil_invoice_number`.
- Numérotation unique avec les factures Gestion Lil, format `F` suivi de six chiffres. Aucune séquence Daily ou Stripe parallèle.
- Stripe : source de vérité des paiements et périodes d'abonnement, pas du numéro fiscal.
- Vérifier l'identité de l'émetteur et le traitement TVA avant émission.

## Flux automatique
1. Vérifier la signature du webhook Stripe `invoice.paid`, l'abonnement Daily, la période et le paiement.
2. Dédupliquer l'identifiant de facture Stripe dans une transaction DB qui réserve le numéro et crée la facture Lil. Les retries/concurrences ne doivent ni doubler la facture ni gaspiller un numéro.
3. Utiliser le PDF, les paramètres et les mentions légales de Gestion Lil.
4. Conserver la facture dans Gestion Lil, accessible aussi dans l'historique du client Daily avec contrôle d'accès.
5. Envoyer un email unique après paiement, tracer les erreurs et permettre une reprise sans réémettre la facture. Vérifier et désactiver l'envoi redondant éventuel de Stripe.

## Flux manuel dans Studio
- Dans Gestion Lil → Factures, « Facture abonnement Daily » : sélectionner le client Daily et le mois/année de prestation, voir l'état du paiement, préremplir le prix réel et les informations client, modifier les champs autorisés, prévisualiser.
- Créer un brouillon sans réserver de numéro. Réserver le numéro commun uniquement lors de l'émission définitive.
- Option d'envoi email explicite après validation ; jamais de mail automatique sur un simple brouillon.
- Interdire les doublons par client/abonnement/période, y compris lorsqu'une facture automatique existe déjà. Corriger via avoir plutôt que supprimer une facture émise.
- Distinguer période de service, date d'émission et date de paiement. Une facture manuelle non payée n'est pas « acquittée ».

## Intégration sécurisée
- Audit préalable du schéma Supabase partagé ou non entre Studio et Daily.
- Aucune clé `service_role` dans le navigateur. Endpoint authentifié serveur-à-serveur ou worker partagé.
- Ne pas exposer les factures de Gestion Lil à d'autres organismes.

## Tests et livraison
- Tests unitaires et E2E en Stripe testmode, email capture-only, deux OF fictifs A/B.
- Premier paiement, renouvellement, paiement échoué, événement rejoué, événements désordonnés, concurrence avec une facture d'audit, changement de prix, remboursement/avoir, mois ancien, émission manuelle, absence de doublon et isolation OF.
- PR séparées Studio et Daily ; CI et recette avant fusion. Aucun envoi réel ou migration de production avant validation.

Suivi : https://github.com/crislilredaction-commits/selen-editions-site/issues/521
