import type {
  ActivityType,
  AgentState,
  MissionCheckpointKey,
  MissionCheckpointStatus,
  MissionPriority,
  MissionStatus,
} from "./types";

export const agentStateLabels: Record<AgentState, string> = {
  available: "Disponible",
  in_progress: "En cours",
  paused: "En pause",
  blocked: "Bloqué",
};

export const missionStatusLabels: Record<MissionStatus, string> = {
  draft: "À préparer",
  analyzing: "Analyse en cours",
  needs_clarification: "Précisions requises",
  plan_ready: "Cadrage prêt",
  plan_validated: "Cadrage validé",
  ready: "Prête",
  in_progress: "En cours",
  paused: "En pause",
  deployed: "Déployée",
  to_review: "À vérifier",
  changes_requested: "À corriger",
  validated: "Validée",
  blocked: "Bloquée",
};

export const priorityLabels: Record<MissionPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};

export const checkpointLabels: Record<MissionCheckpointKey, string> = {
  analysis_completed: "Analyse terminée",
  plan_generated: "Plan généré",
  plan_validated: "Plan validé",
  branch_created: "Branche créée",
  development_started: "Développement commencé",
  migrations_prepared: "Migrations préparées",
  tests_executed: "Tests exécutés",
  commits_pushed: "Commits poussés",
  preview_created: "Preview créée",
  final_report_produced: "Rapport final produit",
};

export const checkpointStatusLabels: Record<MissionCheckpointStatus, string> = {
  pending: "En attente",
  in_progress: "En cours",
  completed: "Terminé",
  failed: "Échec",
  skipped: "Ignoré",
};

export const activityTypeLabels: Record<ActivityType, string> = {
  mission_received: "Mission reçue",
  analysis: "Analyse",
  development: "Développement",
  test: "Test",
  error: "Erreur",
  correction: "Correction",
  build: "Build",
  deployment: "Déploiement",
  blocked: "Blocage",
  completed: "Mission terminée",
  user_validation: "Validation utilisateur",
  report_generated: "Rapport généré",
  report_updated: "Rapport régénéré",
  report_failed: "Échec du rapport",
  plan_generated: "Cadrage généré",
  plan_updated: "Cadrage mis à jour",
  plan_validated: "Cadrage validé",
  plan_reopened: "Cadrage rouvert",
  plan_failed: "Échec du cadrage",
  priority_changed: "Priorité modifiée",
  mission_paused: "Mission mise en pause",
  mission_resumed: "Mission reprise",
  checkpoint_updated: "Checkpoint mis à jour",
  checkpoint_failed: "Échec de checkpoint",
  incident_detected: "Incident détecté",
  incident_retrying: "Correction en cours",
  incident_resolved: "Incident résolu",
  incident_blocked: "Mission bloquée par un incident",
};

export const missionFilters = [
  { value: "all", label: "Toutes" },
  { value: "draft", label: "Brouillons" },
  { value: "analyzing", label: "Analyse" },
  { value: "needs_clarification", label: "À préciser" },
  { value: "plan_ready", label: "Plans prêts" },
  { value: "plan_validated", label: "Plans validés" },
  { value: "in_progress", label: "En cours" },
  { value: "paused", label: "En pause" },
  { value: "to_review", label: "À vérifier" },
  { value: "changes_requested", label: "À corriger" },
  { value: "validated", label: "Validées" },
  { value: "blocked", label: "Bloquées" },
] as const;
