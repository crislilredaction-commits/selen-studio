import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const learnersPage = readFileSync(new URL("../src/app/agent/daily/learners/page.tsx", import.meta.url), "utf8");
const communicationsPage = readFileSync(new URL("../src/app/agent/daily/communications/page.tsx", import.meta.url), "utf8");

test("la vue apprenants garde une largeur fluide et évite les débordements de contenu", () => {
  assert.match(learnersPage, /padding:\s*"clamp\(16px, 4vw, 28px\)"/);
  assert.match(learnersPage, /minmax\(min\(160px,100%\),1fr\)/);
  assert.match(learnersPage, /overflowWrap:\s*"anywhere"/);
  assert.match(learnersPage, /minWidth:0/);
});

test("les preuves de communication restent lisibles avec des identifiants longs", () => {
  assert.match(communicationsPage, /padding:\s*"clamp\(16px, 4vw, 28px\)"/);
  assert.match(communicationsPage, /overflowWrap:\s*"anywhere"/);
  assert.match(communicationsPage, /wordBreak:\s*"break-all"/);
  assert.match(communicationsPage, /maxWidth:\s*"100%"/);
});

test("les actions des vues détaillées restent repliables plutôt que forcées sur une ligne", () => {
  assert.match(learnersPage, /flexWrap:"wrap"/);
  assert.match(communicationsPage, /flexWrap:\s*"wrap"/);
});
