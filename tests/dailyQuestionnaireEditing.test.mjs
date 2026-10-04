import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { dailyPrivateFixture, ids } from "./helpers/dailyPrivateFixture.mjs";
import { isolatedTsModule } from "./helpers/isolatedTsModule.mjs";
const require=createRequire(import.meta.url);
const revision="2026-10-04T09:00:00.000Z";
const position=[{id:"p-stable",label:"Niveau",type:"scale_1_5",options:[],help_text:"Aide",required:false,order:1}];
const assessment=[{id:"a-stable",label:"Étapes",type:"multiple_choice",options:["A","B","C"],correct_answers:["A","C"],points:3,required:true,order:1}];
function elements(node,out=[]) {
  if(Array.isArray(node))node.forEach(child=>elements(child,out)); else if(node?.props){out.push(node);elements(node.props.children,out);} return out;
}
function fixture(status="review") {
  const f=dailyPrivateFixture(); f.flags.allowWrites=true;
  Object.assign(f.formation,{status,updated_at:revision,positioning_mode:"selen",positioning_questions:structuredClone(position),learning_assessment_mode:"selen_quiz",learning_assessment_questions:structuredClone(assessment),learning_assessment_instructions:"Consignes",public_registration_token:"stable-link",version:4,creation_mode:"selen_form"});
  const page=isolatedTsModule("src/components/daily/DailyFormationReview.tsx",{
    ...f.modules,"react/jsx-runtime":require("react/jsx-runtime"),"next/link":{default:"a"},"next/cache":{revalidatePath(){}},
    "next/navigation":{redirect(path){throw Error("REDIRECT "+path);},unstable_rethrow(error){if(error.message.startsWith("REDIRECT"))throw error;}},
    "@/lib/server/dailyOrganisationScope":f.scope,
    "@/lib/dailyFormationCreationPolicy":isolatedTsModule("src/lib/dailyFormationCreationPolicy.ts"),
    "@/components/daily/DailyFormationReviewTabs":{default:"div"},
  });
  const form=new FormData();
  for(const [key,value] of Object.entries({formation_id:ids.formation,formation_updated_at:revision,title:"Programme",global_objective:"Objectif",learning_objectives:"Objectif 1",duration_hours:"7",duration_days:"1",modality:"presentiel",detailed_program:"Contenu",target_audience:"Public",access_delays:"Deux jours",price:"100",pedagogical_resources:"Supports",evaluation_methods:"Quiz",contact_phone:"0102030405",contact_email:"of@example.test",positioning_questions:JSON.stringify(position),learning_assessment_questions:JSON.stringify(assessment),learning_assessment_instructions:"Consignes"}))form.set(key,value);
  const getTree=()=>page.default({formationId:ids.formation});
  const action=async(index=0)=>elements(await getTree()).filter(n=>n.type==="button"&&n.props.formAction)[index].props.formAction;
  return {...f,form,page,getTree,action};
}
test("les deux questionnaires sont modifiés puis relus dans le vrai dossier",async()=>{
  const f=fixture(), save=await f.action();
  const p=[{...position[0],label:"Niveau corrigé",help_text:"Nouvelle aide",required:true},{id:"p2",label:"Expérience",type:"free_text",options:[],required:false}];
  const q=[{...assessment[0],label:"Question corrigée",options:["Préparer","Vérifier"],correct_answers:["Vérifier"],points:2.5}];
  f.form.set("positioning_questions",JSON.stringify(p));f.form.set("learning_assessment_questions",JSON.stringify(q));f.form.set("learning_assessment_instructions","Nouvelle consigne");
  await assert.rejects(save(f.form),/REDIRECT/);
  assert.equal(f.formation.positioning_questions[0].id,"p-stable"); assert.equal(f.formation.positioning_questions[1].order,2);
  assert.equal(f.formation.learning_assessment_questions[0].points,2.5);assert.deepEqual(Array.from(f.formation.learning_assessment_questions[0].correct_answers),["Vérifier"]);
  assert.equal(f.formation.learning_assessment_instructions,"Nouvelle consigne");assert.equal(f.formation.version,4);assert.equal(f.formation.public_registration_token,"stable-link");
  const html=require("react-dom/server").renderToStaticMarkup(await f.getTree());
  for(const text of ["Niveau corrigé","Question corrigée","Nouvelle aide","Nouvelle consigne","2.5 point(s)"])assert.ok(html.includes(text),text);
  assert.ok(html.includes('name="positioning_questions"'));assert.ok(html.includes('name="learning_assessment_questions"'));
});
test("formation validée : seules les modifications des questionnaires repartent en revue",async()=>{
  const f=fixture("validated"), save=await f.action();
  f.form.set("title","Titre forgé");f.form.set("positioning_questions",JSON.stringify([{...position[0],label:"Corrigé"}]));
  await assert.rejects(save(f.form),/REDIRECT/);assert.equal(f.formation.status,"review");assert.equal(f.formation.title,"Formation exemple");assert.equal(f.formation.validation_note,null);
  assert.equal(f.formation.public_registration_token,"stable-link");assert.equal(f.formation.version,4);assert.equal(f.rpcs.length,0);
});
test("la correction des questionnaires Selen renvoie une demande de correction en revue",async()=>{
  const f=fixture("correction_requested"),save=await f.action();f.formation.validation_note="À corriger";f.formation.agent_review_signaled_at="2026-10-01T09:00:00Z";
  f.form.set("positioning_questions",JSON.stringify([{...position[0],label:"Correction transmise"}]));
  await assert.rejects(save(f.form),/REDIRECT/);assert.equal(f.formation.status,"review");assert.equal(f.formation.validation_note,null);assert.notEqual(f.formation.agent_review_signaled_at,"2026-10-01T09:00:00Z");assert.equal(f.formation.public_registration_token,"stable-link");
});
test("le formulaire reçoit une erreur lisible sans quitter le dossier",async()=>{
  const f=fixture(); const submit=elements(await f.getTree()).find(n=>n.props.submit)?.props.submit;
  f.form.set("positioning_questions","[]");const result=await submit(f.form,"save");assert.match(result.error,/1 et 100 questions/);assert.equal(f.writes.length,0);
});
test("le formulaire conserve la redirection de succès vers le dossier",async()=>{
  const f=fixture();const submit=elements(await f.getTree()).find(n=>n.props.submit)?.props.submit;
  await assert.rejects(submit(f.form,"save"),/REDIRECT .*saved=draft/);assert.equal(f.writes.length,1);
});
for(const [label,field,input] of [
  ["JSON invalide","positioning_questions","{"],
  ["aucune question","positioning_questions","[]"],
  ["identifiants dupliqués","positioning_questions",JSON.stringify([position[0],position[0]])],
  ["type inconnu","positioning_questions",JSON.stringify([{...position[0],type:"unknown"}])],
  ["choix sans options","positioning_questions",JSON.stringify([{...position[0],type:"single_choice"}])],
  ["choix identiques","learning_assessment_questions",JSON.stringify([{...assessment[0],options:["A","A"],correct_answers:["A"]}])],
  ["réponse hors liste","learning_assessment_questions",JSON.stringify([{...assessment[0],correct_answers:["Z"]}])],
  ["plusieurs réponses pour choix unique","learning_assessment_questions",JSON.stringify([{...assessment[0],type:"single_choice"}])],
  ["barème nul","learning_assessment_questions",JSON.stringify([{...assessment[0],points:0}])],
])test(label+" : refus avant toute écriture",async()=>{
  const f=fixture(),save=await f.action();f.form.set(field,input);await assert.rejects(save(f.form));assert.equal(f.writes.length,0);assert.equal(f.rpcs.length,0);
});
for(const [label,change] of [
  ["réaffectation",f=>f.rows.daily_organisation_assignments[0].agent_profile_id="agent-b"],
  ["agent désactivé",f=>f.rows.agent_profiles[0].is_active=false],
  ["abonnement arrêté",f=>f.rows.daily_subscriptions[0].status="cancelled"],
  ["révision périmée",f=>f.formation.updated_at="2026-10-04T09:05:00Z"],
])test(label+" : l’action protège les questionnaires existants",async()=>{
  const f=fixture(),save=await f.action();change(f);await assert.rejects(save(f.form));assert.equal(f.writes.length,0);assert.equal(f.rpcs.length,0);
});
function stage(f,kind,bytes=Buffer.from("%PDF-nouveau-questionnaire")) {
  const id=kind==="positioning"?ids.proof:ids.program;
  const path="daily/"+ids.of+"/formation-sources/"+ids.formation+"/"+kind+"/"+id;
  f.files.set(path,bytes);
  return {kind,id,name:"Questionnaire.pdf",mime_type:"application/pdf",size_bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),path};
}
test("mode mixte : le fichier privé est vérifié avec les octets réels et transmis à la transaction",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";
  const file=stage(f,"assessment",Buffer.alloc(5*1024*1024,7));
  f.form.set("assessment_source_file",JSON.stringify(file));
  const calls=[];f.admin.rpc=async(name,args)=>{calls.push({name,args});return{data:{id:ids.formation},error:null};};
  const save=await f.action();await assert.rejects(save(f.form),/REDIRECT/);
  assert.equal(calls.length,1);assert.equal(calls[0].name,"daily_save_formation_review_sources");
  assert.equal(calls[0].args.p_sources[0].size_bytes,5*1024*1024);assert.equal(calls[0].args.p_sources[0].sha256,file.sha256);
  assert.equal(calls[0].args.p_patch.positioning_questions[0].id,"p-stable");assert.equal(f.writes.length,0);
});
for(const reason of ["absent","empreinte","autre chemin","incomplet","mode Selen"])test("fichier "+reason+" : aucune transaction",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";const file=stage(f,"assessment");
  if(reason==="absent")f.files.delete(file.path);
  if(reason==="empreinte")f.files.set(file.path,Buffer.from("%PDF-données-altérées"));
  if(reason==="autre chemin"){f.files.delete(file.path);f.files.set(file.path.replace(ids.of,ids.otherOf),Buffer.from("%PDF-secret-autre-OF"));}
  if(reason==="mode Selen")f.formation.learning_assessment_mode="selen_quiz";
  f.form.set("assessment_source_file",JSON.stringify(reason==="incomplet"?{pending:true}:file));
  const save=await f.action();await assert.rejects(save(f.form));assert.equal(f.rpcs.length,0);assert.equal(f.writes.length,0);
});
test("réaffectation pendant la lecture du fichier : aucun commit et aucun effacement de fichier",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";f.form.set("assessment_source_file",JSON.stringify(stage(f,"assessment")));
  const storage=f.admin.storage.from;f.admin.storage.from=bucket=>({ ...storage(bucket),download:async path=>{
    const result=await storage(bucket).download(path);f.rows.daily_organisation_assignments[0].agent_profile_id="agent-b";return result;
  },remove(){throw Error("No destructive compensation allowed");}});
  const save=await f.action();await assert.rejects(save(f.form),/Programme introuvable/);assert.equal(f.rpcs.length,0);assert.equal(f.writes.length,0);
});
function ticket(f) {
  const calls=[];
  f.admin.storage.from= bucket=>({createSignedUploadUrl:async(path,opts)=>{assert.equal(bucket,"documents");assert.equal(opts.upsert,false);calls.push(path);return{data:{token:"isolated-upload-ticket"},error:null};}});
  const route=isolatedTsModule("src/app/agent/api/daily/formations/[id]/source-upload/route.ts",{...f.modules,"node:crypto":crypto});
  return {calls,send:(extra={})=>route.POST(new Request("https://studio.test/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind:"assessment",mime_type:"application/pdf",size_bytes:5*1024*1024,expected_updated_at:revision,...extra})}),{params:Promise.resolve({id:ids.formation})})};
}
test("ticket d’import : destination privée unique dans le bon OF, sans modification de document",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";const h=ticket(f);
  const response=await h.send();assert.equal(response.status,200);const result=await response.json();
  assert.equal(h.calls[0],"daily/"+ids.of+"/formation-sources/"+ids.formation+"/assessment/"+result.id);
  assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(f.writes.length,0);assert.equal(f.rpcs.length,0);
});
for(const [reason,setup,body] of [
  ["réaffectation",f=>f.rows.daily_organisation_assignments[0].agent_profile_id="agent-b",{}],
  ["source Selen",()=>{},{}],
  ["ancienne révision",f=>f.formation.learning_assessment_mode="external",{expected_updated_at:"old"}],
  ["format interdit",()=>{},{mime_type:"text/html"}],
  ["fichier trop gros",()=>{},{size_bytes:11*1024*1024}],
])test("ticket refusé : "+reason,async()=>{
  const f=fixture();setup(f);const h=ticket(f);assert.ok((await h.send(body)).status>=400);assert.equal(h.calls.length,0);
});
test("le document d’évaluation finale se télécharge uniquement dans le périmètre canonique",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";f.formation.learning_assessment_document_url="/api/client/daily/uploads?id="+ids.proof;
  Object.assign(f.proof,{document_type:"learning_assessment_source",linked_object_type:"organisation",linked_object_id:ids.of,formation_id:null});
  const response=await f.getSource("assessment");assert.equal(response.status,200);assert.equal(await response.text(),f.filledBytes.toString());assert.equal(response.headers.get("cache-control"),"private, no-store");
  f.proof.archived_at="2026-10-04T10:00:00Z";assert.equal((await f.getSource("assessment")).status,404);
  f.proof.archived_at=null;f.proof.organisation_id=ids.otherOf;assert.equal((await f.getSource("assessment")).status,404);
});
test("un original privé de 5 Mo est vérifié puis envoyé par morceaux sans altérer ses octets",async()=>{
  const f=fixture();f.formation.learning_assessment_mode="external";f.formation.learning_assessment_document_url="/api/client/daily/uploads?id="+ids.proof;
  const bytes=Buffer.alloc(5*1024*1024,11);
  Object.assign(f.proof,{document_type:"learning_assessment_source",linked_object_type:"organisation",linked_object_id:ids.of,formation_id:null,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});
  f.files.set(f.proof.storage_path,bytes);
  const response=await f.getSource("assessment");assert.equal(response.status,200);
  const reader=response.body.getReader(),chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;assert.ok(value.length<=64*1024);chunks.push(Buffer.from(value));}
  assert.ok(chunks.length>1);assert.deepEqual(Buffer.concat(chunks),bytes);
  f.files.set(f.proof.storage_path,Buffer.alloc(bytes.length,12));assert.equal((await f.getSource("assessment")).status,409);
});
