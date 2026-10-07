import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url), "utf8");

test("P2 Studio relit la source canonique bornée à l'organisation et la session", () => {
  assert.match(page, /daily_attendance_slots/);
  assert.match(page, /daily_attendance_records/);
  assert.match(page, /daily_communications/);
  assert.match(page, /organisation_id/);
  assert.match(page, /session_id/);
});

test("P2 Studio distingue signé, partiel, absent et en attente", () => {
  for (const label of ["Signé", "Partiel", "Absent", "En attente"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /Absent ou non signé/);
});

test("P2 Studio affiche la traçabilité des relances", () => {
  assert.match(page, /attendance_reminder/);
  assert.match(page, /dernière/);
});
