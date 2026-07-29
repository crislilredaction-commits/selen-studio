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
  ready: "Prête",
  in_progress: "En cours",
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
};

export const missionFilters = [
  { value: "all", label: "Toutes" },
  { value: "in_progress", label: "En cours" },
  { value: "to_review", label: "À vérifier" },
  { value: "changes_requested", label: "À corriger" },
  { value: "validated", label: "Validées" },
  { value: "blocked", label: "Bloquées" },
] as const;
