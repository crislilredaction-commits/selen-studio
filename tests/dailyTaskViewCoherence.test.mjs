import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../src/components/agent/AgentHomeDashboard.tsx", import.meta.url), "utf8");
const pilotage = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const presentation = await readFile(new URL("../src/lib/dailyTaskPresentation.ts", import.meta.url), "utf8");

test("Dashboard et Pilotage utilisent la même présentation des données Daily", () => {
  assert.match(dashboard, /presentDailyTask\(item\.daily\)/);
  assert.match(pilotage, /presentDailyTask\(item\)/);
  for (const label of ["Statut :", "Priorité :", "Contexte :", "Action", "Échéance :"]) {
    assert.match(dashboard, new RegExp(label));
    assert.match(pilotage, new RegExp(label));
  }
  assert.match(presentation, /statusLabel/);
  assert.match(presentation, /priorityLabel/);
});

test("le Dashboard conserve les autres prestations et compte toute la file active", () => {
  assert.match(dashboard, /\.\.\.sessionDossiers/);
  assert.match(dashboard, /\.\.\.assigned\.map\(dossierItem\)/);
  assert.match(dashboard, /\.\.\.preauditTasks/);
  assert.match(dashboard, /count=\{actionDossiers\.length\}/);
  assert.doesNotMatch(dashboard, /const actionDossiers[\s\S]{0,180}\.slice\(/);
});
