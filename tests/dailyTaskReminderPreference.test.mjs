import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dispatch = fs.readFileSync("src/lib/server/dailyTaskReminderDispatch.ts", "utf8");
const route = fs.readFileSync("src/app/agent/api/jobs/generate-client-reminders/route.ts", "utf8");

test("le moteur lit la préférence canonique de l'organisation", () => {
  assert.match(dispatch, /daily_task_reminder_mode/);
  assert.match(dispatch, /daily_task_digest_hour/);
  assert.match(dispatch, /"immediate" \| "daily_digest"/);
});

test("le mode immédiat envoie chaque rappel dû via le canal client existant", () => {
  assert.match(dispatch, /sendClientEmailWithSilence/);
  assert.match(dispatch, /"immediate"/);
  assert.match(dispatch, /\.lte\("due_at", now\.toISOString\(\)\)/);
});

test("le digest regroupe et se déduplique par organisation et date", () => {
  assert.match(dispatch, /daily_digest_sent/);
  assert.match(dispatch, /digest_date/);
  assert.match(dispatch, /organisation_id/);
  assert.match(dispatch, /alreadySentDigest/);
  assert.match(dispatch, /reminder_ids/);
});

test("l'envoi est tracé sur le rappel et dans les événements", () => {
  assert.match(dispatch, /delivery_mode/);
  assert.match(dispatch, /delivery_sent_at/);
  assert.match(dispatch, /client_reminder_events/);
  assert.match(dispatch, /event_type: "sent"/);
});

test("le job canonique génère puis distribue sans second moteur de génération", () => {
  assert.match(route, /generateClientReminders\(\)/);
  assert.match(route, /dispatchDueClientReminders\(\)/);
});
