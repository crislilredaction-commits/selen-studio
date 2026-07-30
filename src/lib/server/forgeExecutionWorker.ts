import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type ExecutionRunRow = {
  id: string;
  repository: string;
  base_branch: string;
  target_branch: string;
};

export type GitExecutionEvidence = {
  commitSha: string;
  remoteUrl: string;
};

export async function createAndPushExecutionBranch(
  run: ExecutionRunRow,
  token: string,
): Promise<GitExecutionEvidence> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-cody-"));
  const remoteUrl = `https://github.com/${run.repository}.git`;
  const onAuth = () => ({ username: "x-access-token", password: token });

  try {
    await git.clone({
      fs,
      http,
      dir: directory,
      url: remoteUrl,
      ref: run.base_branch,
      singleBranch: true,
      depth: 1,
      onAuth,
    });
    const configuredRemote = await git.getConfig({
      fs,
      dir: directory,
      path: "remote.origin.url",
    });
    if (configuredRemote !== remoteUrl) {
      throw new Error("Le remote Git cloné ne correspond pas au dépôt autorisé.");
    }
    await git.branch({ fs, dir: directory, ref: run.target_branch, checkout: true });
    const commitSha = await git.resolveRef({ fs, dir: directory, ref: "HEAD" });
    await git.push({
      fs,
      http,
      dir: directory,
      remote: "origin",
      ref: run.target_branch,
      remoteRef: run.target_branch,
      onAuth,
    });
    return { commitSha, remoteUrl };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function executeNextForgeRun(workerId: string) {
  const token = process.env.FORGE_GITHUB_TOKEN;
  if (!token) throw new Error("FORGE_GITHUB_TOKEN_MISSING");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("forge_claim_execution_run", {
    p_worker_id: workerId,
  });
  if (error) throw new Error(error.message);
  const run = (data?.[0] ?? null) as ExecutionRunRow | null;
  if (!run) return { status: "idle" as const };

  try {
    const evidence = await createAndPushExecutionBranch(run, token);
    const { error: completeError } = await admin.rpc("forge_complete_execution_run", {
      p_run_id: run.id,
      p_worker_id: workerId,
      p_git_commit_sha: evidence.commitSha,
      p_git_remote_url: evidence.remoteUrl,
    });
    if (completeError) throw new Error(completeError.message);
    return { status: "completed" as const, runId: run.id, ...evidence };
  } catch (executionError) {
    const safeMessage = executionError instanceof Error
      ? executionError.message.replaceAll(token, "[secret masqué]").slice(0, 2000)
      : "Échec Git non identifié";
    await admin.rpc("forge_fail_execution_run", {
      p_run_id: run.id,
      p_worker_id: workerId,
      p_error: safeMessage,
    });
    return { status: "failed" as const, runId: run.id };
  }
}
