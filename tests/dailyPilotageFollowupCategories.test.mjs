import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyFollowupCategory, dailyFollowupCategory, countDailyFollowupCategories, filterDailyFollowupCategories } from "../src/lib/daily/pilotageFollowupCategories.mjs";
import { filterDailyFollowupViews } from "../src/lib/daily/pilotageFollowupViews.mjs";
import { paginateDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";

const followups = [
  { id: "a", reminderType: "daily_attendance_correction", dueAt: null, overdueShared: true, assignedAgentProfileId: "agent-1" },
  { id: "b", reminderType: "daily_signature_pending_72h", dueAt: "2026-10-25", overdueShared: false, assignedAgentProfileId: "agent-2" },
  { id: "c", reminderType: "daily_document_missing", dueAt: null, overdueShared: false, assignedAgentProfileId: "agent-1" },
  { id: "d", reminderType: "daily_satisfaction", dueAt: "2026-10-24", overdueShared: true, assignedAgentProfileId: "agent-1" },
  { id: "e", reminderType: "daily_custom_followup", dueAt: "2026-10-24", overdueShared: false, assignedAgentProfileId: "agent-1" },
];

test("la catégorie est bornée, sans accepter des paramètres multiples", () => {
  assert.equal(normalizeDailyFollowupCategory("attendance"), "attendance");
  assert.equal(normalizeDailyFollowupCategory(["attendance", "other"]), "all");
  assert.equal(normalizeDailyFollowupCategory("ATTENDANCE"), "all");
  assert.equal(normalizeDailyFollowupCategory("__proto__"), "all");
});

test("les familles distinguent émargement, signature, document, retour et autre", () => {
  assert.deepEqual(followups.map(dailyFollowupCategory), ["attendance", "signature", "documents", "feedback", "other"]);
  assert.equal(dailyFollowupCategory({ reminderType: "daily_emargement_signature" }), "attendance");
  assert.equal(dailyFollowupCategory({ reminderType: "DAILY_EVALUATION" }), "feedback");
  assert.equal(dailyFollowupCategory({ reminderType: null }), "other");
});

test("les compteurs ne mutent ni ordre, ni attributions, ni objets", () => {
  const snapshot = structuredClone(followups);
  assert.deepEqual(countDailyFollowupCategories(followups), { all: 5, attendance: 1, signature: 1, documents: 1, feedback: 1, other: 1 });
  assert.deepEqual(followups, snapshot);
});

test("les filtres sont purement locaux et conservent les références canoniques", () => {
  const filtered = filterDailyFollowupCategories(followups, "documents");
  assert.deepEqual(filtered.map(item => item.id), ["c"]);
  assert.equal(filtered[0], followups[2]);
  assert.equal(filterDailyFollowupCategories(followups, "all")[0], followups[0]);
});

test("une catégorie ne réintroduit jamais une relance non autorisée", () => {
  const authorised = followups.filter(item => item.assignedAgentProfileId === "agent-1");
  assert.deepEqual(filterDailyFollowupCategories(authorised, "signature"), []);
  assert.equal(countDailyFollowupCategories(authorised).all, 4);
});

test("recherche et vue peuvent être combinées à une catégorie avant pagination", () => {
  const shared = filterDailyFollowupViews(followups, "shared");
  const attendance = filterDailyFollowupCategories(shared, "attendance");
  assert.deepEqual(attendance.map(item => item.id), ["a"]);
  assert.equal(paginateDailyPilotageTasks(attendance, "2", 10).page, 1);
  assert.deepEqual(filterDailyFollowupCategories(shared, "signature"), []);
});

test("les catégories inconnues gardent la vue générale sans mutation", () => {
  const snapshot = structuredClone(followups);
  assert.deepEqual(filterDailyFollowupCategories(followups, ["signature", "documents"]), followups);
  assert.deepEqual(followups, snapshot);
});

test("le pilotage classe après droits et vue, avant pagination, et conserve les filtres", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /await requireSupportAgent\(\)/);
  assert.match(page, /getStudioClientFollowups\(staff, \{ dailyOnly: true \}\)/);
  assert.match(page, /normalizeDailyFollowupCategory\(params\?\.rc\)/);
  assert.match(page, /countDailyFollowupCategories\(viewFilteredFollowups\)/);
  assert.match(page, /filterDailyFollowupCategories\(viewFilteredFollowups, selectedFollowupCategory\)/);
  assert.match(page, /paginateDailyPilotageTasks\(filteredFollowups, params\?\.relances, 10\)/);
  assert.match(page, /aria-label="Filtrer les relances par action"/);
  assert.match(page, /query\.set\("rc", selectedFollowupCategory\)/);
  assert.match(page, /name="rc" value=\{selectedFollowupCategory\}/);
});
