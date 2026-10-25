import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {exchangeHarness,ids} from "./helpers/dailyTrainerExchangeHarness.mjs";
const path="src/app/agent/daily/session-dossiers/[id]/full/page.tsx";
async function render(h){return renderToStaticMarkup(await h.load(path).default({params:Promise.resolve({id:ids.session})}));}
function acceptedFixture(options={}){
 const h=exchangeHarness(options);h.session.registration_status="to_prepare";h.db.daily_formations[0].status="archived";
 h.db.daily_formation_registration_requests=[{id:"request-qa",formation_id:"formation",attached_session_id:ids.session,decision_status:"accepted",respondent_first_name:"Alice",respondent_last_name:"QA",submitted_at:"2026-10-13T12:00:00Z"},{id:"foreign",formation_id:"foreign-formation",attached_session_id:ids.session,decision_status:"accepted",respondent_first_name:"Foreign"}];
 h.admin.rpc=async(name,args)=>{assert.equal(name,"daily_pretraining_document_progress");assert.equal(args.p_session_id,ids.session);return{data:{status:"to_review"},error:null};};return h;
}
test("le dossier historique affiche la candidature acceptée et la préparation au lieu d’une fausse absence d’inscription",async()=>{
 const h=acceptedFixture(),before=JSON.stringify(h.db),html=await render(h);
 assert.match(html,/1 candidature acceptée/);assert.match(html,/Candidatures \(1\)/);assert.match(html,/Alice QA/);assert.match(html,/Documents avant formation à préparer/);assert.match(html,/pretraining-documents\?session=/);
 assert.doesNotMatch(html,/Foreign|En attente d&#x27;inscription|Rien à traiter/);assert.equal(JSON.stringify(h.db),before);
});
test("la préparation publiée disparaît des actions mais conserve la candidature acceptée dans l’historique",async()=>{
 const h=acceptedFixture();h.admin.rpc=async()=>({data:{status:"validated"},error:null});const html=await render(h);
 assert.match(html,/Alice QA/);assert.match(html,/Rien à traiter/);assert.doesNotMatch(html,/Documents avant formation à préparer|En attente d&#x27;une inscription/);
});
test("une erreur de lecture des candidatures ne devient pas un compteur zéro",async()=>{
 const html=await render(acceptedFixture({failTable:"daily_formation_registration_requests"}));assert.match(html,/Dossiers d’inscription indisponibles/);assert.doesNotMatch(html,/Candidatures \(0\)|Rien à traiter/);
});
test("un état documentaire indisponible reste visible sans cacher les présences",async()=>{
 const h=acceptedFixture();h.admin.rpc=async()=>({data:null,error:{message:"Unavailable"}});const html=await render(h);
 assert.match(html,/Préparation documentaire indisponible/);assert.match(html,/Présences par créneau/);assert.doesNotMatch(html,/Rien à traiter/);
});
test("Studio affiche la même présence signée et exclut l’inscription annulée du compteur",async()=>{
 const h=exchangeHarness(),before=JSON.stringify(h.db),html=await render(h);
 assert.match(html,/Alice Exemple/);assert.match(html,/Signé/);assert.match(html,/Présences par créneau \(1\/1\)/);assert.doesNotMatch(html,/Historique Annulé|private-proof/);assert.equal(JSON.stringify(h.db),before);assert.equal(h.scopes[0].org,ids.org);
});
test("la vue Studio masque les apprenants d’un autre organisme et leurs preuves en revue",async()=>{
 const h=exchangeHarness();
 h.db.daily_session_enrolments.push({...h.enrolment,id:"foreign-enrolment",learner_id:"foreign-learner",daily_learners:{id:"foreign-learner",organisation_id:ids.other,first_name:"Eve",last_name:"Externe"}});
 h.db.daily_attendance_records.push({id:"foreign-review",organisation_id:ids.org,session_id:ids.session,slot_id:"slot",enrolment_id:"foreign-enrolment",status:"pending",evidence_metadata:{late_review:{state:"awaiting_validation",version:1}}});
 const html=await render(h);
 assert.match(html,/Alice Exemple/);
 assert.ok(html.includes("Présences par créneau (1/1)"));
 assert.doesNotMatch(html,/Eve Externe|Preuves d’émargement à valider/);
});

test("deux relevés publiés sur une session ne bloquent pas le PDF individuel",async()=>{
 const h=exchangeHarness();
 h.db.daily_documents=[
  {id:"summary-one",organisation_id:ids.org,session_id:ids.session,document_type:"attendance_summary",status:"published",is_current:true,archived_at:null},
  {id:"summary-two",organisation_id:ids.org,session_id:ids.session,document_type:"attendance_summary",status:"signed",is_current:true,archived_at:null},
 ];
 const html=await render(h);
 assert.match(html,/Télécharger sa feuille individuelle \(PDF\)/);
 assert.doesNotMatch(html,/État de publication indisponible/);
});
test("un relevé archivé ne déverrouille jamais le PDF individuel",async()=>{
 const h=exchangeHarness();
 h.db.daily_documents=[{id:"archived",organisation_id:ids.org,session_id:ids.session,document_type:"attendance_summary",status:"published",is_current:true,archived_at:"2026-10-14T00:00:00Z"}];
 const html=await render(h);
 assert.doesNotMatch(html,/Télécharger sa feuille individuelle \(PDF\)/);
 assert.match(html,/Feuille individuelle disponible après traitement complet et publication/);
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
