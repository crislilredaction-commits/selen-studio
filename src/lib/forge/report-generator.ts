import type {
  Mission,
  ReportCheckStatus,
  ReportManualTestItem,
  ReportRisk,
} from "./types";

export type MissionReportDraft = {
  summary: string;
  markdownContent: string;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  lintStatus: ReportCheckStatus;
  buildStatus: ReportCheckStatus;
  testsStatus: ReportCheckStatus;
  gitRepository: string;
  gitBranch: string;
  commitSha: string;
  commitMessage: string;
  previewUrl: string;
  risks: ReportRisk[];
  limitations: string[];
  manualTestItems: ReportManualTestItem[];
  nextRecommendation: string;
  generatedAt: string;
};

function lineList(values: string[], fallback = "Non renseigné"): string {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : `- ${fallback}`;
}

function checkLabel(status: ReportCheckStatus): string {
  const labels: Record<ReportCheckStatus, string> = {
    pending: "En attente",
    passed: "Réussi",
    failed: "Échec",
    warnings: "Réussi avec avertissements",
    not_run: "Non exécuté",
  };
  return labels[status];
}

function missionStatusLabel(status: Mission["status"]): string {
  return status === "validated" ? "Validée" : status;
}

export function buildDemoMissionReport(mission: Mission): MissionReportDraft {
  const generatedAt = new Date().toISOString();
  const manualTestItems: ReportManualTestItem[] = mission.checklist.map((item) => ({
    label: item.label,
    priority: "high",
    state: item.checked
      ? item.result === "issue"
        ? "failed"
        : item.result === "not_applicable"
          ? "not_applicable"
          : "passed"
      : "pending",
    result: item.result ?? "Non renseigné",
    note: item.note ?? "",
  }));
  const risks: ReportRisk[] = [
    {
      level: "medium",
      description: "Le rapport est produit à partir des données disponibles dans La Forge.",
      impact: "Les informations Git et les résultats automatisés peuvent être incomplets.",
      recommendation: "Faire relire le rapport et compléter les champs lors de la future connexion à Codex.",
    },
  ];
  const limitations = [
    "Génération de démonstration locale, sans appel à Codex ni à une API externe.",
    "Liste détaillée des fichiers et hash Git non collectés automatiquement.",
    "Les résultats lint et build ne sont pas exécutés par cette action navigateur.",
  ];
  const lintStatus: ReportCheckStatus = "not_run";
  const buildStatus: ReportCheckStatus = "not_run";
  const testsStatus: ReportCheckStatus = manualTestItems.some((item) => item.state === "failed")
    ? "failed"
    : manualTestItems.some((item) => item.state === "pending")
      ? "warnings"
      : "passed";
  const summary = [
    `Rapport de démonstration généré pour « ${mission.title} ».`,
    `${manualTestItems.filter((item) => item.state === "passed").length}/${manualTestItems.length} vérifications utilisateur réussies.`,
    "Aucun service externe n’a été appelé.",
  ].join(" ");
  const nextRecommendation =
    "Relire le Markdown, compléter les informations Git manquantes et valider les points de test restants.";
  const scope = mission.scope.length ? mission.scope : ["Périmètre non renseigné"];

  const markdownContent = `# Rapport de mission Cody

## Identification
- Identifiant de mission : ${mission.id}
- Titre : ${mission.title}
- Projet : ${mission.project}
- Dépôt ou dépôts concernés : selen-studio
- Branche : ${mission.branch ?? "Non renseignée"}
- Date de début : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(mission.createdAt))}
- Date de fin : ${mission.status === "validated" ? "Mission validée" : "Non renseignée"}
- Statut : ${missionStatusLabel(mission.status)}

## Demande initiale
### Objectif
${mission.objective || "Non renseigné"}

### Périmètre
${lineList(scope)}

### Critères d’acceptation
${lineList(mission.checklist.map((item) => item.label))}

### Interdictions
- Ne pas déclencher de déploiement en production depuis La Forge.
- Ne pas exposer de secret ou de clé de service.
- Ne pas appeler de service externe pour cette génération de démonstration.

## Travail réalisé
### Résumé
${summary}

### Fichiers créés
- Aucun fichier collecté automatiquement.

### Fichiers modifiés
- Aucun fichier collecté automatiquement.

### Fichiers supprimés
- Aucun.

### Rôle de chaque fichier important
- Non disponible dans la génération de démonstration.

### Logique ajoutée
- Rapport structuré persistant, consultable, copiable et téléchargeable.

### Logique retirée
- Aucune.

## Base de données
- Migrations créées : non collectées automatiquement.
- Migrations appliquées ou non : à confirmer lors de la revue technique.
- Tables : forge_mission_reports, forge_missions, forge_activity_logs.
- Colonnes : synthèse, Markdown, résultats qualité, Git, risques, limites et tests manuels.
- Fonctions : aucune fonction métier créée par cette génération.
- Triggers : mise à jour horodatée et obsolescence du rapport.
- Politiques RLS : accès réservé aux agents et admins Studio actifs.
- Grants : CRUD authentifié strict, aucun accès anon.
- Données modifiées : rapport de la mission et entrée de journal.
- Risques : informations techniques simulées tant que Codex n’est pas connecté.

## Sécurité
- Authentification : session Studio requise.
- Autorisations : profils actifs de rôle agent ou admin.
- Service role : non utilisé dans le navigateur.
- Secrets : aucun secret lu, affiché ou enregistré.
- Accès anon : aucun.
- Contrôles réalisés : RLS, grants, persistance et journal.
- Problèmes détectés : aucun pendant cette génération.
- Corrections apportées : aucune correction de sécurité automatique.

## Tests
- Lint : ${checkLabel(lintStatus)}
- Build : ${checkLabel(buildStatus)}
- Tests automatisés : ${checkLabel("not_run")}
- Tests fonctionnels : ${checkLabel(testsStatus)}
- Tests mobile : à confirmer.
- Tests desktop : à confirmer.
- Résultats exacts : ${manualTestItems.filter((item) => item.state === "passed").length}/${manualTestItems.length} vérifications réussies.
- Avertissements préexistants : non collectés automatiquement.
- Nouveaux avertissements : aucun identifié.

## Git et déploiement
- Dépôt : selen-studio
- Branche : ${mission.branch ?? "Non renseignée"}
- Commit : non renseigné.
- Hash : non renseigné.
- Push : non renseigné.
- Pull request éventuelle : aucune information disponible.
- Preview Vercel : ${mission.previewUrl ?? "Non renseignée"}
- Production modifiée ou non : non.

## Vérifications utilisateur
${manualTestItems.map((item) => `- [${item.state === "passed" ? "x" : " "}] ${item.label}
  - Priorité : ${item.priority}
  - État : ${item.state}
  - Résultat : ${item.result}
  - Note : ${item.note || "Aucune"}`).join("\n")}

## Écarts et limites
### Ce qui n’a pas été réalisé
- Exécution automatique de Cody ou Codex.

### Ce qui reste simulé
- Inventaire Git, résultats lint/build et métadonnées de déploiement.

### Hypothèses
- Les données de mission présentes dans La Forge sont la source de vérité fonctionnelle.

### Blocages
- Aucun blocage applicatif connu.

### Dette technique
- Automatiser la collecte des preuves Git, Supabase, Vercel et tests.

## Risques
${risks.map((risk) => `- Niveau : ${risk.level}
  - Description : ${risk.description}
  - Impact : ${risk.impact}
  - Recommandation : ${risk.recommendation}`).join("\n")}

## Recommandation finale
- Prêt à tester : oui.
- Prêt à valider : après revue humaine.
- Corrections nécessaires : compléter les champs simulés si requis.
- Prochaine mission recommandée : ${nextRecommendation}
`;

  return {
    summary,
    markdownContent,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    lintStatus,
    buildStatus,
    testsStatus,
    gitRepository: "selen-studio",
    gitBranch: mission.branch ?? "",
    commitSha: "",
    commitMessage: "",
    previewUrl: mission.previewUrl ?? "",
    risks,
    limitations,
    manualTestItems,
    nextRecommendation,
    generatedAt,
  };
}
