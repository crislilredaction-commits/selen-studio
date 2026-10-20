import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveAttendanceFollowupStatus } from "../src/lib/daily/attendanceFollowupStatus.ts";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const followupPage = readFileSync(new URL("../src/app/agent/daily/suivi-sessions/page.tsx", import.meta.url), "utf8");
const sessionFollowupPage = readFileSync(new URL("../src/app/agent/daily/session-dossiers/[id]/followup/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily expose le suivi des sessions", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/suivi-sessions"/);
  assert.match(dailyPage, /Suivi sessions & incidents/);
});

test("le suivi réutilise la table canonique existante", () => {
  assert.match(followupPage, /\.from\("daily_session_followup_entries"\)/);
  assert.match(followupPage, /daily_session_followup_entries<\/code>/);
  assert.doesNotMatch(followupPage, /daily_incidents/);
});

test("la vue distingue incidents, adaptations, notes et criticité", () => {
  assert.match(followupPage, /incident: "Incident"/);
  assert.match(followupPage, /adaptation: "Adaptation"/);
  assert.match(followupPage, /note: "Note de suivi"/);
  assert.match(followupPage, /critical: "Critique"/);
  assert.match(followupPage, /entry\.status === "open"/);
});

test("la vue Studio reste en lecture seule", () => {
  assert.match(followupPage, /requireSupportAgent\(\)/);
  assert.doesNotMatch(followupPage, /\.insert\(/);
  assert.doesNotMatch(followupPage, /\.update\(/);
  assert.doesNotMatch(followupPage, /\.delete\(/);
  assert.doesNotMatch(followupPage, /\.upsert\(/);
});

test("la checklist de suivi ignore les présences des inscriptions terminales", () => {
  const refreshSource = sessionFollowupPage
    .split("async function refreshFollowupChecklist")[1]
    ?.split("async function requireScopedSession")[0] ?? "";

  assert.match(refreshSource, /daily_session_enrolments/);
  assert.match(refreshSource, /INACTIVE_ENROLMENTS\.has\(enrolment\.status\)/);
  assert.match(refreshSource, /activeEnrolmentIds\.has\(record\.enrolment_id\)/);
  assert.match(refreshSource, /resolveAttendanceFollowupStatus/);
});

test("la checklist se clôture quand il ne reste aucun inscrit actif", () => {
  assert.equal(resolveAttendanceFollowupStatus({
    activeEnrolmentCount: 0,
    slotStatuses: ["closed"],
    activeRecordStatuses: [],
    openEntryCount: 0,
  }), "validated");
});

test("un suivi ouvert reste visible même sans inscrit actif", () => {
  assert.equal(resolveAttendanceFollowupStatus({
    activeEnrolmentCount: 0,
    slotStatuses: ["closed"],
    activeRecordStatuses: [],
    openEntryCount: 1,
  }), "in_progress");
});

test("un inscrit actif finalisé peut passer en revue malgré une présence terminale filtrée", () => {
  assert.equal(resolveAttendanceFollowupStatus({
    activeEnrolmentCount: 1,
    slotStatuses: ["closed"],
    activeRecordStatuses: ["present"],
    openEntryCount: 0,
  }), "to_review");
});

test("une présence active encore en attente garde le suivi en cours", () => {
  assert.equal(resolveAttendanceFollowupStatus({
    activeEnrolmentCount: 1,
    slotStatuses: ["closed"],
    activeRecordStatuses: ["pending"],
    openEntryCount: 0,
  }), "in_progress");
});
