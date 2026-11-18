import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Studio resumes issuance and attachment delivery after partial failures", () => {
  const recipe = fileURLToPath(new URL("../scripts/recipe-daily-invoices.mjs", import.meta.url));
  execFileSync(process.execPath, [recipe, "--studio-only"], { stdio: "pipe" });
});
