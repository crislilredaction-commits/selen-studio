import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dailyPage = readFileSync(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
const reviewPage = readFileSync(new URL("../src/app/agent/daily/revues-formateurs/page.tsx", import.meta.url), "utf8");

test("Pilotage Daily exposes the annual trainer review oversight", () => {
  assert.match(dailyPage, /href="\/agent\/daily\/revues-formateurs"/);
  assert.match(dailyPage, /Bilan annuel des compétences formateurs/);
});

test("annual review oversight reuses canonical trainer and review tables", () => {
  assert.match(reviewPage, /\.from\("daily_trainer_profiles"\)/);
  assert.match(reviewPage, /\.from\("daily_trainer_annual_reviews"\)/);
  assert.match(reviewPage, /\.eq\("review_year", year\)/);
  assert.match(reviewPage, /\.eq\("active", true\)/);
});

test("a review is only complete after trainer submission and manager completion", () => {
  assert.match(reviewPage, /review\?\.submitted_at && review\?\.manager_completed_at/);
  assert.match(reviewPage, /Manager à compléter/);
  assert.match(reviewPage, /À faire \/ soumettre/);
});
