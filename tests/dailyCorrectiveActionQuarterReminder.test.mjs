import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/qualite/page.tsx", import.meta.url), "utf8");
const cadence = await readFile(new URL("../src/lib/daily/qualityActionCadence.ts", import.meta.url), "utf8");

test("le rappel trimestriel réutilise daily_quality_actions comme source de vérité", () => {
  assert.match(page, /from\("daily_quality_actions"\)/);
  assert.match(page, /getDailyCorrectiveActionQuarterStatus\(qualityActions \?\? \[\]\)/);
  assert.doesNotMatch(page, /daily_quality_action_reminders/);
});

test("seules les actions correctives ouvertes ou planifiées sont à revoir", () => {
  assert.match(cadence, /action\.category === "corrective_action"/);
  assert.match(cadence, /\["open", "planned"\]\.includes/);
  assert.match(cadence, /dueForReviewCount/);
});

test("une activité pendant le trimestre évite un rappel inutile", () => {
  assert.match(cadence, /quarterStart/);
  assert.match(cadence, /action\.updated_at/);
  assert.match(page, /mise à jour pendant le trimestre/i);
  assert.match(page, /à revoir/i);
});
