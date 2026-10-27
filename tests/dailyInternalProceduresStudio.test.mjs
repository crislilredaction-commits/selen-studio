import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const proceduresPage = readFileSync(new URL("../src/app/agent/daily/procedures-internes/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily expose le suivi des procédures internes", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/procedures-internes"/);
  assert.match(dailyPage, /Procédures internes/);
});

test("le suivi réutilise daily_internal_procedures sans stockage parallèle", () => {
  assert.match(proceduresPage, /\.from\("daily_internal_procedures"\)/);
  assert.match(proceduresPage, /daily_internal_procedures<\/code>/);
  assert.doesNotMatch(proceduresPage, /daily_internal_procedure_reminders/);
});

test("Studio reconnaît les quatre procédures internes Daily", () => {
  assert.match(proceduresPage, /learner_administration: "Parcours administratif apprenant"/);
  assert.match(proceduresPage, /stakeholder_satisfaction: "Satisfaction des parties prenantes"/);
  assert.match(proceduresPage, /absence_dropout: "Absences et abandons"/);
  assert.match(proceduresPage, /difficulties_hazards: "Prévention des difficultés et aléas"/);
});

test("la vue est bornée aux organismes dont Daily est actif", () => {
  assert.match(proceduresPage, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.doesNotMatch(proceduresPage, /getActiveDailyOrganisationIds/);
  assert.match(proceduresPage, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(proceduresPage, /\.in\("id", dailyOrganisationIds\)/);
  assert.match(proceduresPage, /\.neq\("status", "archived"\)/);
});

test("la vue signale les brouillons et la revue documentaire annuelle", () => {
  assert.match(proceduresPage, /procedure\.status === "draft"/);
  assert.match(proceduresPage, /365 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(proceduresPage, /Revue annuelle à prévoir/);
  assert.match(proceduresPage, /vérifiée au moins une fois par an/i);
});

test("la vue Studio reste en lecture seule", () => {
  assert.match(proceduresPage, /requireSupportAgent\(\)/);
  assert.doesNotMatch(proceduresPage, /\.insert\(/);
  assert.doesNotMatch(proceduresPage, /\.update\(/);
  assert.doesNotMatch(proceduresPage, /\.delete\(/);
  assert.doesNotMatch(proceduresPage, /\.upsert\(/);
});

const scope = readFileSync(new URL("../src/lib/server/dailyOrganisationScope.ts", import.meta.url), "utf8");

test("procédures : accès agent vérifié avant périmètre et lecture service-role", () => {
  const auth = proceduresPage.indexOf("const auth = await requireSupportAgent()");
  const guard = proceduresPage.indexOf("if (!auth.ok)", auth);
  const scopeCall = proceduresPage.indexOf("getDailyOrganisationIdsForAgent(auth.email)", auth);
  const admin = proceduresPage.indexOf("createSupabaseAdminClient()", auth);
  const firstRead = proceduresPage.indexOf('.from("daily_internal_procedures")', auth);
  assert.ok(auth >= 0 && auth < guard && guard < scopeCall && scopeCall < admin && admin < firstRead);
});

test("procédures : erreur de périmètre en refus fermé, zéro OF sans lecture métier", () => {
  assert.match(proceduresPage, /try \{[\s\S]*getDailyOrganisationIdsForAgent\(auth\.email\)[\s\S]*\} catch \{/);
  assert.match(proceduresPage, /Impossible de vérifier votre périmètre Daily/);
  assert.match(proceduresPage, /if \(dailyOrganisationIds\.length === 0\)[\s\S]*Aucun organisme Daily affecté/);
  assert.ok(proceduresPage.indexOf("if (dailyOrganisationIds.length === 0)") < proceduresPage.indexOf("createSupabaseAdminClient()"));
});

test("procédures : lectures limitées aux organismes affectés, sans mutation", () => {
  assert.match(proceduresPage, /\.from\("daily_internal_procedures"\)[\s\S]*?\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(proceduresPage, /\.from\("organisations"\)[\s\S]*?\.in\("id", dailyOrganisationIds\)/);
  assert.doesNotMatch(proceduresPage, /\.(?:insert|upsert|update|delete)\(/);
});

test("procédures : l'admin conserve son périmètre global, l'agent reste affecté", () => {
  assert.match(scope, /adminUser\?\.role === "admin" \|\| profile\?\.role === "admin"/);
  assert.match(scope, /\.eq\("agent_profile_id", profile\.id\)/);
  assert.match(scope, /activeSet\.has\(organisationId\)/);
});
