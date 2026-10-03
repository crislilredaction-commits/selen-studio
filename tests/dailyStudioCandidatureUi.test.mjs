import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dailyPrivateFixture, materializeFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url);
function elements(node, result = []) {
  if (Array.isArray(node)) { for (const child of node) elements(child, result); }
  else if (node?.props) { result.push(node); elements(node.props.children, result); }
  return result;
}
function visibleText(node) {
  if (Array.isArray(node)) return node.map(visibleText).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node?.props ? visibleText(node.props.children) : "";
}
function pageFixture() {
  const f = dailyPrivateFixture(); const emailCalls = [];
  f.formation.prerequisite_mode = "none";
  const modules = {
    ...f.modules,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: "a" },
    "next/cache": { revalidatePath() {} },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/lib/server/clientNotificationSilence": { async sendClientEmailWithSilence(args) { emailCalls.push(args); return { sent: true }; } },
    "@/lib/server/dailyOrganisationScope": f.scope,
  };
  const page = isolatedTsModule("src/app/agent/daily/candidatures/[id]/page.tsx", modules);
  const list = isolatedTsModule("src/app/agent/daily/candidatures/page.tsx", modules);
  const render = () => page.default({ params: Promise.resolve({ id: ids.request }) });
  return { ...f, page, list, render, emailCalls };
}
function analysisForm() {
  const form = new FormData(); form.set("id", ids.request);
  for (const field of ["motivation_summary", "expectations_summary", "positioning_summary", "needs_summary", "adaptations_summary", "prerequisites_comment", "observations"]) form.set(field, `Synthèse ${field}`);
  return form;
}
const analysisAction = tree => elements(tree).find(item => item.type === "form").props.action;

test("le dossier affiche les téléchargements vérifiés, sans JSON de références privées", async () => {
  const f = pageFixture(); const tree = await f.render();
  const links = elements(tree).filter(item => item.props.href).map(item => item.props.href);
  assert.ok(links.includes(`/agent/api/daily/candidatures/${ids.request}/positioning-document?document=original`));
  assert.ok(links.includes(`/agent/api/daily/candidatures/${ids.request}/positioning-document?document=${ids.proof}`));
  assert.match(visibleText(tree), /Ada Test/);
  assert.doesNotMatch(visibleText(tree), /source_document_id|submission_fingerprint|external_documents|positioning-applications/);
  assert.equal(f.downloads.length, 0); assert.equal(f.emailCalls.length, 0);
});

test("l'agent hors OF ne lit pas le dossier ni les copies et ne voit pas sa candidature dans la liste", async () => {
  const f = pageFixture(); f.auth.value.email = "agent-b@example.test";
  await assert.rejects(f.render(), /NOT_FOUND/);
  const list = await f.list.default();
  assert.doesNotMatch(visibleText(list), /learner@example.test|Ada Test/);
  assert.equal(f.downloads.length, 0); assert.equal(f.emailCalls.length, 0);
});

test("les preuves de prérequis d'un autre OF ne donnent pas de lien signé", async () => {
  const f = pageFixture();
  f.rows.daily_prerequisite_evidence.push({ id: "evidence", registration_request_id: ids.request, participant_index: 0, document_id: ids.program, requirement_label: "Diplôme", status: "submitted" });
  f.rows.daily_documents.find(row => row.id === ids.program).organisation_id = ids.otherOf;
  const tree = await f.render();
  const links = elements(tree).filter(item => item.props.href).map(item => item.props.href);
  assert.ok(!links.some(link => String(link).includes("signed"))); assert.equal(f.downloads.length, 0);
});

test("le questionnaire Selen reste consultable sous sa forme historique", async () => {
  const f = pageFixture(); f.request.positioning_answers = { question_1: "Réponse libre" };
  const tree = await f.render(); assert.match(visibleText(tree), /Réponse libre/);
  assert.ok(!elements(tree).some(item => String(item.props.href ?? "").includes("positioning-document")));
});

test("l'historique signé accepté est lisible mais sa synthèse ne peut plus être modifiée", async () => {
  const f = pageFixture(); materializeFixture(f); f.proof.status = "signed"; f.source.is_current = false;
  const tree = await f.render(); assert.match(visibleText(tree), /conservées comme historique/);
  assert.ok(elements(tree).filter(item => item.type === "textarea").every(item => item.props.disabled));
  await assert.rejects(analysisAction(tree)(analysisForm()), /décision finale/); assert.equal(f.emailCalls.length, 0);
});

for (const [name, change, expected] of [
  ["réaffectation", f => f.rows.daily_organisation_assignments[0].agent_profile_id = "agent-b", /Candidature introuvable/],
  ["preuve absente", f => f.rows.daily_documents.splice(f.rows.daily_documents.indexOf(f.proof), 1), /ne correspond pas/],
  ["copie corrompue", f => f.files.set(f.proof.storage_path, Buffer.from("%PDF-changé")), /ne correspond plus/],
  ["nouveau questionnaire", f => f.source.is_current = false, /questionnaire a changé/],
  ["formation archivée", f => f.formation.status = "archived", /archivée/],
]) {
  test(`${name} : transmission bloquée avant écriture et notification`, async () => {
    const f = pageFixture(); const action = analysisAction(await f.render()); change(f);
    await assert.rejects(action(analysisForm()), expected);
    assert.equal(f.writes.length, 0); assert.equal(f.emailCalls.length, 0);
  });
}

test("la synthèse complète vérifie les fichiers avant transmission ; le transport email est simulé", async () => {
  const f = pageFixture(); f.flags.allowWrites = true;
  const action = analysisAction(await f.render()); await action(analysisForm());
  assert.equal(f.request.decision_status, "ready_for_of");
  assert.equal(f.request.prerequisites_validated, true);
  assert.equal(f.request.agent_analysis_summary.evaluator_email, "agent-a@example.test");
  assert.equal(f.downloads.length, 1); assert.equal(f.emailCalls.length, 1);
  assert.equal(f.emailCalls[0].organisationId, ids.of);
  assert.ok(!f.writes.some(write => write.table !== "daily_formation_registration_requests"));
});
