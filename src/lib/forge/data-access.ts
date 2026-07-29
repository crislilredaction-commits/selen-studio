import { createClient } from "@/lib/supabase/client";
import type {
  ActivityEntry,
  ActivityType,
  CheckResult,
  Correction,
  Mission,
  MissionBrief,
  MissionPlan,
  MissionPlanDraft,
  MissionPlanStatus,
  MissionReport,
  MissionReportStatus,
  MissionPriority,
  MissionStatus,
  ReportCheckStatus,
  ReportManualTestItem,
  ReportRisk,
  ValidationItem,
} from "./types";
import { buildDemoMissionReport } from "./report-generator";

type ForgeValidationRow = {
  id: string;
  label: string;
  position: number;
  checked: boolean;
  result: CheckResult;
  note: string | null;
  checked_at: string | null;
  updated_at: string;
};

type ForgeActivityRow = {
  id: string;
  event_type: ActivityType;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ForgeCorrectionRow = {
  id: string;
  content: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
};

type ForgeReportRow = {
  id: string;
  mission_id: string;
  status: MissionReportStatus;
  summary: string | null;
  markdown_content: string | null;
  files_created: number;
  files_modified: number;
  files_deleted: number;
  lint_status: ReportCheckStatus | null;
  build_status: ReportCheckStatus | null;
  tests_status: ReportCheckStatus | null;
  git_repository: string | null;
  git_branch: string | null;
  commit_sha: string | null;
  commit_message: string | null;
  preview_url: string | null;
  risks: ReportRisk[] | null;
  limitations: string[] | null;
  manual_test_items: ReportManualTestItem[] | null;
  next_recommendation: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

type ForgeBriefRow = {
  id: string;
  source_request: string;
  source_context: string | null;
  source_constraints: string | null;
  created_at: string;
  updated_at: string;
};

type ForgePlanRow = {
  id: string;
  mission_id: string;
  version: number;
  is_current: boolean;
  status: MissionPlanStatus;
  proposed_title: string;
  summary: string;
  functional_objective: string;
  included_scope: string[];
  excluded_scope: string[];
  constraints: string[];
  repository_areas: string[];
  technical_dependencies: string[];
  risks: MissionPlan["risks"];
  blocking_questions: string[];
  non_blocking_questions: string[];
  assumptions: string[];
  recommendations: string[];
  acceptance_criteria: string[];
  execution_steps: MissionPlan["executionSteps"];
  verification_plan: string[];
  markdown_content: string;
  created_by: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
};

type ForgeMissionRow = {
  id: string;
  title: string;
  project_key: string | null;
  description: string | null;
  objective: string | null;
  scope: string | null;
  expected_result: string | null;
  priority: MissionPriority;
  status: MissionStatus;
  progress: number | null;
  git_branch: string | null;
  preview_url: string | null;
  created_at: string;
  planning_required: boolean;
  planning_validated_at: string | null;
  paused_at: string | null;
  resumed_at: string | null;
  forge_activity_logs?: ForgeActivityRow[];
  forge_validation_items?: ForgeValidationRow[];
  forge_corrections?: ForgeCorrectionRow[];
  forge_mission_reports?: ForgeReportRow | ForgeReportRow[] | null;
  forge_mission_briefs?: ForgeBriefRow | ForgeBriefRow[] | null;
  forge_mission_plans?: ForgePlanRow[];
};

function parseScope(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Les anciennes valeurs texte restent lisibles.
  }
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

function mapValidation(row: ForgeValidationRow): ValidationItem {
  return {
    id: row.id,
    label: row.label,
    checked: row.checked,
    result: row.result,
    note: row.note ?? undefined,
    checkedAt: row.checked_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

function mapActivity(row: ForgeActivityRow): ActivityEntry {
  const status = row.metadata?.status;
  return {
    id: row.id,
    occurredAt: row.created_at,
    type: row.event_type,
    message: row.message,
    status: typeof status === "string" ? (status as MissionStatus) : undefined,
  };
}

function mapCorrection(row: ForgeCorrectionRow): Correction {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
  };
}

function mapReport(row: ForgeReportRow): MissionReport {
  return {
    id: row.id,
    missionId: row.mission_id,
    status: row.status,
    summary: row.summary ?? "",
    markdownContent: row.markdown_content ?? "",
    filesCreated: row.files_created,
    filesModified: row.files_modified,
    filesDeleted: row.files_deleted,
    lintStatus: row.lint_status ?? undefined,
    buildStatus: row.build_status ?? undefined,
    testsStatus: row.tests_status ?? undefined,
    gitRepository: row.git_repository ?? undefined,
    gitBranch: row.git_branch ?? undefined,
    commitSha: row.commit_sha ?? undefined,
    commitMessage: row.commit_message ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    risks: Array.isArray(row.risks) ? row.risks : [],
    limitations: Array.isArray(row.limitations) ? row.limitations : [],
    manualTestItems: Array.isArray(row.manual_test_items) ? row.manual_test_items : [],
    nextRecommendation: row.next_recommendation ?? undefined,
    generatedAt: row.generated_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBrief(row: ForgeBriefRow): MissionBrief {
  return {
    id: row.id,
    sourceRequest: row.source_request,
    sourceContext: row.source_context ?? "",
    sourceConstraints: row.source_constraints ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPlan(row: ForgePlanRow): MissionPlan {
  return {
    id: row.id,
    missionId: row.mission_id,
    version: row.version,
    isCurrent: row.is_current,
    status: row.status,
    proposedTitle: row.proposed_title,
    summary: row.summary,
    functionalObjective: row.functional_objective,
    includedScope: row.included_scope ?? [],
    excludedScope: row.excluded_scope ?? [],
    constraints: row.constraints ?? [],
    repositoryAreas: row.repository_areas ?? [],
    technicalDependencies: row.technical_dependencies ?? [],
    risks: row.risks ?? [],
    blockingQuestions: row.blocking_questions ?? [],
    nonBlockingQuestions: row.non_blocking_questions ?? [],
    assumptions: row.assumptions ?? [],
    recommendations: row.recommendations ?? [],
    acceptanceCriteria: row.acceptance_criteria ?? [],
    executionSteps: row.execution_steps ?? [],
    verificationPlan: row.verification_plan ?? [],
    markdownContent: row.markdown_content,
    createdBy: row.created_by ?? undefined,
    validatedBy: row.validated_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    validatedAt: row.validated_at ?? undefined,
  };
}

function mapMission(row: ForgeMissionRow): Mission {
  const checklist = [...(row.forge_validation_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(mapValidation);
  const lastVerifiedAt = checklist
    .map((item) => item.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const reportRow = Array.isArray(row.forge_mission_reports)
    ? row.forge_mission_reports[0]
    : row.forge_mission_reports;
  const briefRow = Array.isArray(row.forge_mission_briefs)
    ? row.forge_mission_briefs[0]
    : row.forge_mission_briefs;
  const planHistory = [...(row.forge_mission_plans ?? [])]
    .sort((a, b) => b.version - a.version)
    .map(mapPlan);

  return {
    id: row.id,
    title: row.title,
    project: row.project_key ?? "Selen Studio",
    description: row.description ?? "",
    createdAt: row.created_at,
    priority: row.priority,
    status: row.status,
    progress: row.progress ?? undefined,
    objective: row.objective ?? "",
    scope: parseScope(row.scope),
    announcedResult: row.expected_result ?? "",
    branch: row.git_branch ?? undefined,
    previewUrl: row.preview_url ?? undefined,
    activities: [...(row.forge_activity_logs ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(mapActivity),
    checklist,
    corrections: [...(row.forge_corrections ?? [])]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map(mapCorrection),
    report: reportRow ? mapReport(reportRow) : undefined,
    planningRequired: row.planning_required ?? false,
    planningValidatedAt: row.planning_validated_at ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    resumedAt: row.resumed_at ?? undefined,
    brief: briefRow ? mapBrief(briefRow) : undefined,
    currentPlan: planHistory.find((plan) => plan.isCurrent),
    planHistory,
    lastVerifiedAt,
  };
}

const missionSelection = `
  *,
  forge_activity_logs (*),
  forge_validation_items (*),
  forge_corrections (*),
  forge_mission_reports (*),
  forge_mission_briefs (*),
  forge_mission_plans (*)
`;

export async function listMissions(agentKey = "cody"): Promise<Mission[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forge_missions")
    .select(missionSelection)
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ForgeMissionRow[]).map(mapMission);
}

export async function getMissionDetails(missionId: string): Promise<Mission> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("forge_missions")
    .select(missionSelection)
    .eq("id", missionId)
    .single();

  if (error) throw new Error(error.message);
  return mapMission(data as unknown as ForgeMissionRow);
}

export async function updateValidationItem(
  itemId: string,
  patch: Partial<Pick<ValidationItem, "checked" | "result" | "note">>,
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = {};
  if (patch.checked !== undefined) {
    payload.checked = patch.checked;
    payload.checked_at = patch.checked ? new Date().toISOString() : null;
  }
  if (patch.result !== undefined) payload.result = patch.result;
  if (patch.note !== undefined) payload.note = patch.note.trim() || null;

  const { error } = await supabase
    .from("forge_validation_items")
    .update(payload)
    .eq("id", itemId)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
}

export async function addCorrection(missionId: string, content: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_add_correction", {
    p_mission_id: missionId,
    p_content: content,
  });
  if (error) throw new Error(error.message);
}

export async function validateMission(missionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_validate_mission", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
}

export async function addActivityLog(
  missionId: string,
  eventType: ActivityType,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("forge_activity_logs").insert({
    mission_id: missionId,
    event_type: eventType,
    message,
    metadata,
  });
  if (error) throw new Error(error.message);
}

export type NewPlanningMissionInput = {
  title: string;
  sourceRequest: string;
  sourceContext: string;
  sourceConstraints: string;
  priority: MissionPriority;
};

export async function createPlanningMission(
  input: NewPlanningMissionInput,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("forge_create_planning_mission", {
    p_title: input.title || null,
    p_source_request: input.sourceRequest,
    p_source_context: input.sourceContext || null,
    p_source_constraints: input.sourceConstraints || null,
    p_priority: input.priority,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function setPlanningAnalysisState(
  missionId: string,
  state: "draft" | "analyzing",
  message: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_set_planning_analysis_state", {
    p_mission_id: missionId,
    p_state: state,
    p_message: message,
  });
  if (error) throw new Error(error.message);
}

export async function requestMissionPlan(
  input: NewPlanningMissionInput,
): Promise<MissionPlanDraft> {
  const response = await fetch("/agent/api/forge/planning", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestedTitle: input.title,
      sourceRequest: input.sourceRequest,
      sourceContext: input.sourceContext,
      sourceConstraints: input.sourceConstraints,
      priority: input.priority,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload?.plan) {
    throw new Error(payload?.error ?? "La génération du cadrage a échoué.");
  }
  return {
    proposedTitle: payload.plan.proposed_title,
    summary: payload.plan.summary,
    functionalObjective: payload.plan.functional_objective,
    includedScope: payload.plan.included_scope,
    excludedScope: payload.plan.excluded_scope,
    constraints: payload.plan.constraints,
    repositoryAreas: payload.plan.repository_areas,
    technicalDependencies: payload.plan.technical_dependencies,
    risks: payload.plan.risks,
    blockingQuestions: payload.plan.blocking_questions,
    nonBlockingQuestions: payload.plan.non_blocking_questions,
    assumptions: payload.plan.assumptions,
    recommendations: payload.plan.recommendations,
    acceptanceCriteria: payload.plan.acceptance_criteria,
    executionSteps: payload.plan.execution_steps,
    verificationPlan: payload.plan.verification_plan,
    markdownContent: payload.plan.markdown_content,
  };
}

function planPayload(plan: MissionPlanDraft) {
  return {
    proposed_title: plan.proposedTitle,
    summary: plan.summary,
    functional_objective: plan.functionalObjective,
    included_scope: plan.includedScope,
    excluded_scope: plan.excludedScope,
    constraints: plan.constraints,
    repository_areas: plan.repositoryAreas,
    technical_dependencies: plan.technicalDependencies,
    risks: plan.risks,
    blocking_questions: plan.blockingQuestions,
    non_blocking_questions: plan.nonBlockingQuestions,
    assumptions: plan.assumptions,
    recommendations: plan.recommendations,
    acceptance_criteria: plan.acceptanceCriteria,
    execution_steps: plan.executionSteps,
    verification_plan: plan.verificationPlan,
    markdown_content: plan.markdownContent,
  };
}

export async function storeMissionPlan(
  missionId: string,
  plan: MissionPlanDraft,
  action: "generate" | "regenerate" | "edit" | "draft",
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_store_mission_plan", {
    p_mission_id: missionId,
    p_plan: planPayload(plan),
    p_action: action,
  });
  if (error) throw new Error(error.message);
}

export async function validateMissionPlan(missionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_validate_mission_plan", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
}

export async function updateMissionPriority(
  missionId: string,
  priority: MissionPriority,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_update_mission_priority", {
    p_mission_id: missionId,
    p_priority: priority,
  });
  if (error) throw new Error(error.message);
}

export async function pauseMission(missionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_pause_mission", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
}

export async function resumeMission(missionId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("forge_resume_mission", {
    p_mission_id: missionId,
  });
  if (error) throw new Error(error.message);
}

export async function generateDemoMissionReport(mission: Mission): Promise<void> {
  const supabase = createClient();
  const draft = buildDemoMissionReport(mission);
  const { data: existing, error: lookupError } = await supabase
    .from("forge_mission_reports")
    .select("id")
    .eq("mission_id", mission.id)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  const payload = {
    mission_id: mission.id,
    status: "generating" as const,
    summary: draft.summary,
    markdown_content: draft.markdownContent,
    files_created: draft.filesCreated,
    files_modified: draft.filesModified,
    files_deleted: draft.filesDeleted,
    lint_status: draft.lintStatus,
    build_status: draft.buildStatus,
    tests_status: draft.testsStatus,
    git_repository: draft.gitRepository || null,
    git_branch: draft.gitBranch || null,
    commit_sha: draft.commitSha || null,
    commit_message: draft.commitMessage || null,
    preview_url: draft.previewUrl || null,
    risks: draft.risks,
    limitations: draft.limitations,
    manual_test_items: draft.manualTestItems,
    next_recommendation: draft.nextRecommendation,
    generated_at: draft.generatedAt,
  };

  try {
    const { error: upsertError } = await supabase
      .from("forge_mission_reports")
      .upsert(payload, { onConflict: "mission_id" });
    if (upsertError) throw upsertError;

    const { error: readyError } = await supabase
      .from("forge_mission_reports")
      .update({ status: "ready", generated_at: draft.generatedAt })
      .eq("mission_id", mission.id);
    if (readyError) throw readyError;

    await addActivityLog(
      mission.id,
      existing ? "report_updated" : "report_generated",
      existing ? "Rapport de Cody régénéré" : "Rapport de Cody généré",
      { report_status: "ready" },
    );
  } catch (error) {
    await supabase
      .from("forge_mission_reports")
      .update({ status: "failed" })
      .eq("mission_id", mission.id);
    await addActivityLog(
      mission.id,
      "report_failed",
      "La génération du rapport de Cody a échoué",
      { report_status: "failed" },
    ).catch(() => undefined);
    throw new Error(error instanceof Error ? error.message : "Report generation failed");
  }
}
