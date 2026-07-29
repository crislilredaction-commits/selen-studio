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
  | "completed"
  | "user_validation"
  | "report_generated"
  | "report_updated"
  | "report_failed";

export type MissionReportStatus =
  | "pending"
  | "generating"
  | "ready"
  | "failed"
  | "outdated";

export type ReportCheckStatus =
  | "pending"
  | "passed"
  | "failed"
  | "warnings"
  | "not_run";

export type ReportRisk = {
  level: "low" | "medium" | "high" | "critical";
  description: string;
  impact: string;
  recommendation: string;
};

export type ReportManualTestItem = {
  label: string;
  priority: "low" | "normal" | "high" | "critical";
  state: "pending" | "passed" | "failed" | "not_applicable";
  result: string;
  note: string;
};

export type MissionReport = {
  id: string;
  missionId: string;
  status: MissionReportStatus;
  summary: string;
  markdownContent: string;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  lintStatus?: ReportCheckStatus;
  buildStatus?: ReportCheckStatus;
  testsStatus?: ReportCheckStatus;
  gitRepository?: string;
  gitBranch?: string;
  commitSha?: string;
  commitMessage?: string;
  previewUrl?: string;
  risks: ReportRisk[];
  limitations: string[];
  manualTestItems: ReportManualTestItem[];
  nextRecommendation?: string;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CheckResult = "compliant" | "issue" | "not_applicable" | null;

export type ValidationItem = {
  id: string;
  label: string;
  checked: boolean;
  result: CheckResult;
  note?: string;
  checkedAt?: string;
  updatedAt?: string;
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
  status: "open" | "resolved";
  resolvedAt?: string;
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
  report?: MissionReport;
  lastVerifiedAt?: string;
};
