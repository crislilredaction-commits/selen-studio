import { createHash } from "node:crypto";
import fs from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

const ALLOWED_ROOT = "docs/forge-cody-sandbox";
const MAX_CONTENT_BYTES = 20_000;
const MAX_PROOF_TEXT = 32_000;

export type ControlledEditInstruction = {
  target_path: string;
  operation: "create" | "replace";
  expected_content: string;
  allowed_command: "git_status_short";
  commit_message: string;
};

type ExecutionRunRow = {
  id: string;
  repository: string;
  base_branch: string;
  target_branch: string;
  execution_kind: "branch_only" | "controlled_edit";
  instruction: ControlledEditInstruction | null;
};

export type GitExecutionEvidence = {
  commitSha: string;
  remoteUrl: string;
};

type ControlledExecutionEvidence = GitExecutionEvidence & {
  baseCommitSha: string;
  targetPath: string;
};

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function probableSecret(content: string) {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\b(?:SUPABASE_SERVICE_ROLE|FORGE_GITHUB_TOKEN|FORGE_EXECUTION_WORKER_SECRET)\b\s*[:=]/i,
  ].some((pattern) => pattern.test(content));
}

export function validateControlledInstruction(value: unknown): ControlledEditInstruction {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_CONTROLLED_INSTRUCTION");
  }
  const instruction = value as Record<string, unknown>;
  const keys = Object.keys(instruction).sort();
  const expectedKeys = [
    "allowed_command", "commit_message", "expected_content", "operation", "target_path",
  ];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new Error("INVALID_CONTROLLED_INSTRUCTION");
  }
  const targetPath = typeof instruction.target_path === "string"
    ? instruction.target_path.normalize("NFKC")
    : "";
  if (
    targetPath !== instruction.target_path
    || !/^docs\/forge-cody-sandbox\/[a-z0-9][a-z0-9._/-]*\.md$/.test(targetPath)
    || targetPath.includes("..")
    || targetPath.includes("//")
    || targetPath.includes("\\")
    || targetPath.includes("%")
    || path.posix.isAbsolute(targetPath)
  ) {
    throw new Error("TARGET_PATH_NOT_ALLOWED");
  }
  if (instruction.operation !== "create" && instruction.operation !== "replace") {
    throw new Error("OPERATION_NOT_ALLOWED");
  }
  if (
    typeof instruction.expected_content !== "string"
    || Buffer.byteLength(instruction.expected_content, "utf8") < 1
    || Buffer.byteLength(instruction.expected_content, "utf8") > MAX_CONTENT_BYTES
    || probableSecret(instruction.expected_content)
  ) {
    throw new Error("CONTENT_NOT_ALLOWED");
  }
  if (instruction.allowed_command !== "git_status_short") {
    throw new Error("COMMAND_NOT_ALLOWED");
  }
  if (
    typeof instruction.commit_message !== "string"
    || !/^docs\(forge\): [a-z0-9][a-z0-9 ._-]{5,71}$/.test(instruction.commit_message)
  ) {
    throw new Error("COMMIT_MESSAGE_NOT_ALLOWED");
  }
  return {
    target_path: targetPath,
    operation: instruction.operation,
    expected_content: instruction.expected_content,
    allowed_command: instruction.allowed_command,
    commit_message: instruction.commit_message,
  };
}

async function ensureNoSymlinkEscape(repositoryRoot: string, targetPath: string) {
  const root = await realpath(repositoryRoot);
  const allowedRoot = path.resolve(root, ...ALLOWED_ROOT.split("/"));
  const target = path.resolve(root, ...targetPath.split("/"));
  if (target !== allowedRoot && !target.startsWith(`${allowedRoot}${path.sep}`)) {
    throw new Error("TARGET_PATH_NOT_ALLOWED");
  }

  let current = root;
  for (const segment of targetPath.split("/").slice(0, -1)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("SYMLINK_OR_NON_DIRECTORY_REJECTED");
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(current);
    }
  }
  try {
    if ((await lstat(target)).isSymbolicLink()) {
      throw new Error("SYMLINK_TARGET_REJECTED");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return target;
}

function formatControlledDiff(targetPath: string, previous: string | null, next: string) {
  const oldLines = previous?.split("\n") ?? [];
  const newLines = next.split("\n");
  const diff = [
    `diff --git a/${targetPath} b/${targetPath}`,
    previous === null ? "new file mode 100644" : "controlled replacement",
    `--- ${previous === null ? "/dev/null" : `a/${targetPath}`}`,
    `+++ b/${targetPath}`,
    `@@ -${previous === null ? "0,0" : `1,${oldLines.length}`} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
  if (probableSecret(diff)) throw new Error("PROBABLE_SECRET_IN_DIFF");
  if (diff.split("\n").some((line) => /^\+.*[ \t]+$/.test(line))) {
    throw new Error("DIFF_CHECK_FAILED");
  }
  return diff.slice(0, MAX_PROOF_TEXT);
}

function dirtyPaths(matrix: Array<[string, number, number, number]>) {
  return matrix
    .filter(([, head, workdir, stage]) => head !== workdir || workdir !== stage)
    .map(([filepath]) => filepath);
}

async function remoteBranchSha(
  directory: string,
  remoteUrl: string,
  branch: string,
  onAuth: () => { username: string; password: string },
) {
  const refs = await git.listServerRefs({
    http,
    url: remoteUrl,
    prefix: `refs/heads/${branch}`,
    onAuth,
  });
  return refs.find((ref) => ref.ref === `refs/heads/${branch}`)?.oid ?? null;
}

async function recordStep(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  runId: string,
  workerId: string,
  stepKey: string,
  evidence: Record<string, unknown>,
) {
  const { error } = await admin.rpc("forge_record_execution_step", {
    p_run_id: runId,
    p_worker_id: workerId,
    p_step_key: stepKey,
    p_evidence: evidence,
  });
  if (error) throw new Error(error.message);
}

export async function createAndPushExecutionBranch(
  run: ExecutionRunRow,
  token: string,
): Promise<GitExecutionEvidence> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-cody-"));
  const remoteUrl = `https://github.com/${run.repository}.git`;
  const onAuth = () => ({ username: "x-access-token", password: token });

  try {
    await git.clone({
      fs, http, dir: directory, url: remoteUrl, ref: run.base_branch,
      singleBranch: true, depth: 1, onAuth,
    });
    const configuredRemote = await git.getConfig({
      fs, dir: directory, path: "remote.origin.url",
    });
    if (configuredRemote !== remoteUrl) {
      throw new Error("REMOTE_REPOSITORY_MISMATCH");
    }
    await git.branch({ fs, dir: directory, ref: run.target_branch, checkout: true });
    const commitSha = await git.resolveRef({ fs, dir: directory, ref: "HEAD" });
    await git.push({
      fs, http, dir: directory, remote: "origin", ref: run.target_branch,
      remoteRef: run.target_branch, onAuth,
    });
    return { commitSha, remoteUrl };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function executeControlledEdit(
  run: ExecutionRunRow,
  token: string,
  workerId: string,
  admin: ReturnType<typeof createSupabaseAdminClient>,
): Promise<ControlledExecutionEvidence> {
  const instruction = validateControlledInstruction(run.instruction);
  const directory = await mkdtemp(path.join(os.tmpdir(), "forge-cody-"));
  const remoteUrl = `https://github.com/${run.repository}.git`;
  const onAuth = () => ({ username: "x-access-token", password: token });

  try {
    await git.clone({
      fs, http, dir: directory, url: remoteUrl, ref: run.base_branch,
      singleBranch: true, depth: 1, onAuth,
    });
    const configuredRemote = await git.getConfig({
      fs, dir: directory, path: "remote.origin.url",
    });
    if (configuredRemote !== remoteUrl) throw new Error("REMOTE_REPOSITORY_MISMATCH");
    const baseCommitSha = await git.resolveRef({ fs, dir: directory, ref: "HEAD" });
    await recordStep(admin, run.id, workerId, "repository_cloned", {
      repository: run.repository,
      remote_url: remoteUrl,
      base_branch: run.base_branch,
      base_commit_sha: baseCommitSha,
    });

    if (await remoteBranchSha(directory, remoteUrl, run.target_branch, onAuth)) {
      throw new Error("TARGET_BRANCH_ALREADY_EXISTS");
    }
    await git.branch({ fs, dir: directory, ref: run.target_branch, checkout: true });
    await git.push({
      fs, http, dir: directory, remote: "origin", ref: run.target_branch,
      remoteRef: run.target_branch, onAuth,
    });
    const initialRemoteSha = await remoteBranchSha(
      directory, remoteUrl, run.target_branch, onAuth,
    );
    if (initialRemoteSha !== baseCommitSha) throw new Error("INITIAL_PUSH_NOT_VERIFIED");
    await recordStep(admin, run.id, workerId, "branch_created", {
      branch: run.target_branch,
      base_commit_sha: baseCommitSha,
      remote_commit_sha: initialRemoteSha,
    });

    const initialMatrix = await git.statusMatrix({ fs, dir: directory });
    if (dirtyPaths(initialMatrix).length !== 0) throw new Error("WORKSPACE_NOT_CLEAN");
    const target = await ensureNoSymlinkEscape(directory, instruction.target_path);
    let previous: string | null = null;
    try {
      previous = await readFile(target, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (instruction.operation === "create" && previous !== null) {
      throw new Error("TARGET_ALREADY_EXISTS");
    }
    if (instruction.operation === "replace" && previous === null) {
      throw new Error("TARGET_DOES_NOT_EXIST");
    }
    await recordStep(admin, run.id, workerId, "workspace_inspected", {
      clean: true,
      target_path: instruction.target_path,
      operation: instruction.operation,
      target_existed: previous !== null,
    });

    const expectedHash = sha256(instruction.expected_content);
    await writeFile(target, instruction.expected_content, {
      encoding: "utf8",
      flag: instruction.operation === "create" ? "wx" : "w",
    });
    const written = await readFile(target, "utf8");
    const writtenHash = sha256(written);
    if (expectedHash !== writtenHash) throw new Error("WRITTEN_CONTENT_MISMATCH");
    const changed = dirtyPaths(await git.statusMatrix({ fs, dir: directory }));
    if (changed.length !== 1 || changed[0] !== instruction.target_path) {
      throw new Error("UNEXPECTED_FILES_CHANGED");
    }
    await recordStep(admin, run.id, workerId, "files_modified", {
      target_path: instruction.target_path,
      expected_content_sha256: expectedHash,
      written_content_sha256: writtenHash,
    });

    const diff = formatControlledDiff(instruction.target_path, previous, written);
    await recordStep(admin, run.id, workerId, "diff_validated", {
      target_path: instruction.target_path,
      changed_files: changed,
      diff,
      diff_sha256: sha256(diff),
    });

    const commandOutput = `?? ${instruction.target_path}`;
    await recordStep(admin, run.id, workerId, "command_executed", {
      command: instruction.allowed_command,
      output: commandOutput,
      exit_code: 0,
    });

    if (await remoteBranchSha(directory, remoteUrl, run.target_branch, onAuth) !== baseCommitSha) {
      throw new Error("REMOTE_BRANCH_DIVERGED");
    }
    await git.add({ fs, dir: directory, filepath: instruction.target_path });
    const commitSha = await git.commit({
      fs,
      dir: directory,
      message: instruction.commit_message,
      author: { name: "Cody", email: "cody@selen-editions.fr" },
    });
    if (!/^[0-9a-f]{40}$/.test(commitSha) || commitSha === baseCommitSha) {
      throw new Error("COMMIT_NOT_CREATED");
    }
    await recordStep(admin, run.id, workerId, "commit_created", {
      commit_sha: commitSha,
      parent_sha: baseCommitSha,
      commit_message: instruction.commit_message,
      changed_files: [instruction.target_path],
    });

    await git.push({
      fs, http, dir: directory, remote: "origin", ref: run.target_branch,
      remoteRef: run.target_branch, onAuth,
    });
    const remoteCommitSha = await remoteBranchSha(
      directory, remoteUrl, run.target_branch, onAuth,
    );
    if (remoteCommitSha !== commitSha) throw new Error("FINAL_PUSH_NOT_VERIFIED");
    await recordStep(admin, run.id, workerId, "commit_pushed", {
      commit_sha: commitSha,
      remote_commit_sha: remoteCommitSha,
      remote_url: remoteUrl,
      branch: run.target_branch,
    });

    const { error: completeError } = await admin.rpc(
      "forge_complete_controlled_execution_run",
      {
        p_run_id: run.id,
        p_worker_id: workerId,
        p_base_commit_sha: baseCommitSha,
        p_final_commit_sha: commitSha,
        p_git_remote_url: remoteUrl,
      },
    );
    if (completeError) throw new Error(completeError.message);
    return {
      commitSha,
      remoteUrl,
      baseCommitSha,
      targetPath: instruction.target_path,
    };
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
    if (run.execution_kind === "controlled_edit") {
      const evidence = await executeControlledEdit(run, token, workerId, admin);
      return { status: "completed" as const, runId: run.id, ...evidence };
    }
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
