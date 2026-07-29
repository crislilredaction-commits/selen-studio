import type {
  ActivityType,
  AgentState,
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
