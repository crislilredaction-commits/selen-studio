import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { paginateDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";

const followups = Array.from({ length: 27 }, (_, index) => ({
  id: `relance-${index}`,
  href: `/agent/daily/dossier-${index}`,
  dueAt: "2026-10-25T08:00:00Z",
}));
const tasks = Array.from({ length: 42 }, (_, index) => ({ id: `tache-${index}` }));

test("les relances sont paginées par dix sans perte, doublon ni mutation", () => {
  const pages = [1, 2, 3].map(page => paginateDailyPilotageTasks(followups, String(page), 10));
  assert.deepEqual(pages.map(page => [page.from, page.to]), [[1, 10], [11, 20], [21, 27]]);
  assert.deepEqual(pages.flatMap(page => page.items.map(item => item.id)), followups.map(item => item.id));
  assert.equal(new Set(pages.flatMap(page => page.items)).size, followups.length);
  assert.equal(pages[1].items[0], followups[10]);
  assert.equal(followups.length, 27);
});

test("les deux paginations sont indépendantes", () => {
  const taskPage = paginateDailyPilotageTasks(tasks, "2");
  const followupPage = paginateDailyPilotageTasks(followups, "3", 10);
  assert.equal(taskPage.page, 2);
  assert.equal(taskPage.items[0], tasks[20]);
  assert.equal(followupPage.page, 3);
  assert.equal(followupPage.items[0], followups[20]);
});

test("les paramètres de relances invalides sont ignorés ou bornés", () => {
  for (const invalid of [["1", "2"], "0", "-2", "NaN", undefined]) {
    assert.equal(paginateDailyPilotageTasks(followups, invalid, 10).page, 1);
  }
  assert.equal(paginateDailyPilotageTasks(followups, "999999", 10).page, 3);
  assert.deepEqual(paginateDailyPilotageTasks([], "4", 10).items, []);
});

test("l'interface sépare les liens de pages tout en conservant la recherche et les filtres", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /paginateDailyPilotageTasks\(allSortedTasks, params\?\.page\)/);
  assert.match(page, /filterDailyFollowupViews\(matchingFollowups, selectedFollowupView\)/);
  assert.match(page, /paginateDailyPilotageTasks\(filteredFollowups, params\?\.relances, 10\)/);
  assert.match(page, /visibleFollowups\.map\(\(item\)/);
  assert.match(page, /query\.set\("vue", selectedView\)/);
  assert.match(page, /query\.set\("q", searchQuery\)/);
  assert.match(page, /query\.set\("page", String\(pagination\.page\)\)/);
  assert.match(page, /query\.set\("relances", String\(followupPagination\.page\)\)/);
  assert.match(page, /aria-label="Pages des relances Daily"/);
  assert.match(page, /id="relances-daily"/);
  assert.match(page, /#relances-daily/);
});

test("la pagination ne contourne ni l'authentification ni les périmètres agent", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireSupportAgent\(\)/);
  assert.match(page, /if \(!auth\.ok\) return/);
  assert.match(page, /getStudioClientFollowups\(staff, \{ dailyOnly: true \}\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
  assert.match(page, /Traitement réservé à l’agent assigné/);
});
