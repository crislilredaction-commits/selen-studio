import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeDailyPilotageQuery, searchDailyPilotageTasks } from "../src/lib/daily/pilotageTaskSearch.mjs";
import { paginateDailyPilotageTasks } from "../src/lib/daily/pilotageTaskQueue.mjs";

const followups = [
  { id: "a", title: "Émargement Anaïs", detail: "Session automne", reminderType: "daily_attendance", assignedAgentProfileId: "agent-1", overdueShared: false },
  { id: "b", title: "Relance dossier Léa", detail: "Justificatif manquant", reminderType: "daily_document", assignedAgentProfileId: "agent-2", overdueShared: true },
  { id: "c", title: "Signature entreprise", detail: "Convention à signer", reminderType: "daily_signature", assignedAgentProfileId: "agent-1", overdueShared: false },
];
const searchable = item => [item.title, item.detail, item.reminderType].join(" ");

test("la recherche des relances normalise les accents, la casse et l'ordre des mots", () => {
  assert.deepEqual(searchDailyPilotageTasks(followups, "automne EMARGEMENT", searchable).map(x => x.id), ["a"]);
  assert.deepEqual(searchDailyPilotageTasks(followups, "LEA justificatif", searchable).map(x => x.id), ["b"]);
  assert.deepEqual(searchDailyPilotageTasks(followups, "daily_signature", searchable).map(x => x.id), ["c"]);
});

test("la recherche ne modifie ni l'ordre canonique, ni l'attribution, ni les objets", () => {
  const original = structuredClone(followups);
  const result = searchDailyPilotageTasks(followups, "dossier", searchable);
  assert.equal(result[0], followups[1]);
  assert.equal(result[0].assignedAgentProfileId, "agent-2");
  assert.equal(result[0].overdueShared, true);
  assert.deepEqual(followups, original);
});

test("la recherche n'élargit jamais la visibilité décidée par le serveur", () => {
  const visible = followups.filter(x => x.assignedAgentProfileId === "agent-1" || x.overdueShared);
  const withoutShared = visible.filter(x => !x.overdueShared);
  assert.deepEqual(searchDailyPilotageTasks(withoutShared, "LEA", searchable), []);
  assert.deepEqual(searchDailyPilotageTasks(visible, "LEA", searchable).map(x => x.id), ["b"]);
});

test("la pagination intervient après recherche, sans toucher aux pages des tâches", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: String(i), title: i < 12 ? "Présence" : "Convention", detail: "", reminderType: "daily_attendance" }));
  const matching = searchDailyPilotageTasks(items, "presence", searchable);
  const page = paginateDailyPilotageTasks(matching, "2", 10);
  assert.equal(page.total, 12);
  assert.deepEqual(page.items.map(x => x.id), ["10", "11"]);
  assert.equal(paginateDailyPilotageTasks(items, "2", 20).total, 25);
});

test("les paramètres multiples ou longs sont bornés sans injection de filtre", () => {
  assert.equal(normalizeDailyPilotageQuery(["présence", "signature"]), "");
  assert.equal(normalizeDailyPilotageQuery("a".repeat(200)).length, 80);
  assert.deepEqual(searchDailyPilotageTasks(followups, [], searchable), followups);
});

test("l'interface garde la recherche des relances indépendante et accessible", async () => {
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /normalizeDailyPilotageQuery\(params\?\.qr\)/);
  assert.match(page, /searchDailyPilotageTasks\(followups, followupQuery/);
  assert.match(page, /paginateDailyPilotageTasks\(matchingFollowups, params\?\.relances, 10\)/);
  assert.match(page, /aria-label="Rechercher une relance Daily"/);
  assert.match(page, /name="qr" type="search" maxLength=\{80\}/);
  assert.match(page, /query\.set\("qr", followupQuery\)/);
  assert.match(page, /clearFollowupHref\(\)/);
  assert.match(page, /await requireSupportAgent\(\)/);
  assert.match(page, /getStudioClientFollowups\(staff, \{ dailyOnly: true \}\)/);
  assert.match(page, /canTreatDailyPilotageTask\(item, staff\)/);
});
