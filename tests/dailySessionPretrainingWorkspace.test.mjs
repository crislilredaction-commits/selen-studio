import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/app/agent/daily/session-dossiers/[id]/full/page.tsx", import.meta.url),
  "utf8",
);

test("la fiche session devient le point d'entrée des documents préformation", () => {
  assert.match(source, /id="documents-avant-formation"/);
  assert.match(source, /pretraining-documents\?session=\$\{encodeURIComponent\(id\)\}/);
  assert.match(source, /daily_pretraining_document_progress/);
  assert.match(source, /documentProgress\.error/);
});

test("la liste documentaire reste bornée à la session et à l'organisme", () => {
  const query = source.slice(source.indexOf('admin.from("daily_documents")'));
  assert.match(query, /\.eq\("organisation_id",typedSession\.organisation_id\)/);
  assert.match(query, /\.eq\("session_id",id\)/);
  assert.match(query, /\.eq\("is_current",true\)/);
  assert.match(query, /\.in\("document_type",pretrainingDocumentTypes\)/);
  assert.doesNotMatch(query, /\.limit\(100\)/, "le filtrage client ne doit pas tronquer les documents actifs plus anciens");
});

test("les documents des inscriptions closes restent historiques sans action active", () => {
  assert.match(source, /!\["declined","cancelled","abandoned"\]\.includes\(row\.status\)/);
  assert.match(source, /activeEnrolmentIds=new Set\(enrolments\.map\(row=>row\.id\)\)/);
  assert.match(source, /!document\.enrolment_id\|\|activeEnrolmentIds\.has\(document\.enrolment_id\)/);
  assert.match(source, /restent dans l’historique, sans être présentées comme une action active/);
});

test("les statuts affichés proviennent des documents persistés", () => {
  for (const status of ["to_check", "to_validate", "validated", "correction_requested", "published", "signed"]) {
    assert.match(source, new RegExp(`${status}:`));
  }
  assert.match(source, /Version \{doc\.version\}/);
  assert.doesNotMatch(source, /onClick=.*valid/i);
});
