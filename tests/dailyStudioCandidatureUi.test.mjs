import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dailyPrivateFixture, materializeFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url);
const ANALYSIS_REVISION = "2026-10-03T12:00:00+00:00";
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
  f.request.updated_at = ANALYSIS_REVISION;
  const modules = {
    ...f.modules,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "next/link": { default: "a" },
    "next/cache": { revalidatePath() {} },
    "next/navigation": { notFound() { throw new Error("NOT_FOUND"); } },
    "@/lib/server/clientNotificationSilence": { async sendClientEmailWithSilence(args) { emailCalls.push(args); return { sent: true }; } },
    "@/lib/server/dailyOrganisationScope": f.scope,
    "@/lib/dailyCandidaturePresentation": isolatedTsModule("src/lib/dailyCandidaturePresentation.ts"),
    "./analysis.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  const page = isolatedTsModule("src/app/agent/daily/candidatures/[id]/page.tsx", modules);
  const list = isolatedTsModule("src/app/agent/daily/candidatures/page.tsx", modules);
  const render = () => page.default({ params: Promise.resolve({ id: ids.request }) });
  return { ...f, page, list, render, emailCalls };
}
function analysisForm() {
  const form = new FormData(); form.set("id", ids.request);
  form.set("candidature_updated_at", ANALYSIS_REVISION);
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
  f.formation.prerequisite_mode = "required"; f.formation.prerequisite_requirements = [{ id: "diploma", label: "Diplôme" }];
  f.rows.daily_prerequisite_evidence.push({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", registration_request_id: ids.request, registration_response_id: null, participant_index: 0, requirement_id: "diploma", requirement_label: "Diplôme", document_id: ids.prerequisite, status: "submitted", updated_at: ANALYSIS_REVISION, reviewed_at: null, reviewed_by: null, review_comment: null });
  f.prerequisite.organisation_id = ids.otherOf;
  await assert.rejects(f.render(), /ne correspond pas exactement/); assert.equal(f.downloads.length, 0);
});

test("le questionnaire Selen reste consultable sous sa forme historique", async () => {
  const f = pageFixture(); f.request.positioning_answers = { question_1: "Réponse libre" };
  const tree = await f.render(); assert.match(visibleText(tree), /Réponse libre/);
  assert.ok(!elements(tree).some(item => String(item.props.href ?? "").includes("positioning-document")));
});

test("les questions historiques Selen et les réponses multiples sont lisibles sans les métadonnées", async () => {
  const f = pageFixture();
  f.request.need_answers = { motivations: "Évoluer dans mon poste", expectations: "Animer une réunion", phone: "01 02 03 04 05", autre_besoin: "Une réponse ancienne" };
  f.request.positioning_answers = { mode: "selen", questions: [
    { id: "question-ancienne", label: "Dans quelles situations prends-tu la parole ?", type: "multiple_choice", answer: ["Réunions", "Présentations"] },
    { id: "niveau", label: "Quel est ton niveau ?", type: "scale_1_5", answer: 0 },
  ] };
  f.formation.positioning_questions = [{ id: "question-ancienne", label: "Question modifiée depuis la candidature" }];
  const tree = await f.render(), text = visibleText(tree);
  for (const value of ["Motivations", "Évoluer dans mon poste", "Attentes", "Téléphone", "01 02 03 04 05", "Autre besoin", "Une réponse ancienne", "Dans quelles situations prends-tu la parole ?", "Réunions", "Présentations", "Quel est ton niveau ?"]) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /Question modifiée depuis|multiple_choice|scale_1_5|question-ancienne|"motivations"|\[object Object\]/);
  assert.ok(!elements(tree).some(item => item.type === "pre"));
});

test("les participants d'une entreprise gardent leurs coordonnées dans une présentation lisible", async () => {
  const f = pageFixture();
  f.request.response_type = "company"; f.request.company_name = "Entreprise exemple";
  f.request.positioning_answers = {};
  f.request.participants = [
    { first_name: "Ada", last_name: "Test", email: "ada@example.test", phone: "01 02 03 04 05" },
    { firstName: "Louis", lastName: "Exemple", mail: "louis@example.test", postal_address: "10 rue de la Formation" },
  ];
  const text = visibleText(await f.render());
  for (const value of ["Entreprise exemple", "Ada Test", "Louis Exemple", "ada@example.test", "louis@example.test", "Téléphone", "10 rue de la Formation"]) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /first_name|firstName|postal_address|"email"/);
});

test("la synthèse conserve ses sept champs, ses valeurs et la version du dossier", async () => {
  const f = pageFixture(); f.request.agent_analysis_summary = { motivation_summary: "Analyse déjà enregistrée" };
  const tree = await f.render(), inputs = elements(tree);
  const textareas = inputs.filter(item => item.type === "textarea");
  assert.deepEqual(textareas.map(item => item.props.name).sort(), ["adaptations_summary", "expectations_summary", "motivation_summary", "needs_summary", "observations", "positioning_summary", "prerequisites_comment"]);
  assert.equal(textareas.find(item => item.props.name === "motivation_summary").props.defaultValue, "Analyse déjà enregistrée");
  assert.deepEqual(textareas.filter(item => item.props.required).map(item => item.props.name).sort(), ["motivation_summary", "needs_summary", "positioning_summary"]);
  for (const field of textareas) assert.ok(inputs.some(item => item.type === "label" && item.props.htmlFor === field.props.id));
  assert.equal(inputs.find(item => item.props.name === "candidature_updated_at").props.value, ANALYSIS_REVISION);
});

test("un prérequis sans preuve ne paraît pas vérifié et sa transmission reste bloquée", async () => {
  const f = pageFixture(); f.formation.prerequisite_mode = "required"; f.formation.prerequisite_requirements = [{ id: "diploma", label: "Diplôme requis" }];
  const tree = await f.render(), text = visibleText(tree);
  assert.match(text, /justificatifs requis restent à vérifier/);
  assert.doesNotMatch(text, /Aucun justificatif requis/);
  assert.equal(elements(tree).find(item => item.type === "button" && item.props.type === "submit").props.disabled, true);
  await assert.rejects(analysisAction(tree)(analysisForm()), /prérequis obligatoires/);
  assert.equal(f.emailCalls.length, 0);
});

test("un justificatif vérifié du bon OF reste directement consultable et permet la transmission", async () => {
  const f = pageFixture(); f.formation.prerequisite_mode = "required"; f.formation.prerequisite_requirements = [{ id: "diploma", label: "Diplôme requis" }];
  f.prerequisite.metadata.requirement_id = "diploma";
  f.rows.daily_prerequisite_evidence.push({ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", registration_request_id: ids.request, registration_response_id: null, participant_index: 0, requirement_id: "diploma", document_id: ids.prerequisite, requirement_label: "Diplôme requis", status: "verified", updated_at: ANALYSIS_REVISION, reviewed_at: ANALYSIS_REVISION, reviewed_by: ids.reviewer, review_comment: "Document relu par l’agent" });
  const originalFrom = f.admin.storage.from;
  f.admin.storage.from = bucket => ({ ...originalFrom(bucket), createSignedUrl: async (path, seconds) => {
    assert.equal(path, f.prerequisite.storage_path); assert.equal(seconds, 600);
    return { data: { signedUrl: "https://storage.example.test/justificatif-verifie" }, error: null };
  } });
  const tree = await f.render(), items = elements(tree);
  assert.match(visibleText(tree), /Diplôme requis.*Vérifié/);
  assert.match(visibleText(tree), /Document relu par l’agent/);
  assert.ok(items.some(item => item.props.href === "https://storage.example.test/justificatif-verifie"));
  assert.equal(items.find(item => item.type === "button" && item.props.type === "submit").props.disabled, false);
  assert.equal(f.downloads.length, 1); assert.equal(f.emailCalls.length, 0);
});

test("une formation archivée conserve l'analyse et tous les champs en lecture seule", async () => {
  const f = pageFixture(); f.formation.status = "archived";
  const tree = await f.render();
  assert.match(visibleText(tree), /archivée.*lecture seule/);
  assert.ok(elements(tree).filter(item => item.type === "textarea").every(item => item.props.disabled));
  assert.ok(!elements(tree).some(item => item.type === "button" && item.props.type === "submit"));
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
