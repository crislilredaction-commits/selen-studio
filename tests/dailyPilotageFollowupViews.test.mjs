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
  assert.equal(normalizeDailyFollowupView("overdue"), "overdue");
  assert.equal(normalizeDailyFollowupView(["shared", "undated"]), "all");
  assert.equal(normalizeDailyFollowupView("inconnu"), "all");
});

test("les compteurs restent indépendants des vues et n'altèrent pas les relances", () => {
  const snapshot = structuredClone(items);
  assert.deepEqual(countDailyFollowupViews(items, new Date("2026-10-25T18:00:00Z")), { all: 4, undated: 2, overdue: 1, shared: 2 });
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
  assert.deepEqual(countDailyFollowupViews(visible, new Date("2026-10-25T18:00:00Z")), { all: 2, undated: 1, overdue: 0, shared: 0 });
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
  assert.match(page, /key: "overdue", label: "En retard", count: followupCounts\.overdue/);
  assert.match(page, /query\.set\("rv", selectedFollowupView\)/);
  assert.match(page, /name="rv" value=\{selectedFollowupView\}/);
  assert.match(page, /await requireSupportAgent\(\)/);
});

test("les relances en retard sont calculées à l'instant précis, sans inclure les échéances futures ou absentes", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  assert.deepEqual(filterDailyFollowupViews(items, "overdue", now).map(x => x.id), ["b"]);
  assert.equal(countDailyFollowupViews(items, now).overdue, 1);
  assert.deepEqual(items.map(x => x.id), ["a", "b", "c", "d"]);
});

test("une date invalide ou égale à maintenant n'est pas classée en retard", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  const cases = [
    { id: "invalid", dueAt: "invalid", overdueShared: true },
    { id: "exact", dueAt: "2026-10-25T18:00:00Z" },
    { id: "before", dueAt: "2026-10-25T17:59:59Z" },
    { id: "after", dueAt: "2026-10-25T18:00:01Z" },
    { id: "blank", dueAt: "" },
    { id: "null", dueAt: null },
  ];
  assert.deepEqual(filterDailyFollowupViews(cases, "overdue", now).map(x => x.id), ["before"]);
  assert.equal(countDailyFollowupViews(cases, now).overdue, 1);
});

test("le filtre en retard respecte les droits en amont et conserve les références", () => {
  const now = new Date("2026-10-25T18:00:00Z");
  const visible = items.filter(x => x.assignedAgentProfileId === "agent-1");
  assert.deepEqual(filterDailyFollowupViews(visible, "overdue", now), []);
  const overdue = filterDailyFollowupViews(items, "overdue", now);
  assert.equal(overdue[0], items[1]);
  assert.equal(overdue[0].assignedAgentProfileId, "agent-2");
});

test("le filtre en retard se combine aux familles d'action et à la pagination", async () => {
  const { filterDailyFollowupCategories } = await import("../src/lib/daily/pilotageFollowupCategories.mjs");
  const now = new Date("2026-10-25T18:00:00Z");
  const mixed = [
    { id: "signature", reminderType: "daily_signature", dueAt: "2026-10-25T16:00:00Z" },
    { id: "document", reminderType: "daily_document", dueAt: "2026-10-25T17:00:00Z" },
    { id: "future", reminderType: "daily_signature", dueAt: "2026-10-26T17:00:00Z" },
  ];
  const overdue = filterDailyFollowupViews(mixed, "overdue", now);
  assert.deepEqual(filterDailyFollowupCategories(overdue, "signature").map(x => x.id), ["signature"]);
  assert.deepEqual(paginateDailyPilotageTasks(overdue, "2", 10).items.map(x => x.id), ["signature", "document"]);
});
