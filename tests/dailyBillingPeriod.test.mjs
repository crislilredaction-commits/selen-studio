import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/lib/dailyBillingPeriod.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
new Function("module", "exports", "require", transpiled)(mod, mod.exports, require);
const { parseDailyBillingMonth, dailyBillingPeriodBounds, dailyInvoiceExternalKey, dailyManualPeriodKey } = mod.exports;

test("validates calendar month and rejects invalid dates", () => {
  assert.deepEqual(parseDailyBillingMonth("2026-11"), { year: 2026, month: 11 });
  for (const value of ["2026-00", "2026-13", "2026-1", "foo", "1999-12"]) {
    assert.equal(parseDailyBillingMonth(value), null);
  }
});

test("handles December rollover without timezone conversion", () => {
  assert.deepEqual(dailyBillingPeriodBounds("2026-12"), {
    start: "2026-12-01", endExclusive: "2027-01-01",
  });
});

test("constructs deterministic idempotency keys", () => {
  assert.equal(dailyInvoiceExternalKey("in_123ABC"), "stripe:daily:in_123ABC");
  assert.equal(dailyManualPeriodKey("sub_ABC123", "2026-11"), "daily:sub_ABC123:2026-11");
  assert.throws(() => dailyInvoiceExternalKey("bad"));
  assert.throws(() => dailyManualPeriodKey("sub_ABC123", "2026-13"));
});
