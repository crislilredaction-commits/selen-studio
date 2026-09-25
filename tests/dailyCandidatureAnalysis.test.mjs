import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const list=fs.readFileSync("src/app/agent/daily/candidatures/page.tsx","utf8");
const detail=fs.readFileSync("src/app/agent/daily/candidatures/[id]/page.tsx","utf8");
const dashboard=fs.readFileSync("src/app/agent/daily/page.tsx","utf8");
test("A8 fournit un écran Studio dédié d analyse candidature",()=>{assert.match(dashboard,/Candidatures à analyser/);assert.match(list,/Analyse des dossiers/);assert.match(detail,/Dossier original/);assert.match(detail,/Synthèse Selen/);});
test("A8 conserve réponses positionnement besoins et preuves consultables",()=>{assert.match(detail,/need_answers/);assert.match(detail,/positioning_answers/);assert.match(detail,/daily_prerequisite_evidence/);assert.match(detail,/createSignedUrl/);assert.match(detail,/Ouvrir le justificatif/);});
test("A8 sépare analyse agent et décision OF",()=>{assert.match(detail,/L’agent n’accepte ni ne refuse/);assert.match(detail,/decision_status:"ready_for_of"/);assert.match(detail,/agent_analysis_completed_at/);assert.match(detail,/agent_analysis_completed_by/);});
test("A8 bloque la transmission si les prérequis obligatoires ne sont pas vérifiés",()=>{assert.match(detail,/rows\.every\(\(row\)=>row\.status==="verified"\)/);assert.match(detail,/Tous les prérequis obligatoires doivent être vérifiés humainement/);});

test("A8 notifie l OF quand la synthèse Selen est prête",()=>{assert.match(detail,/sendClientEmailWithSilence/);assert.match(detail,/synthèse de candidature prête/);assert.match(detail,/accepter ou refuser l’inscription/);assert.match(detail,/Aucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription/);});
