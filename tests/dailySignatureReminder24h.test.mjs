import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const helper = fs.readFileSync(path.join(root, "src/lib/daily/signatureReminder24h.ts"), "utf8");
const worker = fs.readFileSync(path.join(root, "src/lib/server/dailySignatureReminders.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "src/app/agent/api/jobs/daily-signature-reminders/route.ts"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/daily-signature-reminders.yml"), "utf8");
const communicationsPage = fs.readFileSync(path.join(root, "src/app/agent/daily/communications/page.tsx"), "utf8");
const followupPage = fs.readFileSync(path.join(root, "src/app/agent/daily/session-dossiers/[id]/followup/page.tsx"), "utf8");

test("uses the canonical J+3 reminder type in the active UI", () => {
  assert.match(helper, /daily_signature_pending_72h/);
  assert.match(communicationsPage, /Prochaine échéance/);
  assert.match(communicationsPage, /signatureReminderDueAt/);
  assert.match(communicationsPage, /Relance automatique J\+3 planifiée/);
  assert.match(communicationsPage, /Relance automatique J\+6 planifiée/);
  assert.match(communicationsPage, /Appel agent J\+9 à traiter/);
  assert.match(communicationsPage, /Alerte urgente avant démarrage/);
});

test("first canonical deadline is exactly J+3", () => {
  assert.match(helper, /3 \* 24 \* 60 \* 60 \* 1000/);
});

test("Studio retires the obsolete parallel 24h reminders", () => {
  assert.match(worker, /daily_signature_pending_24h/);
  assert.match(worker, /ACTIVE_SIGNATURE_REMINDER_STATUSES/);
  assert.match(worker, /status: "resolved"/);
  assert.match(worker, /superseded_by_canonical_j3_j6_j9/);
});

test("active Studio followup does not allow an extra manual email outside the canonical sequence", () => {
  assert.doesNotMatch(followupPage, /sendManualDailySignatureReminder/);
  assert.doesNotMatch(followupPage, /Relancer la signature/);
  assert.match(followupPage, /emails J\+3 et J\+6, puis tâche agent J\+9/);
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

test("secured Studio job proxies the existing schedule to the Daily canonical worker", () => {
  assert.match(route, /SELEN_DAILY_BASE_URL/);
  assert.match(route, /signature-followup-automation\?execute=1/);
  assert.match(route, /authorization: `Bearer \$\{process\.env\.CRON_SECRET\?\.trim\(\)\}`/);
  assert.match(route, /if \(!upstream\.ok\)/);
});

test("scheduled workflow invokes the secured worker without Vercel Cron", () => {
  assert.match(workflow, /cron: "17 \* \* \* \*"/);
  assert.match(workflow, /canonical J\+3 \/ J\+6 \/ J\+9/);
  assert.match(workflow, /CRON_SECRET/);
  assert.match(workflow, /SELEN_STUDIO_BASE_URL/);
});
