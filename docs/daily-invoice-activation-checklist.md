# Activation de la facturation Selen Daily

## Décision avant production

Les deux interrupteurs restent désactivés. Fusion, application des migrations, activation et traitement de paiements historiques sont des opérations distinctes. Obtenir l'accord explicite de Lil pour la fusion et pour la production.

Stripe Billing crée une Invoice à chaque échéance. Pour les trois échéances rapprochées le 18 novembre 2026, le compte Selen présente effectivement trois numéros, trois PDF et trois paiements de 69 €. Désactiver les emails Stripe ne supprime aucun de ces documents. Faire examiner un PDF de chaque système, l’identité de l’émetteur, le régime de TVA, la mise à disposition dans le portail Stripe, les communications et les obligations de facturation électronique applicables. Faire valider et consigner un dispositif dans lequel seule la facture Gestion Lil est émise fiscalement pour chaque prestation. Si le dispositif actuel ne le permet pas, conserver les interrupteurs fermés et adapter le flux de paiement avant la bascule.

Sources : [cycle de facturation Stripe](https://docs.stripe.com/billing/invoices/subscription), [mentions obligatoires françaises](https://entreprendre.service-public.gouv.fr/vosdroits/F31808), [facturation électronique](https://entreprendre.service-public.gouv.fr/vosdroits/F23208).

## Rapprochement initial

| Gestion Lil | Début inclus | Fin incluse | Montant payé |
|---|---|---|---:|
| F000435 | 14/09/2026 | 13/10/2026 | 69 € |
| F000436 | 14/10/2026 | 13/11/2026 | 69 € |
| F000437 | 14/11/2026 | 13/12/2026 | 69 € |

Les trois PDF existants ont été comparés aux trois Invoice Stripe du même abonnement. La migration du registre conserve les empreintes SHA-256 des identifiants et des numéros Stripe, les bornes UTC exactes, le numéro Lil et le montant. Elle ne réserve aucun numéro. Un rejeu correspondant est acquitté sans génération ni envoi. Toute divergence exige un rapprochement.

1. Exporter et sauvegarder le registre Gestion Lil. Vérifier la continuité des numéros, la présence des originaux archivés, le dernier numéro réellement utilisé et le compteur commun. La borne 437 protège uniquement ces documents identifiés. Si d’autres factures ont été émises, leur numéro le plus élevé fait foi. En cas d’écart, arrêter et réconcilier avant toute allocation. Conserver les originaux, y compris ceux émis hors de l’application.
2. Pour chaque abonnement existant, rapprocher son identifiant Stripe, le customer et l’UUID Studio de l’organisation. Examiner les factures déjà émises, enregistrer les autres correspondances dans `lil_daily_prior_payments` selon le format de la migration, puis renseigner `lil_daily_billing_accounts.first_unbilled_period_start` avec le début exact du premier cycle non facturé. Pour les trois lignes ci-dessus, la dernière borne exclusive est le 14 décembre à 18:50:51 UTC. Vérifier la couverture des échéances ultérieures à la date effective de bascule.
3. Vérifier raison sociale, SIRET, adresse postale complète, email administratif, émetteur et exonération de TVA dans Gestion Lil. Un abonnement neuf créé après la bascule est relié par le checkout au dossier Studio existant. Si le profil est incomplet ou si les événements arrivent dans le désordre, compléter le profil ou attendre le rattachement puis rejouer le même événement.

## Ordre de mise en service après validation

1. Dans un environnement dédié, installer les deux branches et leurs dépendances. Exécuter depuis Studio `node scripts/recipe-daily-invoices.mjs ../selen-editions-site`. Les identités, le paiement, le stockage et le transport email sont isolés. Les migrations, le webhook, le générateur PDF, les contrôles de reprise et l’allocateur sont exécutés. Le workflow « Daily invoice concurrency » exerce également la transaction avec plusieurs connexions PostgreSQL.
2. Pour une recette des prestataires, utiliser exclusivement un compte Stripe test, un projet Supabase dédié, un domaine ou collecteur email de recette et des organisations fictives. Interdire les clés live. Vérifier le téléchargement propriétaire et le refus d'accès à un autre utilisateur. Contrôler les journaux de livraison et la pièce jointe.
3. Confirmer que Daily et Studio utilisent les mêmes tables Studio pour les organisations et le registre. Exécuter le précontrôle en lecture seule `docs/daily-invoice-schema-preflight.sql`. Vérifier les accès privés de Storage, les sauvegardes et la présence des fonctions de numérotation et des colonnes requises. Appliquer, après autorisation, les migrations `20261118120000` puis `20261118130000`. En cas d’erreur, interrompre la bascule.
4. Configurer uniquement côté serveur le même secret aléatoire d’au moins 32 caractères dans `SELEN_DAILY_INVOICE_INTERNAL_SECRET`. Daily utilise l’URL HTTPS Studio complète `SELEN_STUDIO_DAILY_INVOICE_ISSUE_URL` terminée par `/api/internal/daily-invoices/issue` et une date ISO UTC `SELEN_DAILY_INVOICE_CUTOVER_AT`. Studio utilise sa clé Stripe du même compte, ses accès Supabase serveur et son expéditeur Resend vérifié. Souscrire le webhook Daily signé aux événements `invoice.paid` ainsi qu’aux événements checkout déjà utilisés.
5. Après décision fiscale et autorisation de production, activer Studio (`SELEN_DAILY_INVOICE_ISSUE_ENABLED=true`), puis Daily (`SELEN_DAILY_INVOICE_FORWARD_ENABLED=true`). Contrôler la première échéance autorisée dans Stripe, le registre, Gestion Lil, Storage privé et Resend. Comparer centimes, période, numéro et destinataire. Inventorier les événements acquittés pendant toute interruption du transfert et les rejouer après rapprochement.

## Reprise et arrêt

- Avant allocation, un profil incomplet, une période ambiguë ou une facture hors du cas pris en charge entraîne une erreur. Le flux automatique couvre les échéances Daily en EUR à ligne unique, le montant net effectivement encaissé par carte et les remises compatibles avec le régime sans TVA. Les factures composites, les proratas, les crédits, la TVA positive, les charges contestées ou remboursées demandent un traitement comptable. La correction d'une facture émise et la création d’un avoir restent des opérations distinctes.
- Après allocation, rechercher par identifiant de facture Stripe dans `lil_daily_invoice_links`. En cas d’échec d’archivage ou d’envoi, rejouer le même événement signé, vérifier le numéro existant et consulter `email_status`, `email_first_attempt_at`, `email_provider_id` et `email_sent_at`. Le mode silencieux de l’organisation s’applique. Ne jamais remettre une facture à l’état de brouillon pour la renvoyer.
- Si Resend a pu accepter l’email, le même PDF archivé et la même clé sont réutilisés pendant 23 heures après la première tentative. Au-delà, vérifier les journaux Resend par numéro, destinataire et horodatage. Si accepté, enregistrer la confirmation avec `mark_daily_invoice_sent` et son identifiant fournisseur. Si l’absence d’envoi est établie, consigner la preuve, réarmer uniquement la tentative d’email de cette facture et rejouer. Si le résultat reste ambigu, suspendre l’envoi. [Durée de déduplication Resend](https://resend.com/docs/dashboard/emails/idempotency-keys)
- Les confirmations enregistrent l’acceptation du fournisseur. Contrôler les rebonds dans Resend. Suivre les erreurs de livraison du webhook Stripe, y compris après expiration de ses retries automatiques. Pour arrêter, couper le transfert puis l’émission, conserver tous les registres, numéros et fichiers, et relever l’intervalle à rapprocher.
