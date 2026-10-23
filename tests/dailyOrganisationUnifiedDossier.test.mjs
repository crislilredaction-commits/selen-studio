import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/agent/daily/organisations/[id]/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/agent/daily/organisations/[id]/layout.tsx", import.meta.url), "utf8");

test("le dossier et toutes ses mutations restent bornés au périmètre de l’agent", () => {
  assert.match(page, /isDailyOrganisationInAgentScope\(auth\.email, id\)/);
  assert.match(page, /async function assertOrganisationScope/);
  assert.ok((page.match(/await assertOrganisationScope\(auth\.email, organisationId\)/g) ?? []).length >= 6);
  assert.match(page, /\.eq\("organisation_id", id\)/);
  assert.match(page, /\.in\("session_id", sessionIds\)/);
});

test("les informations OF sont modifiables par liste blanche et historisées", () => {
  assert.match(page, /const editableOrganisationFields = \[/);
  assert.match(page, /form action=\{updateOrganisationInformation\}/);
  assert.match(page, /organisation_information_updated/);
  assert.match(page, /before_data: before/);
  assert.match(page, /after_data: after/);
  assert.match(page, /type: "selen_admin"/);
  assert.match(page, /type: "selen_operator"/);
  assert.match(page, /origin: "Studio"/);
  assert.match(page, /Le SIRET doit contenir 14 chiffres/);
});

test("l’interface retire checklist et validation Selen sans toucher aux données", () => {
  assert.doesNotMatch(page, /key: "checklist"/);
  assert.doesNotMatch(page, /key: "validations"/);
  assert.doesNotMatch(page, /tab === "checklist"/);
  assert.doesNotMatch(page, /tab === "validations"/);
});

test("les outils spécialisés restent accessibles sans surcharger la synthèse", () => {
  assert.match(layout, /<details/);
  assert.match(layout, /Actions complémentaires/);
  assert.doesNotMatch(layout, /\?tab=programs/);
  assert.doesNotMatch(layout, /\?tab=documents/);
  for (const route of ["onboarding-documents", "import-document", "qualiopi-cycle", "trainer-certification-proofs"]) {
    assert.match(layout, new RegExp(`/\\$\\{id\\}/${route}`));
  }
  assert.match(layout, /Importer en délégation/);
  assert.match(layout, /daily\/organisation-assignment/);
});

test("la vue d’ensemble classe les sessions canoniques", () => {
  assert.match(page, /async function readAllRows/);
  assert.match(page, /const plannedSessions =/);
  assert.match(page, /const currentSessions =/);
  assert.match(page, /const sessionsToClose =/);
  assert.match(page, /from\("daily_session_dossiers"\)/);
  assert.match(page, /dossierBySessionId\.get\(session\.id\)\?\.status/);
  assert.match(page, /title="À venir" sessions=\{plannedSessions\}/);
  assert.match(page, /title="En cours" sessions=\{currentSessions\}/);
  assert.match(page, /title="À clôturer" sessions=\{sessionsToClose\}/);
  assert.match(page, /\/agent\/daily\/session-dossiers\/\$\{session\.id\}\/full/);
});

test("la synthèse replie les longues listes de tâches sans perdre leur ordre ni leurs liens", () => {
  assert.match(page, /const visibleOrganisationTasks = scopedDailyTasks\.slice\(0, 5\)/);
  assert.match(page, /const additionalOrganisationTasks = scopedDailyTasks\.slice\(5\)/);
  assert.match(page, /visibleOrganisationTasks\.map/);
  assert.match(page, /additionalOrganisationTasks\.length > 0/);
  assert.match(page, /Afficher \{additionalOrganisationTasks\.length\} autres tâches actives/);
  assert.match(page, /additionalOrganisationTasks\.map/);
  assert.ok((page.match(/href=\{item\.href\}/g) ?? []).length >= 2);
});

test("les espaces apprenants conservent les inscriptions closes et leur identité stable", () => {
  assert.match(page, /key: "learners", label: "Espaces apprenants"/);
  assert.match(page, /learner_id,session_id,status/);
  assert.match(page, /enrolment\.learner_id === learner\.id/);
  assert.doesNotMatch(page, /enrolment\.status === "active"/);
});

test("l’historique unifie les sources réelles attendues", () => {
  for (const source of ["daily_audit_logs", "daily_communications", "daily_documents", "daily_convention_signatures", "daily_organisation_profile_change_requests"]) {
    assert.match(page, new RegExp(`from\\("${source}"\\)`));
  }
  assert.match(page, /Historique unifié/);
  assert.match(page, /kind: "Email"/);
  assert.match(page, /kind: "Document"/);
  assert.match(page, /kind: "Signature"/);
  assert.match(page, /kind: "Retour OF"/);
  assert.doesNotMatch(page, /\.slice\(0, 200\)/);
});
