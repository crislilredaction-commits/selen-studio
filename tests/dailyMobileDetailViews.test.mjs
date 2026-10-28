import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const learnersPage = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");
const communicationsPage = readFileSync(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");
const communicationsCss = readFileSync(new URL("../src/app/agent/daily/communications/communications-mobile.module.css", import.meta.url), "utf8");
const pretrainingPage = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");

test("la vue apprenants garde une largeur fluide et évite les débordements de contenu", () => {
  assert.match(learnersPage, /padding:\s*"clamp\(16px, 4vw, 28px\)"/);
  assert.match(learnersPage, /minmax\(min\(160px,100%\),1fr\)/);
  assert.match(learnersPage, /overflowWrap:\s*"anywhere"/);
  assert.match(learnersPage, /minWidth:0/);
});

test("les preuves de communication restent lisibles avec des identifiants longs", () => {
  assert.match(communicationsCss, /\.page \{[^}]*padding: 28px 28px 64px;/);
  assert.match(communicationsCss, /@media \(max-width: 820px\) \{[\s\S]*?\.page \{ padding: 18px 16px 48px; \}/);
  assert.match(communicationsPage, /overflowWrap:\s*"anywhere"/);
  assert.match(communicationsPage, /wordBreak:\s*"break-all"/);
  assert.match(communicationsCss, /\.messageContent \{[^}]*max-width: 100%;/);
  assert.match(communicationsCss, /\.messageContent \{[^}]*word-break: break-word;/);
});

test("les actions des vues détaillées restent repliables plutôt que forcées sur une ligne", () => {
  assert.match(learnersPage, /flexWrap:"wrap"/);
  assert.match(communicationsCss, /\.actions \{ display: flex; flex-wrap: wrap;/);
  assert.match(communicationsCss, /@media \(max-width: 520px\) \{[\s\S]*?\.actions \{ display: grid;/);
});

test("la préparation préformation reste tactile et fluide sur mobile", () => {
  assert.match(pretrainingPage, /@media \(max-width: 640px\)/);
  assert.match(pretrainingPage, /overflow-wrap:\s*anywhere/);
  assert.match(pretrainingPage, /label:has\(> select\)[\s\S]*?width:\s*100%[\s\S]*?min-width:\s*0/);
  assert.match(pretrainingPage, /select\s*\{[\s\S]*?min-width:\s*0 !important[\s\S]*?min-height:\s*44px/);
  assert.match(pretrainingPage, /iframe\s*\{[\s\S]*?height:\s*min\(70vh, 560px\) !important/);
});
