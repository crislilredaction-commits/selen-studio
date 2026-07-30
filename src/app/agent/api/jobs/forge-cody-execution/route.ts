import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { executeNextForgeRun } from "@/lib/server/forgeExecutionWorker";

export const runtime = "nodejs";
export const maxDuration = 300;

function validSecret(request: Request) {
  const expected = process.env.FORGE_EXECUTION_WORKER_SECRET;
  const received = request.headers.get("x-forge-worker-secret");
  if (!expected || !received) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!validSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await executeNextForgeRun(`vercel-${randomUUID()}`);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error && error.message === "FORGE_GITHUB_TOKEN_MISSING"
      ? "worker_not_configured"
      : "worker_failed";
    return NextResponse.json({ error: code }, { status: code === "worker_not_configured" ? 503 : 500 });
  }
}
