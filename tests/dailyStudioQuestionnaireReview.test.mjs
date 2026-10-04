import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";

const require = createRequire(import.meta.url);
const jsx = require("react/jsx-runtime");
const { renderToStaticMarkup } = require("react-dom/server");
const preview = isolatedTsModule("src/components/daily/DailyQuestionnairePreview.tsx", { "react/jsx-runtime": jsx });
const tabs = isolatedTsModule("src/components/daily/DailyFormationReviewTabs.tsx", { "react/jsx-runtime": jsx, react: require("react"), "react-dom": require("react-dom") });

async function review(f) {
  const page = isolatedTsModule("src/components/daily/DailyFormationReview.tsx", {
    ...f.modules, "react/jsx-runtime": jsx, "next/link": { default: "a" },
    "next/cache": { revalidatePath() { throw new Error("Revalidation forbidden during read"); } },
    "next/navigation": { redirect() { throw new Error("Redirect forbidden during read"); } },
    "@/lib/server/dailyOrganisationScope": f.scope,
    "@/lib/dailyFormationCreationPolicy": isolatedTsModule("src/lib/dailyFormationCreationPolicy.ts"),
    "@/components/daily/DailyFormationReviewTabs": tabs,
    "@/components/daily/DailyQuestionnairePreview": preview,
  });
  return renderToStaticMarkup(await page.default({ formationId: ids.formation }));
}

function configuredFixture() {
  const f = dailyPrivateFixture();
  Object.assign(f.formation, {
    status: "review", positioning_mode: "selen", positioning_questionnaire_document_url: null,
    positioning_questions: [
      { id: "p1", label: "Quel logiciel utilisez-vous ?", type: "single_choice", options: ["Alpha", "Bêta"], required: true },
      { id: "p2", label: "Votre niveau actuel", type: "scale_1_5", options: [], required: false },
      { id: "p3", label: "Attentes complémentaires", type: "free_text", required: true },
    ],
    learning_assessment_mode: "selen_quiz",
    learning_assessment_instructions: "Consignes exactes de l’OF\nDeuxième ligne.",
    learning_assessment_questions: [
      { id: "a1", label: "Choisir les bonnes étapes", type: "multiple_choice", options: ["Préparer", "Vérifier", "Omettre"], correct_answers: ["Préparer", "Vérifier"], points: 3, required: true },
      { id: "a2", label: "Décrire votre méthode", type: "free_text", options: [], correct_answers: [], points: 2, required: false },
    ],
  });
  return f;
}

test("la revue rend les trois onglets avec les questions exactes du bon OF", async () => {
  const f = configuredFixture(); const html = await review(f);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 3);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
  for (const label of ["Programme", "Questionnaire de positionnement", "Évaluation finale", "Quel logiciel utilisez-vous ?", "Alpha", "Bêta", "Votre niveau actuel", "Échelle de 1 à 5", "Attentes complémentaires", "Choisir les bonnes étapes", "Omettre", "Décrire votre méthode", "3 point(s)", "2 point(s)", "Facultative"]) assert.ok(html.includes(label), label);
  assert.ok(html.includes("Consignes exactes de l’OF\nDeuxième ligne."));
  assert.match(html, /Réponses attendues/); assert.match(html, /Préparer ; Vérifier/);
  assert.ok(html.indexOf("Quel logiciel") < html.indexOf("Votre niveau actuel"));
  assert.ok(html.indexOf("Choisir les bonnes étapes") < html.indexOf("Décrire votre méthode"));
  assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  assert.equal(f.reads.filter(row => row.table === "daily_formations").length, 1);
});

test("les questionnaires propres OF et l’évaluation externe gardent leur vraie configuration", async () => {
  const f = configuredFixture();
  Object.assign(f.formation, { positioning_mode: "off_platform", positioning_questionnaire_document_url: `/api/client/daily/uploads?id=${ids.original}`, learning_assessment_mode: "external" });
  const html = await review(f);
  assert.ok(html.includes(`/agent/api/daily/formations/${ids.formation}/source-document?kind=positioning`));
  assert.ok(html.includes("réimportation obligatoire"));
  assert.ok(html.includes("Évaluation externe fournie par le formateur ou l’OF."));
  assert.ok(html.includes("Consignes exactes de l’OF"));
  assert.ok(!html.includes("Quel logiciel utilisez-vous"));
  assert.ok(!html.includes("Choisir les bonnes étapes"));
  assert.ok(!html.includes("storage_path") && !html.includes("https://www.selen-editions.fr/api/client"));
  assert.equal(f.downloads.length, 0);
});

test("un agent réaffecté ou inactif ne reçoit aucun contenu de questionnaire", async () => {
  for (const deny of [f => { f.auth.value.email = "agent-b@example.test"; }, f => { f.rows.agent_profiles[0].is_active = false; }]) {
    const f = configuredFixture(); deny(f); const html = await review(f);
    assert.match(html, /Programme introuvable/);
    for (const privateText of ["Quel logiciel", "Alpha", "Choisir les bonnes étapes", "Consignes exactes"]) assert.ok(!html.includes(privateText));
    assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0); assert.equal(f.downloads.length, 0);
  }
});

test("le contenu du questionnaire est échappé, même dans ses options et ses réponses", async () => {
  const f = configuredFixture();
  f.formation.learning_assessment_questions = [{ label: '<script>alert("question")</script>', type: "single_choice", options: ["<img src=x onerror=alert(1)>", "Choix sûr"], correct_answers: ["<img src=x onerror=alert(1)>"], points: 1 }];
  const html = await review(f);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes('<script>alert("question")') && !html.includes("<img src=x"));
});

test("les contenus absents ou anciens restent lisibles sans inventer de questionnaire", async () => {
  const f = configuredFixture();
  f.formation.positioning_questions = null; f.formation.learning_assessment_questions = [];
  const html = await review(f);
  assert.equal((html.match(/Aucune question configurée/g) ?? []).length, 2);
  f.formation.positioning_mode = null; f.formation.learning_assessment_mode = null; f.formation.learning_assessment_instructions = null;
  const legacy = await review(f);
  assert.match(legacy, /Positionnement non configuré/); assert.match(legacy, /Évaluation finale non configurée/);
  assert.match(legacy, /Aucune consigne renseignée/);
  f.formation.positioning_mode = "selen"; f.formation.positioning_questions = [null, { type: "unknown", label: "Question ancienne", options: "old malformed options" }];
  const malformed = await review(f);
  assert.match(malformed, /Question sans intitulé/); assert.match(malformed, /Question ancienne/); assert.match(malformed, /Type non renseigné/);
});

test("une formation validée reste consultable avec ses questionnaires et sans bouton de validation", async () => {
  const f = configuredFixture(); f.formation.status = "validated";
  const html = await review(f);
  assert.ok(html.includes("Quel logiciel utilisez-vous")); assert.ok(html.includes("Choisir les bonnes étapes"));
  assert.ok(!html.includes("Valider la formation")); assert.ok(!html.includes("Enregistrer pour plus tard"));
  assert.equal(f.writes.length, 0); assert.equal(f.rpcs.length, 0);
});
