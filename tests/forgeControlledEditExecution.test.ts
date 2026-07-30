import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateControlledInstruction } from "../src/lib/server/forgeExecutionWorker";

const validInstruction = {
  target_path: "docs/forge-cody-sandbox/first-controlled-edit.md",
  operation: "create",
  expected_content: "# Test\n\nContenu contrôlé.\n",
  allowed_command: "git_status_short",
  commit_message: "docs(forge): add controlled test file",
} as const;

test("l’instruction contrôlée nominale est acceptée", () => {
  assert.deepEqual(validateControlledInstruction(validInstruction), validInstruction);
});

test("les chemins hors sandbox et leurs contournements sont refusés", () => {
  for (const target_path of [
    "../src/app.ts",
    "/docs/forge-cody-sandbox/test.md",
    "docs/forge-cody-sandbox/../secret.md",
    "docs\\forge-cody-sandbox\\test.md",
    "docs/forge-cody-sandbox/%2e%2e/secret.md",
    "supabase/migrations/test.md",
  ]) {
    assert.throws(
      () => validateControlledInstruction({ ...validInstruction, target_path }),
      /TARGET_PATH_NOT_ALLOWED/,
    );
  }
});

test("aucune commande libre ou chaînée n’est acceptée", () => {
  for (const allowed_command of [
    "git status --short",
    "git_status_short && curl example.com",
    "powershell",
    "npm install",
  ]) {
    assert.throws(
      () => validateControlledInstruction({ ...validInstruction, allowed_command }),
      /COMMAND_NOT_ALLOWED/,
    );
  }
});

test("les contenus contenant un secret probable sont refusés", () => {
  assert.throws(
    () => validateControlledInstruction({
      ...validInstruction,
      expected_content: "FORGE_GITHUB_TOKEN=valeur-interdite",
    }),
    /CONTENT_NOT_ALLOWED/,
  );
});

test("le worker vérifie symlinks, diff, fichiers modifiés et SHA distant", async () => {
  const worker = await readFile(
    new URL("../src/lib/server/forgeExecutionWorker.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /isSymbolicLink/);
  assert.match(worker, /UNEXPECTED_FILES_CHANGED/);
  assert.match(worker, /PROBABLE_SECRET_IN_DIFF/);
  assert.match(worker, /REMOTE_BRANCH_DIVERGED/);
  assert.match(worker, /FINAL_PUSH_NOT_VERIFIED/);
  assert.doesNotMatch(worker, /child_process|exec\(|spawn\(|shell:/);
});

test("la migration impose l’ordre, l’immutabilité et les grants serveur", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20260730204145_extend_forge_controlled_edit_execution.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /EXECUTION_STEP_OUT_OF_ORDER/);
  assert.match(sql, /STEP_EVIDENCE_IMMUTABLE/);
  assert.match(sql, /ACTIVE_RUN_INSTRUCTION_MISMATCH/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
});
