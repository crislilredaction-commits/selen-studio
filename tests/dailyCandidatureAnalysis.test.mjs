import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const list=fs.readFileSync("src/app/agent/daily/candidatures/page.tsx","utf8");
const detail=fs.readFileSync("src/app/agent/daily/candidatures/[id]/page.tsx","utf8");
const prerequisiteReview=fs.readFileSync("src/lib/server/dailyStudioPrerequisiteEvidence.ts","utf8");
const dashboard=fs.readFileSync("src/app/agent/daily/page.tsx","utf8");
const organisation=fs.readFileSync("src/app/agent/daily/organisations/[id]/page.tsx","utf8");
test("A8 fournit un écran Studio dédié d analyse candidature",()=>{assert.match(dashboard,/Candidatures à analyser/);assert.match(list,/Analyse des dossiers/);assert.match(detail,/Dossier original/);assert.match(detail,/Synthèse Selen/);});
test("A8 conserve réponses positionnement besoins et preuves consultables",()=>{assert.match(detail,/need_answers/);assert.match(detail,/positioning_answers/);assert.match(detail,/loadDailyPrerequisiteEvidence/);assert.match(prerequisiteReview,/daily_prerequisite_evidence/);assert.match(prerequisiteReview,/createSignedUrl/);assert.match(detail,/Ouvrir le justificatif/);});
test("A8 sépare analyse agent et décision OF",()=>{assert.match(detail,/L’agent n’accepte ni ne refuse/);assert.match(detail,/decision_status:"ready_for_of"/);assert.match(detail,/agent_analysis_completed_at/);assert.match(detail,/agent_analysis_completed_by/);});
test("A8 bloque la transmission si les prérequis obligatoires ne sont pas vérifiés",()=>{assert.match(detail,/hasExactVerifiedPrerequisiteCoverage/);assert.match(prerequisiteReview,/row\.status === "verified"/);assert.match(detail,/Tous les prérequis obligatoires doivent être vérifiés humainement/);});

test("A8 notifie l OF quand la synthèse Selen est prête",()=>{assert.match(detail,/sendClientEmailWithSilence/);assert.match(detail,/synthèse de candidature prête/);assert.match(detail,/accepter ou refuser l’inscription/);assert.match(detail,/Aucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription/);});

test("la file commune des candidatures accepte un filtre organisme dans le périmètre agent",()=>{
  assert.match(list,/requestedOrganisation && organisationIds\.includes\(requestedOrganisation\)/);
  assert.match(list,/Organisme inaccessible/);
  assert.match(list,/scopedOrganisationIds/);
  assert.match(list,/Toutes les candidatures/);
});

test("la fiche organisme renvoie vers la file commune et conserve son historique",()=>{
  assert.match(organisation,/\/agent\/daily\/candidatures\?organisation=\$\{encodeURIComponent\(id\)\}/);
  assert.match(organisation,/Traiter les candidatures/);
  assert.match(organisation,/Voir les dossiers et réponses \(historique\)/);
});

test("une candidature acceptée prépare ses documents depuis le dossier de session",()=>{
  assert.match(organisation,/decision_status===\"accepted\"/);
  assert.match(organisation,/Préparer les documents depuis la session/);
  assert.doesNotMatch(organisation,/Préparer les documents →/);
});
