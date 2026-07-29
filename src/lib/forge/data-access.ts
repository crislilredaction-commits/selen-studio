import { createClient } from "@/lib/supabase/client";
import type {
  ActivityEntry,
  ActivityType,
  CheckResult,
  Correction,
  Mission,
  MissionPriority,
  MissionStatus,
  ValidationItem,
} from "./types";

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
  forge_activity_logs?: ForgeActivityRow[];
  forge_validation_items?: ForgeValidationRow[];
  forge_corrections?: ForgeCorrectionRow[];
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

function mapMission(row: ForgeMissionRow): Mission {
  const checklist = [...(row.forge_validation_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map(mapValidation);
  const lastVerifiedAt = checklist
    .map((item) => item.checkedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

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
    lastVerifiedAt,
  };
}

const missionSelection = `
  *,
  forge_activity_logs (*),
  forge_validation_items (*),
  forge_corrections (*)
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
