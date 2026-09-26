import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const phases = await readFile(new URL("../src/lib/daily/sessionPhase.ts", import.meta.url), "utf8");
const programReview = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/page.tsx", import.meta.url), "utf8");
const tasks = await readFile(new URL("../src/lib/server/dailyAgentTasks.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const sessionTimeline = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/timeline/page.tsx", import.meta.url), "utf8");
const pilotageVisibility = await readFile(new URL("../src/lib/server/dailyPilotageVisibility.ts", import.meta.url), "utf8");
const notificationCadenceMigration = await readFile(new URL("../supabase/migrations/20260912211500_daily_notification_escalation_24h.sql", import.meta.url), "utf8");
const notificationVisibilityMigration = await readFile(new URL("../supabase/migrations/20260912222000_daily_session_notification_phase_visibility.sql", import.meta.url), "utf8");

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
  assert.match(tasks, /href: `\/agent\/daily\/session-dossiers\/\$\{session\.id\}`,[\s\S]*kind: "program"/);
  assert.match(tasks, /href: `\/agent\/daily\/sessions\/\$\{session\.id\}`,[\s\S]*kind: adaptation \? "adaptation" : "registration"/);
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

test("les notifications checklist escaladent elles aussi après 24 h et jamais 72 h", () => {
  const matches24h = notificationCadenceMigration.match(/interval '24 hours'/g) ?? [];
  assert.equal(matches24h.length, 2);
  assert.doesNotMatch(notificationCadenceMigration, /interval '72 hours'/);
  assert.match(notificationCadenceMigration, /daily_sync_checklist_notification/);
  assert.match(notificationCadenceMigration, /daily_sync_session_checklist_notification/);
  assert.match(notificationCadenceMigration, /perform public\.daily_sync_checklist_notification\(checklist_id\)/);
  assert.match(notificationCadenceMigration, /perform public\.daily_sync_session_checklist_notification\(checklist_id\)/);
});

test("les notifications de session respectent les responsabilités et les phases cumulatives", () => {
  assert.match(notificationVisibilityMigration, /item\.responsibility in \('selen', 'shared'\)/);
  assert.match(notificationVisibilityMigration, /when 'before' then item\.phase = 'before'/);
  assert.match(notificationVisibilityMigration, /when 'during' then item\.phase in \('before', 'during'\)/);
  assert.match(notificationVisibilityMigration, /when 'after' then item\.phase in \('before', 'during', 'after'\)/);
  assert.match(notificationVisibilityMigration, /now\(\) at time zone 'Europe\/Paris'/);
  assert.match(notificationVisibilityMigration, /join public\.notifications n/);
  assert.match(notificationVisibilityMigration, /n\.dismissed_at is null/);
  assert.doesNotMatch(notificationVisibilityMigration, /select id from public\.daily_session_checklist_items where status/);
});

test("une tâche terminée ne remonte plus et une tâche client n'est pas présentée comme tâche agent", () => {
  assert.doesNotMatch(tasks, /"validated"[^\n]*"not_applicable"[^\n]*daily_session_checklist_items/);
  assert.doesNotMatch(tasks, /\.in\("responsibility", \[[^\]]*"client"/);
});

test("la checklist Studio est une liste simple de tâches à terminer", () => {
  assert.match(sessionTimeline, /Tâches restant à faire/);
  assert.match(sessionTimeline, /<form action=\{completeChecklistItemAction\}>/);
  assert.match(sessionTimeline, /\.update\(\{ status: "validated", validated_by: auth\.userId \}\)/);
  assert.match(sessionTimeline, /\.eq\("id", itemId\)[\s\S]*\.eq\("session_id", sessionId\)/);
  assert.match(sessionTimeline, /isAvailablePhaseItem\(item\.phase, phase\)/);
  assert.match(sessionTimeline, /completed_at/);
  assert.doesNotMatch(sessionTimeline, /value="not_applicable"/);
  assert.doesNotMatch(sessionTimeline, /\? `Échéance \$\{formatDateTime\(task\.due_at\)\}` : task\.status/);
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

test("la validation programme confirme le statut et rafraîchit pilotage et tableau de bord", () => {
  assert.match(programReview, /daily_validate_formation_version/);
  assert.match(programReview, /validatedFormation\.status !== "validated"/);
  assert.match(programReview, /revalidatePath\("\/agent\/daily"\)/);
  assert.match(programReview, /revalidatePath\("\/agent"\)/);
  assert.match(tasks, /formation\.status === "review"/);
});

test("le Studio expose les champs métier du programme client modifiables avant validation", () => {
  assert.match(programReview, /name="detailed_program"/);
  assert.match(programReview, /name="registration_methods"/);
  assert.match(programReview, /name="disability_referent"/);
  assert.match(programReview, /detailed_program: value\(formData, "detailed_program"\)/);
  assert.match(programReview, /registration_methods: value\(formData, "registration_methods"\)/);
});


test("la préparation préformation n'apparaît qu'après validation courante de l'inscription", () => {
  assert.match(tasks, /item\.item_key === "pretraining_documents"/);
  assert.match(tasks, /const registrationResponses = responsesBySession\.get\(session\.id\) \?\? \[\]/);
  assert.match(tasks, /if \(!registrationReviewIsCurrent\(review, latestRegistrationResponse\)\) continue/);
});


test("les tâches validées ou terminées sont absentes de la source active",()=>{assert.match(source,/\.in\("status", \["todo", "in_progress", "to_review", "blocked"\]\)/);assert.doesNotMatch(source,/\.in\("status", \["todo", "in_progress", "to_review", "blocked", "validated"/);});
test("la source canonique accepte un filtre strict par organisme",()=>{assert.match(source,/options\?: \{ organisationId\?: string \| null \}/);assert.match(source,/activeOrganisationIds\.filter\(\(id\) => id === requestedOrganisationId\)/);});
