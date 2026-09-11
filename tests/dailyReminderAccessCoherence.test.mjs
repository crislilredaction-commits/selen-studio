import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("src/app/agent/relances/page.tsx", "utf8");
const listRoute = fs.readFileSync("src/app/agent/api/reminders/list/route.ts", "utf8");
const historyRoute = fs.readFileSync("src/app/agent/api/reminders/history/route.ts", "utf8");
const helper = fs.readFileSync("src/lib/server/studioClientFollowups.ts", "utf8");

test("relances page no longer reads reminder tables directly from the browser", () => {
  assert.doesNotMatch(page, /createClient\(/);
  assert.doesNotMatch(page, /\.from\(["']client_reminders["']\)/);
  assert.match(page, /\/agent\/api\/reminders\/list/);
  assert.match(page, /\/agent\/api\/reminders\/history/);
});

test("list and history reuse the canonical Studio reminder visibility", () => {
  assert.match(listRoute, /isStudioReminderVisible/);
  assert.match(listRoute, /resolveStudioReminderStaff/);
  assert.match(historyRoute, /isStudioReminderVisible/);
  assert.match(historyRoute, /resolveStudioReminderStaff/);
});

test("canonical visibility keeps assignment and 24 business-hour sharing", () => {
  assert.match(helper, /staff\.id === agentId \|\| isOverdue\(queuedAt\(row\)\)/);
  assert.match(helper, /AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);
  assert.match(helper, /staff\.role === "admin"/);
});
