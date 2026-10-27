import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app/agent/daily/revues-formateurs/page.tsx", import.meta.url), "utf8");

test("annual review triage keeps the agent boundary before filtering", () => {
  assert.match(source, /requireSupportAgent\(\)/);
  assert.match(source, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(source, /\.in\("organisation_id", scopedOrganisationIds\)/);
  assert.match(source, /const scopedOrganisationIds = selectedOrganisation \? \[selectedOrganisation\] : dailyOrganisationIds/);
  assert.match(source, /if \(selectedOrganisation === null\)/);
  assert.match(source, /\.in\("trainer_profile_id", trainerIds\)/);
  assert.match(source, /const visibleRows = rows/);
  assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete)\(/);
});

test("year selection is bounded and applied to canonical annual reviews", () => {
  assert.match(source, /Array\.from\(\{ length: 5 \}/);
  assert.match(source, /years\.includes\(requestedYear\) \? requestedYear : currentYear/);
  assert.match(source, /\.eq\("review_year", year\)/);
  assert.match(source, /name="year"/);
});

test("search normalizes accents and caps user input", () => {
  assert.match(source, /\.normalize\("NFD"\)/);
  assert.match(source, /\.toLocaleLowerCase\("fr"\)/);
  assert.match(source, /one\(params\.q\)\.trim\(\)\.slice\(0, 80\)/);
  assert.match(source, /trainer\.display_name, trainer\.professional_email/);
  assert.match(source, /name="q" type="search" maxLength=\{80\}/);
});

test("review state filters distinguish trainer, manager and completed", () => {
  assert.match(source, /review\?\.submitted_at && review\?\.manager_completed_at/);
  assert.match(source, /state === "manager" && priority === 0/);
  assert.match(source, /state === "trainer" && priority === 1/);
  assert.match(source, /state === "complete" && priority === 2/);
  assert.match(source, /\["all", "manager", "trainer", "complete"\]\.includes/);
});

test("review list is prioritized, counts match the selected scope and empty filters are explained", () => {
  assert.match(source, /\.sort\(\(a, b\) => reviewPriority\(a\.review\) - reviewPriority\(b\.review\)/);
  assert.match(source, /visibleRows\.map\(/);
  assert.match(source, /visibleRows\.length\} bilan\(s\) affiché\(s\) sur \{rows\.length\}/);
  assert.match(source, /Aucun bilan ne correspond aux filtres sélectionnés/);
  assert.match(source, /href="\/agent\/daily\/revues-formateurs"/);
});
