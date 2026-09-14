import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const helper = fs.readFileSync(path.join(root, "src/lib/daily/signatureReminder24h.ts"), "utf8");
const worker = fs.readFileSync(path.join(root, "src/lib/server/dailySignatureReminders.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "src/app/agent/api/jobs/daily-signature-reminders/route.ts"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/daily-signature-reminders.yml"), "utf8");

test("uses the canonical 24h reminder type and no 72h key", () => {
  assert.match(helper, /daily_signature_pending_24h/);
  assert.doesNotMatch(helper + worker, /daily_signature_pending_72h/);
});

test("skips weekends and French public holidays", () => {
  assert.match(helper, /Europe\/Paris/);
  assert.match(helper, /weekday !== "Sat" && weekday !== "Sun"/);
  assert.match(helper, /07-14/);
  assert.match(helper, /12-25/);
  assert.match(helper, /easterMonday/);
});

test("worker is idempotent by signature and resolves terminal expectations", () => {
  assert.match(worker, /signatureReminderDedupeKey\(signature\.id\)/);
  assert.match(worker, /ACTIVE_SIGNATURE_REMINDER_STATUSES/);
  assert.match(worker, /status: "resolved"/);
  assert.match(worker, /isSignatureTerminal\(signature\.status, signature\.signed_at\)/);
  assert.match(worker, /communication_type", "convention_signature"/);
});

test("email transport evidence cannot become signature evidence", () => {
  assert.match(worker, /daily_convention_signatures/);
  assert.match(worker, /signed_at/);
  assert.doesNotMatch(worker, /opened.*signed|clicked.*signed/i);
});

test("cron route fails closed without the shared secret", () => {
  assert.match(route, /if \(!secret\) return false/);
  assert.match(route, /Bearer \$\{secret\}/);
});

test("scheduled workflow invokes the secured worker without Vercel Cron", () => {
  assert.match(workflow, /cron: "17 \* \* \* \*"/);
  assert.match(workflow, /daily-signature-reminders/);
  assert.match(workflow, /CRON_SECRET/);
  assert.match(workflow, /SELEN_STUDIO_BASE_URL/);
});
