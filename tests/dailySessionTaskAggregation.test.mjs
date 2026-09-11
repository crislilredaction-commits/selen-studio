import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const phases = await readFile(new URL("../src/lib/daily/sessionPhase.ts", import.meta.url), "utf8");
const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const pilotageVisibility = await readFile(new URL("../src/lib/server/dailyPilotageVisibility.ts", import.meta.url), "utf8");

test("les phases de session sont cumulatives", () => {
  assert.match(phases, /phaseRank\[itemPhase\] <= phaseRank\[currentPhase\]/);
  assert.match(tasks, /isAvailablePhaseItem\(item\.phase, currentPhase\)/);
  assert.doesNotMatch(tasks, /item\.phase === currentPhase/);
});

test("la source commune agrège les tâches de session ouvertes attribuées à Selen", () => {
  assert.match(tasks, /from\("daily_session_checklist_items"\)/);
  assert.match(tasks, /\.in\("responsibility", \["selen", "shared"\]\)/);
  assert.match(tasks, /\.in\("status", \["todo", "in_progress", "to_review", "blocked"\]\)/);
  assert.match(tasks, /isAvailablePhaseItem\(item\.phase, currentPhase\)/);
  assert.match(tasks, /kind: "session"/);
});

test("les tâches de session ouvrent directement leur écran métier", () => {
  assert.match(tasks, /case "pretraining_documents"[\s\S]*return "\/agent\/daily\/pretraining-documents"/);
  assert.match(tasks, /case "trainer_assignment"[\s\S]*`\/agent\/daily\/sessions\/\$\{encodedSessionId\}`/);
  assert.match(tasks, /case "training_ready"[\s\S]*`\/agent\/daily\/session-dossiers\/\$\{encodedSessionId\}`/);
  assert.match(tasks, /case "attendance_followup"[\s\S]*`\/agent\/daily\/sessions\/\$\{encodedSessionId\}`/);
  assert.match(tasks, /case "posttraining_documents"[\s\S]*return "\/agent\/daily\/posttraining-documents"/);
  assert.match(tasks, /case "quality_analysis_review"[\s\S]*`\/agent\/daily\/session-dossiers\/\$\{encodedSessionId\}\/followup`/);
  assert.match(tasks, /case "selen_closure_review"[\s\S]*`\/agent\/daily\/session-dossiers\/\$\{encodedSessionId\}\/closure`/);
  assert.match(tasks, /href: getDailySessionTaskHref\(item\.item_key, session\.id\)/);
  assert.match(tasks, /kind: "program"[\s\S]*href: `\/agent\/daily\/session-dossiers\/\$\{session\.id\}`/);
  assert.match(tasks, /kind: adaptation \? "adaptation" : "registration"[\s\S]*href: `\/agent\/daily\/sessions\/\$\{session\.id\}`/);
  assert.match(pilotage, /<Link href=\{item\.href\} style=\{s\.titleLink\}><SelenCardTitle>\{item\.title\}<\/SelenCardTitle><\/Link>/);
});

test("dashboard personnel et Pilotage Daily partagent l'agrégation mais pas le filtre de visibilité", () => {
  assert.match(dashboard, /getDailyAgentTasks\(\{ id: staff\.id, role: staff\.role \}\)/);
  assert.match(pilotage, /getDailyPilotageTasks\(\)/);
  assert.match(pilotageVisibility, /getDailyAgentTasks\(\{ id: null, role: "admin" \}\)/);
});

test("un admin supervise immédiatement toutes les tâches, les agents conservent la règle des 24 h ouvrées", () => {
  assert.match(tasks, /if \(staff\.role === "admin"\) return true/);
  assert.match(tasks, /if \(staff\.id === task\.assignedAgentProfileId\) return true/);
  assert.match(tasks, /return task\.overdueShared/);
  assert.match(pilotageVisibility, /task\.assignedAgentProfileId === staff\.id \|\| task\.overdueShared/);
});

test("une tâche terminée ne remonte plus et une tâche client n'est pas présentée comme tâche agent", () => {
  assert.doesNotMatch(tasks, /"validated"[^\n]*"not_applicable"[^\n]*daily_session_checklist_items/);
  assert.doesNotMatch(tasks, /\.in\("responsibility", \[[^\]]*"client"/);
});

test("une validation d'inscription n'est courante que si elle est postérieure à la dernière réponse", () => {
  assert.match(tasks, /from\("daily_registration_reviews"\)/);
  assert.match(tasks, /select\("session_id,validated_at"\)/);
  assert.match(tasks, /registrationReviewIsCurrent\(review, latestRegistrationResponse\)/);
  assert.match(tasks, /reviewedAt >= responseAt/);
  assert.match(tasks, /statusNeedsRegistration \|\| !reviewIsCurrent/);
});

test("une réponse plus récente réouvre le pilotage et redémarre le délai depuis cette réponse", () => {
  assert.match(tasks, /Dossier d'inscription mis à jour/);
  assert.match(tasks, /Une réponse est postérieure à la dernière validation/);
  assert.match(tasks, /const createdAt = latestRegistrationResponse\?\.created_at \?\?/);
  assert.doesNotMatch(tasks, /registrationResponses\[0\]\?\.created_at/);
});
