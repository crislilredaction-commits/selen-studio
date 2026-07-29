export type AgentState = "available" | "in_progress" | "paused" | "blocked";

export type MissionStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "deployed"
  | "to_review"
  | "changes_requested"
  | "validated"
  | "blocked";

export type MissionPriority = "low" | "normal" | "high" | "urgent";

export type ActivityType =
  | "mission_received"
  | "analysis"
  | "development"
  | "test"
  | "error"
  | "correction"
  | "build"
  | "deployment"
  | "blocked"
  | "completed";

export type CheckResult = "compliant" | "issue" | "not_applicable" | null;

export type ValidationItem = {
  id: string;
  label: string;
  checked: boolean;
  result: CheckResult;
  note?: string;
};

export type ActivityEntry = {
  id: string;
  occurredAt: string;
  type: ActivityType;
  message: string;
  status?: MissionStatus;
};

export type Correction = {
  id: string;
  content: string;
  createdAt: string;
};

export type Mission = {
  id: string;
  title: string;
  project: string;
  description: string;
  createdAt: string;
  priority: MissionPriority;
  status: MissionStatus;
  progress?: number;
  objective: string;
  scope: string[];
  announcedResult: string;
  branch?: string;
  previewUrl?: string;
  activities: ActivityEntry[];
  checklist: ValidationItem[];
  corrections: Correction[];
  lastVerifiedAt?: string;
};
