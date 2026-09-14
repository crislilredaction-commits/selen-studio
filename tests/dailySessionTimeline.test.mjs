import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const timelinePage = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/timeline/page.tsx", import.meta.url),
  "utf8",
);
const phaseHelper = readFileSync(new URL("../src/lib/daily/sessionPhase.ts", import.meta.url), "utf8");

test("la timeline utilise la phase canonique et garde une session sans dates en avant", () => {
  assert.match(timelinePage, /getDailySessionPhase\(session\)/);
  assert.doesNotMatch(timelinePage, /function currentPhase\(/);
  assert.match(phaseHelper, /if \(!start\) return "before";/);
});

test("seules les tâches explicitement manuelles peuvent être terminées par Studio", () => {
  for (const key of ["training_ready", "participants_ready", "selen_closure_review"]) {
    assert.match(phaseHelper, new RegExp(`"${key}"`));
  }
  assert.match(timelinePage, /isManuallyCompletableChecklistItem\(item\.item_key\)/);
  assert.match(timelinePage, /throw new Error\("Cette tâche est mise à jour automatiquement\."\)/);
  assert.match(timelinePage, /isManuallyCompletableChecklistItem\(task\.item_key\)/);
  assert.match(timelinePage, /Mise à jour automatique/);
  assert.match(timelinePage, /select\("id,item_key,status"\)/);
});

test("la timeline utilise l'horodatage réel des émargements", () => {
  assert.match(timelinePage, /daily_attendance_records\(id,status,signed_at\)/);
  assert.match(timelinePage, /record\.status === "present" && Boolean\(record\.signed_at\)/);
  assert.match(timelinePage, /Dernier émargement/);
  assert.match(timelinePage, /timeZone: "Europe\/Paris"/);
});
