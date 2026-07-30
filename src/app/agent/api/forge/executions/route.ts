import { NextResponse } from "next/server";
import { requireStudioAdmin } from "@/lib/server/studioAuth";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

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
  if (!missionId || !branchPattern.test(targetBranch) || targetBranch.includes("..") || targetBranch.includes("//")) {
    return NextResponse.json({ error: "invalid_execution_request" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("forge_request_execution", {
    p_mission_id: missionId,
    p_target_branch: targetBranch,
    p_created_by: auth.userId,
  });
  if (error) {
    const conflictCodes = [
      "MISSION_ARCHIVED", "PLAN_NOT_VALIDATED", "CURRENT_PLAN_NOT_VALIDATED",
      "BLOCKING_QUESTIONS_REMAIN", "CRITICAL_INCIDENT_OPEN",
      "MISSION_ALREADY_EXECUTED", "MAX_ATTEMPTS_REACHED",
    ];
    const conflict = conflictCodes.find((code) => error.message.includes(code));
    return NextResponse.json(
      { error: conflict ?? "execution_request_failed" },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ executionRunId: data }, { status: 201 });
}
