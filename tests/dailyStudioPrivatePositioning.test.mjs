import assert from "node:assert/strict";
import test from "node:test";
import { dailyPrivateFixture, materializeFixture, ids } from "./helpers/dailyPrivateFixture.mjs";

test("l'agent affecté télécharge original et copie, sans URL Storage ni cache", async () => {
  const f = dailyPrivateFixture();
  const response = await f.get();
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.filledBytes);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("content-disposition"), /^attachment/);
  assert.equal(response.headers.get("location"), null);
  assert.equal((await f.get("original")).status, 200);
});

for (const [name, change, expected] of [
  ["non authentifié", f => f.auth.value = { ok: false, error: "Non authentifié.", status: 401 }, 401],
  ["agent d'un autre OF", f => f.auth.value.email = "agent-b@example.test", 404],
  ["agent inactif", f => f.rows.agent_profiles[0].is_active = false, 404],
  ["abonnement inactif", f => f.rows.daily_subscriptions[0].status = "cancelled", 404],
  ["OF archivé", f => f.rows.organisations[0].status = "archived", 404],
]) {
  test(`${name} : aucune réponse privée ni lecture Storage`, async () => {
    const f = dailyPrivateFixture(); change(f);
    const response = await f.get(); assert.equal(response.status, expected);
    assert.equal(f.downloads.length, 0);
    assert.ok(!f.reads.some(row => row.table === "daily_formation_registration_requests" && row.projection.includes("positioning_answers")));
    assert.ok(!f.reads.some(row => row.table === "daily_documents"));
  });
}

test("l'admin actif accède au dossier du bon OF sans modifier son attribution", async () => {
  const f = dailyPrivateFixture(); f.auth.value.email = "admin@example.test";
  assert.equal((await f.get()).status, 200);
  assert.equal(f.rows.daily_organisation_assignments[0].agent_profile_id, "agent-a");
});

for (const [name, change] of [
  ["autre candidature", f => f.proof.linked_object_id = ids.formation],
  ["autre formation", f => f.proof.formation_id = ids.request],
  ["autre OF", f => f.proof.organisation_id = ids.otherOf],
  ["chemin hors OF", f => f.proof.storage_path = `daily/${ids.otherOf}/filled.pdf`],
  ["traversée de chemin", f => f.proof.storage_path = `daily/${ids.of}/../filled.pdf`],
  ["bucket public", f => f.proof.bucket = "public"],
  ["MIME HTML", f => f.proof.mime_type = "text/html"],
  ["preuve archivée", f => f.proof.status = "archived"],
  ["empreinte du dépôt incohérente", f => f.proof.metadata.submission_fingerprint = "e".repeat(64)],
  ["original incohérent", f => f.proof.metadata.source_document_id = ids.program],
  ["hash original incohérent", f => f.proof.metadata.source_sha256 = "e".repeat(64)],
  ["copie incohérente", f => f.request.positioning_answers.external_documents[0].sha256 = "e".repeat(64)],
  ["identité différente", f => f.proof.metadata.subject_email = "other@example.test"],
  ["index participant différent", f => f.proof.metadata.participant_index = 1],
  ["doublon de copie", f => f.request.positioning_answers.external_documents.push(f.request.positioning_answers.external_documents[0])],
]) {
  test(`${name} : la copie est refusée avant téléchargement`, async () => {
    const f = dailyPrivateFixture(); change(f);
    assert.equal((await f.get()).status, 409); assert.equal(f.downloads.length, 0);
  });
}

test("entreprise : chaque copie conserve son participant canonique", async () => {
  const f = dailyPrivateFixture(); f.request.response_type = "company";
  f.request.participants = [{ firstname: "Ada", lastname: "Test", mail: "learner@example.test" }];
  assert.equal((await f.get()).status, 200);
  f.request.participants[0].mail = "other@example.test";
  assert.equal((await f.get()).status, 409);
});

test("une copie matérialisée conserve le même fichier et exige le tuple complet", async () => {
  const f = dailyPrivateFixture(); materializeFixture(f);
  assert.equal((await f.get()).status, 200);
  assert.deepEqual(f.downloads, [f.proof.storage_path]);
});
for (const [name, change] of [
  ["mapping absent", f => f.rows.daily_registration_request_enrolments.length = 0],
  ["mapping d'un autre participant", f => f.rows.daily_registration_request_enrolments[0].participant_index = 1],
  ["mapping d'un autre apprenant", f => f.rows.daily_registration_request_enrolments[0].learner_id = ids.request],
  ["inscription d'un autre OF", f => f.rows.daily_session_enrolments[0].organisation_id = ids.otherOf],
  ["inscription d'une autre session", f => f.rows.daily_session_enrolments[0].session_id = ids.request],
  ["session d'une autre formation", f => f.rows.daily_sessions[0].formation_id = ids.request],
  ["source candidature différente", f => f.proof.metadata.source_request_id = ids.formation],
]) {
  test(`${name} : refus de la preuve matérialisée`, async () => {
    const f = dailyPrivateFixture(); materializeFixture(f); change(f);
    assert.equal((await f.get()).status, 409); assert.equal(f.downloads.length, 0);
  });
}

test("l'historique signé reste lisible après changement de questionnaire, sans redevenir courant", async () => {
  const f = dailyPrivateFixture(); materializeFixture(f);
  f.proof.status = "signed"; f.source.is_current = false;
  f.formation.positioning_questionnaire_document_url = `/api/client/daily/uploads?id=${ids.program}`;
  const before = JSON.stringify(f.rows.daily_documents);
  assert.equal((await f.get()).status, 200);
  const positioning = await f.candidatures.loadCandidaturePositioning(f.admin, f.request, f.formation);
  assert.equal(positioning.current, false);
  assert.equal(JSON.stringify(f.rows.daily_documents), before);
});

test("les octets téléchargés sont vérifiés contre leur preuve", async () => {
  const f = dailyPrivateFixture(); f.files.set(f.proof.storage_path, Buffer.from("%PDF-corrompu"));
  const response = await f.get(); assert.equal(response.status, 409);
  assert.doesNotMatch(await response.text(), /%PDF-corrompu|storage_path/);
});

test("les positionnements Selen historiques ne deviennent pas des liens documentaires arbitraires", async () => {
  const f = dailyPrivateFixture(); f.request.positioning_answers = { question: "Réponse" };
  assert.equal((await f.get()).status, 404); assert.equal(f.downloads.length, 0);
});

for (const kind of ["program", "positioning"]) {
  test(`source ${kind} : une empreinte enregistrée en majuscules conserve le téléchargement privé`, async () => {
    const f = dailyPrivateFixture();
    const doc = kind === "program" ? f.rows.daily_documents.find(row => row.id === ids.program) : f.source;
    doc.sha256 = doc.sha256.toUpperCase();
    const response = await f.getSource(kind);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.files.get(doc.storage_path));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("location"), null);
  });
}

test("la copie et son original acceptent la même empreinte avec des casses différentes, sans réécrire leurs preuves", async () => {
  const f = dailyPrivateFixture();
  f.source.sha256 = f.source.sha256.toUpperCase();
  f.proof.sha256 = f.proof.sha256.toUpperCase();
  const before = JSON.stringify({ source: f.source, proof: f.proof, request: f.request });
  const response = await f.get();
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), f.filledBytes);
  assert.equal((await f.get("original")).status, 200);
  assert.equal(JSON.stringify({ source: f.source, proof: f.proof, request: f.request }), before);
  assert.equal(f.writes.length, 0);
});
