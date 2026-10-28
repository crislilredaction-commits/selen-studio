import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterPretrainingByOrganisation, pretrainingOrganisationOptions } from "../src/lib/daily/pretrainingDocumentTriage.mjs";

const sessions = [
  { id: "session-a", organisation_id: "of-a" },
  { id: "session-b", organisation_id: "of-b" },
  { id: "session-c", organisation_id: "of-c" },
];
const documents = [
  { id: "doc-a", organisation_id: "of-a", organisations: { name: "Même nom" }, status: "to_check", metadata: { learner_name: "Alice" } },
  { id: "doc-b", organisation_id: "of-b", organisations: { name: "Même nom" }, status: "validated", metadata: { learner_name: "Bob" } },
  { id: "doc-orphan", organisation_id: "of-a", session_id: "session-inconnue", organisations: { name: "Même nom" } },
  { id: "doc-org", organisation_id: "of-d", organisations: { name: "Organisme sans session" } },
];

test("préformation : options déduites des seuls documents et sessions autorisés, y compris sans pièces", () => {
  const options = pretrainingOrganisationOptions(documents, sessions);
  assert.deepEqual(options.map((option) => option.id).sort(), ["of-a", "of-b", "of-c", "of-d"]);
  assert.equal(options.find((option) => option.id === "of-c")?.name, "Organisme of-c");
  assert.equal(options.find((option) => option.id === "of-d")?.name, "Organisme sans session");
  assert.equal(options.filter((option) => option.name === "Même nom").length, 2);
  assert.equal(options.some((option) => option.name.includes("Alice") || option.name.includes("Bob")), false);
});

test("préformation : documents, pièces orphelines, sessions vides et compteurs restent dans l'OF canonique", () => {
  const ofA = filterPretrainingByOrganisation(documents, "of-a");
  assert.deepEqual(ofA.map((doc) => doc.id), ["doc-a", "doc-orphan"]);
  assert.deepEqual(filterPretrainingByOrganisation(sessions, "of-a").map((session) => session.id), ["session-a"]);
  assert.deepEqual(filterPretrainingByOrganisation(documents, "of-b").map((doc) => doc.id), ["doc-b"]);
  assert.deepEqual(filterPretrainingByOrganisation(sessions, "of-c").map((session) => session.id), ["session-c"]);
  assert.deepEqual(filterPretrainingByOrganisation(documents, "of-absent"), []);
  assert.equal(filterPretrainingByOrganisation(documents, "all"), documents);
  assert.equal(documents.length, 4, "le filtrage ne modifie pas les données source");
});

test("préformation : sélecteur global et actions bornées à la sélection, session ciblée préservée", () => {
  const page = readFileSync(new URL("../src/app/agent/daily/pretraining-documents/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/agent/api/daily/pretraining-documents/route.ts", import.meta.url), "utf8");
  assert.match(page, /pretrainingOrganisationOptions\(documents,preparationSessions\)/);
  assert.match(page, /organisationFilterValid\?filterPretrainingByOrganisation\(documents,organisationFilter\):\[\]/);
  assert.match(page, /organisationFilterValid\?filterPretrainingByOrganisation\(preparationSessions,organisationFilter\):\[\]/);
  assert.match(page, /scopedDocuments\.filter\(\(d\)=>/);
  assert.match(page, /for\(const session of scopedSessions\)queues\.set/);
  assert.match(page, /const doc=scopedDocuments\.find/);
  assert.match(page, /!scopedDocuments\.some\(current=>current\.id===doc\.id\)/);
  assert.match(page, /requestedSession==="all"&&organisationOptions\.length>1/);
  assert.match(page, /const preparationSession=scopedSessions\.find/);
  assert.match(page, /const scopedPreview=preview&&scopedDocuments\.some/);
  assert.match(route, /getDailyOrganisationIdsForAgent\(auth\.email\)/);
  assert.match(route, /\.in\("organisation_id", organisationIds\)/);
});
