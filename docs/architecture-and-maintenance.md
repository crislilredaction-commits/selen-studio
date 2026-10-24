# Architecture et Maintenance — Selen Studio

## 1. Organisation du Dépôt
Le projet **Selen Studio** est une application Web bâtie sur **Next.js (App Router)** et **TypeScript**.

### Structure des répertoires :
- `src/app/` : Routes Next.js, pages et handlers d'API (`/api/`, `/agent/`).
- `src/components/` : Composants UI React (composants génériques `ui/`, spécifiques `daily/`, `nda/`, `agent/`).
- `src/lib/` : Utilitaires métiers, règles de calcul, clients Supabase (`client.ts`, `server.ts`) et helpers serveur dans `src/lib/server/`.
- `supabase/migrations/` : Scripts SQL d'évolution de la base de données PostgreSQL / Supabase.
- `tests/` : Suite de tests automatisés basée sur le test runner natif de Node.js (`node --test`).
- `docs/` : Documentation d'architecture, audits et comptes-rendus de recette.

---

## 2. Modules Serveur Principaux (`src/lib/server/`)
- `studioAuth.ts` & `studioAdmin.ts` : Vérification des sessions agents et protection des routes d'administration.
- `dailyAgentTasks.ts` & `dailyPilotageVisibility.ts` : Agrégation des tâches d'exploitation et pilotage transversal pour Selen Daily.
- `clientReminders.ts` & `dailySignatureReminders.ts` : Gestion des relances automatiques et programmées.
- `selenEmailLayout.ts` & `notifications.ts` : Rendu HTML/texte unifié et envoi d'emails via Resend.
- `lilInvoices.ts` : Gestion de la facturation et numérotation séquentielle des pièces comptables.

---

## 3. Authentification & Frontières de Sécurité
- **Authentification :** Gérée via Supabase Auth (sessions JWT / Cookies sécurisés).
- **Contrôle d'accès (RLS) :** La base de données PostgreSQL applique des politiques Row Level Security (RLS) strictes.
- **Rôles distincts :**
  - `authenticated` (agents/utilisateurs connectés avec droits restreints aux organisations/sessions autorisées)
  - `service_role` (utilisé exclusivement côté serveur pour les tâches système et cron automatisés).

---

## 4. Services d'Envoi d'Emails
- **Fournisseur :** Resend (`resend`).
- **Garanties :**
  - Rendu visuel centralisé (`selenEmailLayout.ts`).
  - Protection contre le spam / double envoi via le mécanisme de silence client (`clientNotificationSilence.ts`).
  - Idempotence sur les relances automatisées.

---

## 5. Commandes de Tests et de Validation
- `npm test` : Exécute l'intégralité des 700+ tests unitaires et d'intégration via Node native test runner.
- `npm run typecheck` : Vérifie la validité des types TypeScript sans émission de fichiers (`tsc --noEmit`).
- `npm run lint` : Exécute ESLint pour contrôler le respect des règles de style et de qualité.

---

## 6. Séparation entre Studio et Selen Daily
- **Studio** est l'interface d'administration back-office réservée aux équipes internes et agents pour la gestion globale des dossiers, factures, modèles et configurations.
- **Selen Daily** est le moteur d'exploitation formation (sessions, émargements, preuves Qualiopi, espaces apprenants/formateurs/entreprises).
