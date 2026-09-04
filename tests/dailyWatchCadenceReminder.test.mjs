import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/qualite/page.tsx", import.meta.url), "utf8");
const cadence = await readFile(new URL("../src/lib/daily/watchCadence.ts", import.meta.url), "utf8");

test("le rappel mensuel réutilise les veilles existantes sans créer de donnée parallèle", () => {
  assert.match(page, /getDailyWatchCadenceStatus\(watches \?\? \[\]\)/);
  assert.match(page, /au moins un apport par mois et par catégorie/i);
  assert.doesNotMatch(page, /daily_watch_reminders/);
});

test("les deux catégories métier Daily sont suivies chaque mois", () => {
  assert.match(cadence, /type: "regulatory"/);
  assert.match(cadence, /type: "pedagogy_technology"/);
  assert.match(cadence, /currentMonthCovered/);
  assert.match(page, /À alimenter ce mois-ci/);
  assert.match(page, /Dernière publication/);
});

test("les entrées archivées ne valident pas la cadence du mois", () => {
  assert.match(cadence, /entry\.status !== "archived"/);
});
