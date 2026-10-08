import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const businessTime = await readFile(new URL("../src/lib/franceBusinessTime.ts", import.meta.url), "utf8");

test("les relances téléphoniques satisfaction utilisent les actions qualité existantes", () => {
  assert.match(tasks, /\.in\("source_type", \["qualiopi_preaudit", "satisfaction_phone_followup"\]\)/);
  assert.match(tasks, /const satisfaction = action\.source_type === "satisfaction_phone_followup"/);
  assert.match(tasks, /kind: satisfaction \? "satisfaction" : "preaudit"/);
  assert.match(tasks, /Relance satisfaction à effectuer/);
  assert.match(tasks, /daily_session_enrolments/);
  assert.match(tasks, /daily_learner_feedback_responses/);
  assert.match(tasks, /satisfiedEnrolmentIds\.has\(enrolment\.id\)/);
  assert.match(tasks, /\["declined", "cancelled", "abandoned"\]/);
});

test("l'assignation reste celle de l'organisme avec partage après 24 h ouvrées", () => {
  assert.match(tasks, /const assignment = assignmentByOrg\.get\(action\.organisation_id\)/);
  assert.match(tasks, /assignedAgentProfileId: assignment\.agent_profile_id/);
  assert.match(tasks, /AGENT_SHARED_AFTER_BUSINESS_HOURS = 24/);
  assert.match(tasks, /isOverdueAfterBusinessHours/);
  assert.match(businessTime, /frenchPublicHolidayKeys/);
  assert.match(tasks, /overdueShared = isOverdue\(createdAt\)/);
});

test("une action satisfaction fermée disparaît du Pilotage", () => {
  assert.match(tasks, /\.in\("status", \["open", "planned"\]\)/);
});

test("une réponse ou un parent satisfaction caduc disparaît aussi avant le prochain cron", () => {
  assert.match(tasks, /action\.source_type === "satisfaction_phone_followup"/);
  assert.match(tasks, /!enrolment/);
  assert.match(tasks, /enrolment\.organisation_id !== action\.organisation_id/);
  assert.match(tasks, /enrolment\.session_id !== action\.session_id/);
  assert.match(tasks, /satisfiedEnrolmentIds\.has\(enrolment\.id\)/);
});
