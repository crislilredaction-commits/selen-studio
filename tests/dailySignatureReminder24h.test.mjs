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

test("uses the canonical 24h reminder type and no 72h key in active UI or worker", () => {
  assert.match(helper, /daily_signature_pending_24h/);
  assert.doesNotMatch(helper + worker + communicationsPage, /daily_signature_pending_72h|H\+72|72 \* 60 \* 60/);
  assert.match(communicationsPage, /Échéance 24 h ouvrées/);
  assert.match(communicationsPage, /signatureReminderDueAt/);
});

test("skips weekends and French public holidays", () => {
  assert.match(helper, /Europe\/Paris/);
  assert.match(helper, /weekday !== "Sat" && weekday !== "Sun"/);
  assert.match(helper, /07-14/);
  assert.match(helper, /12-25/);
  assert.match(helper, /easterMonday/);
});

test("automatic worker is idempotent by signature and resolves terminal expectations", () => {
  assert.match(worker, /signatureReminderDedupeKey\(signature\.id\)/);
  assert.match(worker, /ACTIVE_SIGNATURE_REMINDER_STATUSES/);
  assert.match(worker, /status: "resolved"/);
  assert.match(worker, /isSignatureTerminal\(signature\.status, signature\.signed_at\)/);
  assert.match(worker, /communication_type", "convention_signature"/);
});

test("manual followup is scoped and atomically claimed before email send", () => {
  assert.match(worker, /isDailyOrganisationInAgentScope\(agentEmail, session\.organisation_id\)/);
  assert.match(worker, /daily_signature_manual_followup:\$\{signatureId\}:\$\{initialCommunicationId\}/);
  assert.match(worker, /\.eq\("status", "draft"\)/);
  assert.match(worker, /\.update\(\{ status: "ready", updated_at: now \}\)/);
  assert.match(worker, /previous\?\.status === "sent"/);
  assert.match(worker, /communication_type: "convention_signature_followup"/);
  assert.match(followupPage, /sendManualDailySignatureReminder/);
  assert.match(followupPage, /isDailyOrganisationInAgentScope/);
  assert.match(followupPage, /Relancer la signature/);
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
