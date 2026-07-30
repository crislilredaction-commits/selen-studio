export type AgentState = "available" | "in_progress" | "paused" | "blocked";

export type MissionStatus =
  | "draft"
  | "analyzing"
  | "needs_clarification"
  | "plan_ready"
  | "plan_validated"
  | "ready"
  | "in_progress"
  | "paused"
  | "deployed"
  | "to_review"
  | "changes_requested"
  | "validated"
  | "blocked"
  | "failed"
  | "abandoned"
  | "archived";

export type ForgeAccessLevel = "none" | "viewer" | "admin";

export type ForgeAlertStatus = "unread" | "read" | "action_required" | "resolved" | "archived";
export type ForgeAlertLevel = "information" | "attention" | "important" | "critical";
export type ForgeAlert = {
  id: string;
  type: string;
  level: ForgeAlertLevel;
  title: string;
  message: string;
  companionKey: string;
  missionId?: string;
  incidentId?: string;
  checkpointId?: string;
  planId?: string;
  actionTarget: string;
  actionLabel: string;
  status: ForgeAlertStatus;
  technicalDetails: Record<string, unknown>;
  createdAt: string;
  readAt?: string;
  resolvedAt?: string;
  archivedAt?: string;
};

export type MissionPriority = "low" | "normal" | "high" | "urgent";

export type MissionCheckpointKey =
  | "analysis_completed"
  | "plan_generated"
  | "plan_validated"
  | "branch_created"
  | "development_started"
  | "migrations_prepared"
  | "tests_executed"
  | "commits_pushed"
  | "preview_created"
  | "final_report_produced";

export type MissionCheckpointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "skipped";

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
  | "report_failed"
  | "plan_generated"
  | "plan_updated"
  | "plan_validated"
  | "plan_reopened"
  | "plan_failed"
  | "priority_changed"
  | "mission_paused"
  | "mission_resumed"
  | "checkpoint_updated"
  | "checkpoint_failed"
  | "incident_detected"
  | "incident_retrying"
  | "incident_resolved"
  | "incident_blocked"
  | "human_instruction"
  | "human_decision";

export type MissionIncidentCategory =
  | "warning"
  | "recoverable_error"
  | "critical_error"
  | "human_decision_required";

export type MissionIncidentStatus =
  | "detected"
  | "retrying"
  | "resolved"
  | "blocked"
  | "failed"
  | "ignored_with_justification";

export type MissionIncidentAttempt = {
  id: string;
  attemptNumber: number;
  strategy: string;
  resultStatus: "succeeded" | "failed" | "refused";
  resultMessage: string;
  technicalDetails: Record<string, unknown>;
  planId: string;
  startedAt: string;
  completedAt: string;
};

export type MissionIncident = {
  id: string;
  checkpointId: string;
  actionKey?: string;
  category: MissionIncidentCategory;
  code: string;
  message: string;
  technicalDetails: Record<string, unknown>;
  detectedAt: string;
  attemptCount: number;
  maxAttempts: number;
  resolutionStatus: MissionIncidentStatus;
  resolvedAt?: string;
  correctionStrategy?: string;
  ignoreJustification?: string;
  humanDecisionRequired?: string;
  missionStatusAtDetection: MissionStatus;
  attempts: MissionIncidentAttempt[];
};

export type MissionPlanStatus =
  | "draft"
  | "needs_clarification"
  | "plan_ready"
  | "validated"
  | "rejected"
  | "superseded"
  | "failed";

export type PlanningRisk = {
  level: "low" | "medium" | "high" | "critical";
  label: string;
  detail: string;
};

export type PlanningStep = {
  position: number;
  title: string;
  detail: string;
};

export type MissionBrief = {
  id: string;
  sourceRequest: string;
  sourceContext: string;
  sourceConstraints: string;
  createdAt: string;
  updatedAt: string;
};

export type MissionPlanDraft = {
  proposedTitle: string;
  summary: string;
  functionalObjective: string;
  includedScope: string[];
  excludedScope: string[];
  constraints: string[];
  repositoryAreas: string[];
  technicalDependencies: string[];
  risks: PlanningRisk[];
  blockingQuestions: string[];
  nonBlockingQuestions: string[];
  assumptions: string[];
  recommendations: string[];
  acceptanceCriteria: string[];
  executionSteps: PlanningStep[];
  verificationPlan: string[];
  markdownContent: string;
};

export type MissionPlan = MissionPlanDraft & {
  id: string;
  missionId: string;
  version: number;
  isCurrent: boolean;
  status: MissionPlanStatus;
  createdBy?: string;
  validatedBy?: string;
  createdAt: string;
  updatedAt: string;
  validatedAt?: string;
  previousPlanId?: string;
  changeJustification?: string;
  differenceSummary?: string;
  revalidationReason?: string;
  rejectedAt?: string;
};

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
  agentKey: string;
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
  planningRequired: boolean;
  planningValidatedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  archivedAt?: string;
  archivedBy?: string;
  brief?: MissionBrief;
  currentPlan?: MissionPlan;
  planHistory: MissionPlan[];
  checkpoints: MissionCheckpoint[];
  incidents: MissionIncident[];
  instructions: HumanInstruction[];
  decisions: HumanDecision[];
  executionRuns: ForgeExecutionRun[];
  lastVerifiedAt?: string;
};

export type ForgeExecutionRunStatus =
  | "queued" | "running" | "waiting_for_human"
  | "failed" | "completed" | "cancelled";

export type ForgeExecutionRun = {
  id: string;
  status: ForgeExecutionRunStatus;
  requestedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  attemptCount: number;
  lastError?: string;
  repository: string;
  baseBranch: string;
  targetBranch: string;
  gitCommitSha?: string;
};

export type ControlledEditInstruction = {
  target_path: string;
  operation: "create" | "replace";
  expected_content: string;
  allowed_command: "git_status_short";
  commit_message: string;
};

export type HumanInstruction = {
  id: string;
  missionId: string;
  incidentId?: string;
  planId?: string;
  content: string;
  sensitivity: "minor" | "sensitive";
  status: "recorded" | "acknowledged" | "superseded";
  createdBy: string;
  createdAt: string;
};

export type HumanDecision = {
  id: string;
  missionId: string;
  incidentId?: string;
  planId?: string;
  action: string;
  reason: string;
  consequences: string;
  previousStatus?: MissionStatus;
  resultingStatus?: MissionStatus;
  decidedBy: string;
  decidedAt: string;
};

export type MissionCheckpointHistory = {
  id: string;
  fromStatus?: MissionCheckpointStatus;
  toStatus: MissionCheckpointStatus;
  startedAt?: string;
  completedAt?: string;
  message?: string;
  planId?: string;
  createdAt: string;
};

export type MissionCheckpoint = {
  id: string;
  key: MissionCheckpointKey;
  position: number;
  status: MissionCheckpointStatus;
  startedAt?: string;
  completedAt?: string;
  message?: string;
  planId?: string;
  updatedAt: string;
  history: MissionCheckpointHistory[];
};
