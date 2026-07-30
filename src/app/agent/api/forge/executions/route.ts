import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  executeNextForgeRun,
  validateControlledInstruction,
} from "@/lib/server/forgeExecutionWorker";
import { requireStudioAdmin } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 300;

const branchPattern = /^(audit|feature|test)\/[a-z0-9][a-z0-9._/-]{2,119}$/;

export async function GET() {
  const auth = await requireStudioAdmin();
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    configured: Boolean(
      process.env.FORGE_EXECUTION_WORKER_SECRET && process.env.FORGE_GITHUB_TOKEN
    ),
  });
}

export async function POST(request: Request) {
  const auth = await requireStudioAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const missionId = typeof body?.missionId === "string" ? body.missionId : "";
  const targetBranch = typeof body?.targetBranch === "string"
    ? body.targetBranch.trim().toLowerCase()
    : "";
  let instruction;
  try {
    instruction = validateControlledInstruction(body?.instruction);
  } catch (instructionError) {
    return NextResponse.json({
      error: instructionError instanceof Error
        ? instructionError.message
        : "INVALID_CONTROLLED_INSTRUCTION",
    }, { status: 400 });
  }
  if (!missionId || !branchPattern.test(targetBranch) || targetBranch.includes("..") || targetBranch.includes("//")) {
    return NextResponse.json({ error: "invalid_execution_request" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("forge_request_controlled_execution", {
    p_mission_id: missionId,
    p_target_branch: targetBranch,
    p_created_by: auth.userId,
    p_instruction: instruction,
  });
  if (error) {
    const conflictCodes = [
      "MISSION_ARCHIVED", "PLAN_NOT_VALIDATED", "CURRENT_PLAN_NOT_VALIDATED",
      "BLOCKING_QUESTIONS_REMAIN", "CRITICAL_INCIDENT_OPEN",
      "MISSION_ALREADY_EXECUTED", "MAX_ATTEMPTS_REACHED",
      "ACTIVE_RUN_INSTRUCTION_MISMATCH",
    ];
    const conflict = conflictCodes.find((code) => error.message.includes(code));
    return NextResponse.json(
      { error: conflict ?? "execution_request_failed" },
      { status: conflict ? 409 : 500 },
    );
  }
  const worker = await executeNextForgeRun(`admin-${randomUUID()}`);
  return NextResponse.json({ executionRunId: data, worker }, { status: 201 });
}
