import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const reviewRoute=fs.readFileSync("src/app/agent/api/daily/posttraining-documents/route.ts","utf8");
const downloadRoute=fs.readFileSync("src/app/agent/api/daily/posttraining-documents/download/route.ts","utf8");
const page=fs.readFileSync("src/app/agent/daily/posttraining-documents/page.tsx","utf8");

test("Studio only opens the current non-archived post-training document",()=>{
  assert.match(downloadRoute,/\.eq\("is_current",true\)/);
  assert.match(downloadRoute,/\.is\("archived_at",null\)/);
  assert.match(downloadRoute,/review_opened_by_email:auth\.email/);
  assert.match(downloadRoute,/review_opened_version:document\.version/);
  assert.match(downloadRoute,/review_opened_sha256:document\.sha256/);
});

test("Studio requires the same agent to open the exact version before a review decision",()=>{
  assert.match(reviewRoute,/openedVersion!==current\.version/);
  assert.match(reviewRoute,/openedSha!==current\.sha256/);
  assert.match(reviewRoute,/openedBy!==auth\.email\.toLowerCase\(\)/);
  assert.match(reviewRoute,/Ouvre cette version de la pièce dans Studio/);
});

test("Studio review writes use optimistic concurrency on the displayed snapshot",()=>{
  assert.match(reviewRoute,/current\.updated_at!==expectedUpdatedAt/);
  assert.match(reviewRoute,/current\.status!==expectedStatus/);
  assert.match(reviewRoute,/current\.version!==expectedVersion/);
  assert.match(reviewRoute,/\.eq\("updated_at",expectedUpdatedAt\)/);
  assert.match(reviewRoute,/\.eq\("status",expectedStatus\)/);
  assert.match(reviewRoute,/\.eq\("version",expectedVersion\)/);
});

test("Studio UI opens through the audited endpoint and disables decisions until then",()=>{
  assert.match(page,/Accept:"application\/json"/);
  assert.match(page,/expected_updated_at:doc\.updated_at/);
  assert.match(page,/expected_status:doc\.status/);
  assert.match(page,/expected_version:doc\.version/);
  assert.match(page,/disabled=\{!opened\}/);
});

test("Studio keeps post-training tracking complete after publication",()=>{
  assert.match(reviewRoute,/\["validated","published","signed","active"\]\.includes\(doc\.status\)/);
  assert.match(reviewRoute,/reviewed<expectedDocuments/);
  assert.doesNotMatch(reviewRoute,/doc\.status==="validated"/);
  assert.match(reviewRoute,/Impossible de synchroniser le suivi des documents de fin/);
});
