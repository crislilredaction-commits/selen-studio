# Contrôle de promotion RLS historique — 24 août 2026

## Périmètre

Contrôle en lecture/transaction sur le projet Supabase **Selen Studio** pour les dix tables historiques :

- `profiles`
- `dossiers`
- `dossier_assignments`
- `formations`
- `documents`
- `nda_variables`
- `messages`
- `internal_messages`
- `program_ai_analyses`
- `dossier_program_versions`

Le candidat testé correspond au modèle du brouillon `docs/security/legacy-table-rls-hardening-draft.sql` : activation RLS sur les dix tables, suppression de tous les privilèges `anon`, retrait de `TRUNCATE`, `REFERENCES` et `TRIGGER` pour `authenticated`, politique self-read minimale sur `profiles`, et accès métier direct réservé au staff via `public.daily_is_selen_staff()`.

## Exécution contrôlée

Le candidat a été appliqué **uniquement à l'intérieur d'une transaction PostgreSQL**, puis annulé avec `ROLLBACK`.

Résultat pendant la transaction :

| Contrôle | Résultat attendu | Résultat obtenu |
| --- | ---: | ---: |
| Tables avec RLS activé | 10 | 10 |
| Tables sans privilège direct `anon` | 10 | 10 |
| Tables sans privilège dangereux `authenticated` | 10 | 10 |
| Policies `legacy_%` | 11 | 11 |
| Policies staff `legacy_%_staff_all` | 10 | 10 |

## Contrôle après rollback

Un second contrôle a été exécuté immédiatement après la transaction afin de vérifier qu'aucune modification n'avait persisté.

| Contrôle | État observé après rollback |
| --- | ---: |
| Tables historiques avec RLS activé | 0 |
| Policies `legacy_%` persistées | 0 |
| Tables conservant actuellement le `SELECT` direct pour `anon` | 10 |

Le projet de production est donc resté inchangé.

## Compatibilité applicative

Le correctif Vitrine dédié à la messagerie NDA en mode assistance agent est préparé séparément sur `selen-editions-site` dans la PR #70. Il transmet le contexte d'assistance au garde serveur et rend la messagerie en lecture seule pendant l'assistance, afin qu'un agent ne puisse ni écrire au nom du client ni confirmer une lecture à sa place.

Ce point ferme le défaut de compatibilité identifié lors de l'audit des routes NDA, mais il n'est pas encore intégré à la branche de production au moment de ce contrôle.

## Conclusion

Le **candidat SQL** passe à nouveau le contrôle transactionnel structurel et le rollback est propre. La migration permanente ne doit toutefois pas être appliquée avant que les garde-fous applicatifs dépendants soient intégrés dans les branches déployées et qu'une recette NDA authentifiée finale soit effectuée sur une preview sûre.

### À valider avec Lil

Aucune décision métier nouvelle. L'intégration vers la production et l'application permanente de la migration restent des checkpoints sensibles séparés.