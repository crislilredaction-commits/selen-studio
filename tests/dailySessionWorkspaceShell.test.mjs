import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("src/app/agent/daily/session-dossiers/[id]/layout.tsx");
const navigation = read("src/app/agent/daily/session-dossiers/[id]/SessionWorkspaceNavigation.tsx");
const responsive = read("src/app/agent/daily/session-dossiers/[id]/session-workspace.module.css");

test("le shell session borne le contexte avant d’afficher le dossier", () => {
  assert.match(layout, /requireSupportAgent\(\)/);
  assert.match(layout, /isDailyOrganisationInAgentScope\(auth\.email, session\.organisation_id\)/);
  assert.match(layout, /\.eq\("organisation_id", session\.organisation_id\)/);
});
test("le fil d’Ariane conserve l’onglet Sessions de l’organisme", () => {
  assert.match(layout, /aria-label="Fil d’Ariane"/);
  assert.match(layout, /\?tab=sessions/);
  assert.match(layout, /Organisme → session → dossier/);
  assert.match(layout, /Ouvrir le dossier unifié/);
});
test("les quatre phases conservent uniquement leurs actions contextuelles", () => {
  for (const stage of ["overview", "before", "during", "after"]) assert.match(navigation, new RegExp(`id: "${stage}"`));
  for (const tool of ["Programme & inscriptions", "Documents avant formation", "Chronologie", "Suivi pendant", "Émargements collectifs", "Évaluation", "Satisfaction", "Clôture"]) assert.match(navigation, new RegExp(tool));
  assert.match(navigation, /toolStages/);
  assert.match(navigation, /phaseActions\(sessionId\)\[activeStage\]/);
  assert.match(navigation, /Actions · \{activeStageDetails\.label\}/);
  assert.doesNotMatch(navigation, /Outils de cette session/);
});
test("la navigation est responsive", () => {
  assert.match(responsive, /@media\(max-width:560px\)/);
  assert.match(responsive, /grid-template-columns:1fr/);
  assert.match(responsive, /width:100%/);
});
test("les outils reviennent à leur phase du dossier unifié", () => {
  for (const path of ["satisfaction/page.tsx", "evaluation/page.tsx", "closure/page.tsx"]) assert.match(read(`src/app/agent/daily/session-dossiers/[id]/${path}`), /full#apres-formation/);
  assert.match(read("src/app/agent/daily/session-dossiers/[id]/followup/page.tsx"), /full#pendant-formation/);
});

test("le traitement historique des inscriptions partage le shell sécurisé de la session", () => {
  const registrationLayout = read("src/app/agent/daily/sessions/[id]/layout.tsx");
  const registrationPage = read("src/app/agent/daily/sessions/[id]/page.tsx");
  const dossier = read("src/app/agent/daily/session-dossiers/[id]/full/page.tsx");
  assert.ok(registrationLayout.includes("SessionDossierLayout"));
  assert.ok(registrationLayout.includes("<SessionDossierLayout {...props} />"));
  assert.ok(navigation.includes("Contrôler les inscriptions"));
  assert.ok(navigation.includes("/agent/daily/sessions/${encodeURIComponent(sessionId)}"));
  assert.ok(registrationPage.includes("loadScopedDailySessionPrerequisites(admin, auth.email, id)"));
  assert.ok(registrationPage.includes("patchSummaryValidationAction(legacy, blockedReason)"));
  assert.ok(dossier.includes("/agent/daily/sessions/${id}"));
});
