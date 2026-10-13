import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {exchangeHarness,ids} from "./helpers/dailyTrainerExchangeHarness.mjs";
const path="src/app/agent/daily/session-dossiers/[id]/full/page.tsx";
async function render(h){return renderToStaticMarkup(await h.load(path).default({params:Promise.resolve({id:ids.session})}));}
test("Studio affiche la même présence signée et exclut l’inscription annulée du compteur",async()=>{
 const h=exchangeHarness(),before=JSON.stringify(h.db),html=await render(h);
 assert.match(html,/Alice Exemple/);assert.match(html,/Signé/);assert.match(html,/Présences par créneau \(1\/1\)/);assert.doesNotMatch(html,/Historique Annulé|private-proof/);assert.equal(JSON.stringify(h.db),before);assert.equal(h.scopes[0].org,ids.org);
});
test("la session d’un autre organisme n’est pas exposée à un agent non affecté",async()=>{
 const h=exchangeHarness({outOfScope:true}),html=await render(h);assert.match(html,/Accès refusé/);assert.doesNotMatch(html,/Alice|Formation exemple|Signé/);assert.equal(h.reads.length,1);assert.equal(h.reads[0].table,"daily_sessions");
});
for(const failTable of ["daily_session_enrolments","daily_attendance_slots","daily_communications"])test(`l'échec de lecture ${failTable} n'affiche pas une fausse absence d'émargement`,async()=>{
 const h=exchangeHarness({failTable}),html=await render(h);assert.match(html,/Suivi des présences indisponible/);assert.doesNotMatch(html,/Aucun créneau|0 présence|Présences par créneau \(0/);
});
test("une présence non signée n’est jamais transformée en absence",async()=>{
 const h=exchangeHarness();h.db.daily_attendance_records=[];const html=await render(h);assert.match(html,/En attente de régularisation/);assert.doesNotMatch(html,/>Absent</);
});
