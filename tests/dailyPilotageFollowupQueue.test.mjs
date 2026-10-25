import assert from "node:assert/strict";
import test from "node:test";
import { prioritizeStudioClientFollowups } from "../src/lib/daily/pilotageFollowupQueue.mjs";

const followup = (id, dueAt, overdueShared = false) => ({ id, dueAt, overdueShared, assignedAgentProfileId: "agent-1" });

test("les relances immédiatement dues sans date précèdent les échéances datées", () => {
  const input = [followup("tomorrow", "2026-10-26T09:00:00Z"), followup("undated", null), followup("yesterday", "2026-10-24T09:00:00Z")];
  assert.deepEqual(prioritizeStudioClientFollowups(input).map(item => item.id), ["undated", "yesterday", "tomorrow"]);
});

test("une échéance invalide ne masque pas les relances réellement échues", () => {
  const input = [followup("bad", "invalid"), followup("today", "2026-10-25T09:00:00Z"), followup("empty", "")];
  assert.deepEqual(prioritizeStudioClientFollowups(input).map(item => item.id), ["empty", "today", "bad"]);
});

test("l'ordre des échéances identiques est stable et les attributions restent intactes", () => {
  const input = [followup("a", "2026-10-25T09:00:00Z"), followup("b", "2026-10-25T09:00:00Z", true)];
  const snapshot = structuredClone(input);
  const result = prioritizeStudioClientFollowups(input);
  assert.deepEqual(result.map(item => item.id), ["a", "b"]);
  assert.notEqual(result, input);
  assert.equal(result[0], input[0]);
  assert.deepEqual(input, snapshot);
});

test("une file vide reste vide et le partage ne modifie pas le classement chronologique", () => {
  assert.deepEqual(prioritizeStudioClientFollowups([]), []);
  const input = [followup("shared-later", "2026-10-26T09:00:00Z", true), followup("mine-now", "2026-10-25T09:00:00Z")];
  assert.deepEqual(prioritizeStudioClientFollowups(input).map(item => item.id), ["mine-now", "shared-later"]);
});

test("le serveur trie après filtrage de visibilité, sans nouvelle lecture ni mutation", async () => {
  const { readFile } = await import("node:fs/promises");
  const server = await readFile(new URL("../src/lib/server/studioClientFollowups.ts", import.meta.url), "utf8");
  assert.match(server, /prioritizeStudioClientFollowups\(\[\.\.\.reminderFollowups,\.\.\.attendanceFollowups\]\.filter\(/);
  assert.match(server, /!options\?\.dailyOnly\|\|row\.isDaily/);
});

test("le pilotage signale les relances partagées et conserve la pagination existante", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../src/app/agent/daily/page.tsx", import.meta.url), "utf8");
  assert.match(page, /matchingFollowups\.filter\(item => item\.overdueShared\)\.length/);
  assert.match(page, /Relances partagées avec l’équipe/);
  assert.match(page, /filterDailyFollowupViews\(matchingFollowups, selectedFollowupView\)/);
  assert.match(page, /paginateDailyPilotageTasks\(filteredFollowups, params\?\.relances, 10\)/);
  assert.match(page, /getStudioClientFollowups\(staff/);
});
