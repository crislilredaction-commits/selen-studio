import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../src/app/agent/daily/escalations/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/app/agent/daily/escalations/escalations-mobile.module.css", import.meta.url), "utf8");

test("escalades : filtres, historique, actions admin et cartes adaptés au mobile", () => {
  for (const name of ["page", "header", "filters", "filterLabel", "sectionHead", "list", "card", "cardHead", "date", "actions", "adminGrid", "historyList", "historyRow"]) {
    assert.match(page, new RegExp("className=\\{styles\\." + name + "\\}"));
  }
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /\.adminGrid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.actions \{ display: grid; grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.cardHead \{ flex-direction: column;/);
  assert.match(css, /\.card \{ min-width: 0; overflow-wrap: anywhere; \}/);
});

test("escalades : saisies admin nommées et actions accessibles au clavier", () => {
  assert.match(page, /aria-label="Instruction à transmettre à l’agent"/);
  assert.match(page, /aria-label="Résolution apportée à l’escalade"/);
  assert.match(page, /className=\{styles\.actionLink\}/);
  assert.match(page, /className=\{styles\.actionButton\}/);
  assert.match(css, /\.actionLink:focus-visible/);
  assert.match(css, /\.history summary:focus-visible/);
});

test("escalades : périmètre agent et formulaires métier inchangés", () => {
  assert.match(page, /requireSupportAgent\(\)/);
  assert.match(page, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(page, /\.eq\("escalated_by", profile\.id\)\.in\("organisation_id", organisationIds\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item,/);
  assert.match(page, /\.eq\("organisation_id", session\.organisation_id\)/);
  assert.match(page, /triageEscalations\(escalations, filters, emailById, isAdmin\)/);
  for (const action of ["create", "take", "return", "resolve"]) assert.match(page, new RegExp('name="action" value="' + action + '"'));
  assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\(/);
});
