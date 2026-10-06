import type { DailyAgentTask } from "@/lib/server/dailyAgentTasks";

export type DailyTaskPresentation = Pick<
  DailyAgentTask,
  "status" | "priority" | "dueAt" | "context" | "expectedAction"
>;

const STATUS_LABELS: Record<string, string> = {
  unassigned: "Non assignée",
  draft: "Brouillon à traiter",
  review: "À relire",
  open: "Ouverte",
  planned: "Planifiée",
  todo: "À faire",
  in_progress: "En cours",
  to_review: "À vérifier",
  blocked: "Bloquée",
  responses_received: "Réponses reçues",
  summary_to_review: "Synthèse à vérifier",
};

const PRIORITY_LABELS: Record<DailyAgentTask["priority"], string> = {
  urgent: "Urgente",
  high: "Haute",
  normal: "Normale",
};

export function presentDailyTask(task: DailyTaskPresentation) {
  return {
    ...task,
    statusLabel: STATUS_LABELS[task.status] ?? task.status,
    priorityLabel: PRIORITY_LABELS[task.priority],
  };
}
