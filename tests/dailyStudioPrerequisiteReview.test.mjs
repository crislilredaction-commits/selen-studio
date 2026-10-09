import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";

const responseId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const evidenceId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const documentId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const updatedAt = "2026-10-05T17:00:00.000Z";

function sessionFixture() {
  const f = dailyPrivateFixture();
  Object.assign(f.formation, { prerequisite_mode: "required", prerequisite_requirements: [{ id: "diploma", label: "Diplôme requis" }] });
  f.rows.daily_sessions.push({ id: ids.session, formation_id: ids.formation, organisation_id: ids.of });
  f.rows.daily_registration_responses.push({ id: responseId, session_id: ids.session, response_type: "beneficiary", participants: [], respondent_first_name: "Ada", respondent_last_name: "Test", status: "submitted", submitted_at: updatedAt });
  const bytes = Buffer.from("%PDF-justificatif-session");
  const document = {
    ...f.prerequisite, id: documentId, session_id: ids.session, linked_object_type: "registration_response", linked_object_id: responseId,
    storage_path: `daily/${ids.of}/prerequisite-applications/${ids.formation}/${responseId}/${documentId}.pdf`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    metadata: { ...f.prerequisite.metadata, participant_index: 0, requirement_id: "diploma", original_filename: "Diplome-session.pdf" },
  };
  f.rows.daily_documents.push(document); f.files.set(document.storage_path, bytes);
  const evidence = { id: evidenceId, registration_request_id: null, registration_response_id: responseId, participant_index: 0, requirement_id: "diploma", requirement_label: "Diplôme requis", document_id: documentId, status: "submitted", updated_at: updatedAt, reviewed_at: null, reviewed_by: null, review_comment: null };
  f.rows.daily_prerequisite_evidence.push(evidence);
  return { f, document, evidence };
}

test("variante session : preuve privée exacte, revue RPC et couverture complète", async () => {
  const { f, evidence } = sessionFixture();
  const before = await f.prerequisiteReview.loadScopedDailySessionPrerequisites(f.admin, "agent-a@example.test", ids.session);
  assert.equal(before.dossiers.length, 1); assert.equal(before.dossiers[0].evidence[0].document.name, "Diplome-session.pdf");
  assert.equal(before.complete, false); assert.equal(f.downloads.length, 1);
  f.flags.allowWrites = true;
  await f.prerequisiteReview.reviewDailyPrerequisiteEvidence({
    admin: f.admin,
    owner: { kind: "session", id: responseId, organisationId: ids.of, formationId: ids.formation, sessionId: ids.session },
    evidenceId, expectedUpdatedAt: updatedAt, decision: "verified", comment: "Diplôme lisible", reviewerId: ids.reviewer,
  });
  assert.equal(evidence.status, "verified"); assert.equal(evidence.review_comment, "Diplôme lisible");
  assert.equal(f.rpcs.at(-1).name, "review_daily_prerequisite_evidence");
  const after = await f.prerequisiteReview.loadScopedDailySessionPrerequisites(f.admin, "agent-a@example.test", ids.session);
  assert.equal(after.complete, true);
});

test("la session d’un autre OF est refusée avant tout téléchargement", async () => {
  const { f } = sessionFixture();
  const result = await f.prerequisiteReview.loadScopedDailySessionPrerequisites(f.admin, "agent-b@example.test", ids.session);
  assert.equal(result, null); assert.equal(f.downloads.length, 0);
});

test("une pièce altérée ou un rattachement étranger ne peut pas être revu", async () => {
  for (const change of [
    ({ f, document }) => f.files.set(document.storage_path, Buffer.from("%PDF-fichier-altéré")),
    ({ document }) => { document.organisation_id = ids.otherOf; },
    ({ evidence }) => { evidence.requirement_id = "other"; },
  ]) {
    const fixture = sessionFixture(); change(fixture);
    await assert.rejects(fixture.f.prerequisiteReview.loadScopedDailySessionPrerequisites(fixture.f.admin, "agent-a@example.test", ids.session), /correspond|preuve enregistrée|incomplet/i);
    assert.equal(fixture.f.rpcs.length, 0);
  }
});

test("la couverture exige exactement chaque participant et exigence, sans surnuméraire", () => {
  const { f, evidence } = sessionFixture();
  const row = { ...evidence, document: f.prerequisite, url: "signed" };
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([{ ...row, status: "verified" }], f.formation.prerequisite_requirements, 1), true);
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([{ ...row, status: "verified" }], f.formation.prerequisite_requirements, 2), false);
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([{ ...row, status: "verified" }, { ...row, id: "extra" }], f.formation.prerequisite_requirements, 1), false);

  const mixedRequirements = [
    { id: "diploma", label: "Diplôme requis", required: true },
    { id: "experience", label: "Attestation d’expérience", required: false },
  ];
  const optionalRow = { ...row, id: "optional", requirement_id: "experience", status: "submitted" };
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([{ ...row, status: "verified" }, optionalRow], mixedRequirements, 1), true);
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([optionalRow], mixedRequirements, 1), false);
  assert.equal(f.prerequisiteReview.hasExactVerifiedPrerequisiteCoverage([], [mixedRequirements[1]], 1), true);
});
