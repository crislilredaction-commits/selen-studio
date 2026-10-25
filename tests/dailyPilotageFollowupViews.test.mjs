import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyFollowupView, countDailyFollowupViews, filterDailyFollowupViews } from "../src/lib/daily/pilotageFollowupViews.mjs";
import { paginateDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";
import { searchDailyPilotageTasks } from "../src/lib/daily/pilotageTaskSearch.mjs";

const items = [
  { id: "a", title: "Signature Anaïs", dueAt: null, overdueShared: false, assignedAgentProfileId: "agent-1" },
  { id: "b", title: "Pièce Léa", dueAt: "2026-10-25T12:00:00Z", overdueShared: true, assignedAgentProfileId: "agent-2" },
  { id: "c", title: "Convention", dueAt: "2026-10-26T12:00:00Z", overdueShared: false, assignedAgentProfileId: "agent-1" },
  { id: "d", title: "Sans date", dueAt: null, overdueShared: true, assignedAgentProfileId: "agent-2" },
];

test("les vues sont bornées et les paramètres multiples ignorés", () => {
  assert.equal(normalizeDailyFollowupView("shared"), "shared");
  assert.equal(normalizeDailyFollowupView("undated"), "undated");
  assert.equal(normalizeDailyFollowupView(["shared", "undated"]), "all");
  assert.equal(normalizeDailyFollowupView("inconnu"), "all");
});

test("les compteurs restent indépendants des vues et n'altèrent pas les relances", () => {
  const snapshot = structuredClone(items);
  assert.deepEqual(countDailyFollowupViews(items), { all: 4, undated: 2, shared: 2 });
  assert.deepEqual(items, snapshot);
});

test("les relances sans échéance restent visibles, y compris lorsqu'elles sont partagées", () => {
  assert.deepEqual(filterDailyFollowupViews(items, "undated").map(x => x.id), ["a", "d"]);
  assert.deepEqual(filterDailyFollowupViews(items, "shared").map(x => x.id), ["b", "d"]);
});

test("le filtrage préserve ordre, identité et attribution sans mutation", () => {
  const snapshot = structuredClone(items);
  const result = filterDailyFollowupViews(items, "shared");
  assert.equal(result[0], items[1]);
  assert.equal(result[0].assignedAgentProfileId, "agent-2");
  assert.deepEqual(items, snapshot);
});

test("le filtrage ne réintroduit pas les relances masquées par les droits serveur", () => {
  const visible = items.filter(x => x.assignedAgentProfileId === "agent-1");
  assert.deepEqual(filterDailyFollowupViews(visible, "shared"), []);
  assert.deepEqual(countDailyFollowupViews(visible), { all: 2, undated: 1, shared: 0 });
});

test("recherche, vue puis pagination ne changent pas la pagination des tâches", () => {
  const expanded = Array.from({ length: 25 }, (_, i) => ({
    id: String(i), title: "Signature", dueAt: i % 2 ? "2026-10-25" : null, overdueShared: i % 2 === 0,
  }));
  const searched = searchDailyPilotageTasks(expanded, "signature", x => x.title);
  const page = paginateDailyPilotageTasks(filterDailyFollowupViews(searched, "shared"), "2", 10);
  assert.deepEqual(page.items.map(x => x.id), ["20", "22", "24"]);
  assert.equal(paginateDailyPilotageTasks(expanded, "2", 20).total, 25);
});

test("l'interface utilise les vues sur les relances déjà autorisées et préserve la recherche", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /getStudioClientFollowups\(staff, \{ dailyOnly: true \}\)/);
  assert.match(page, /normalizeDailyFollowupView\(params\?\.rv\)/);
  assert.match(page, /countDailyFollowupViews\(matchingFollowups\)/);
  assert.match(page, /filterDailyFollowupViews\(matchingFollowups, selectedFollowupView\)/);
  assert.match(page, /paginateDailyPilotageTasks\(filteredFollowups, params\?\.relances, 10\)/);
  assert.match(page, /aria-label="Filtrer les relances Daily"/);
  assert.match(page, /query\.set\("rv", selectedFollowupView\)/);
  assert.match(page, /name="rv" value=\{selectedFollowupView\}/);
  assert.match(page, /await requireSupportAgent\(\)/);
});
