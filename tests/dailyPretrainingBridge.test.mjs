import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {isolatedTsModule} from './helpers/isolatedTsModule.mjs';

const require=createRequire(import.meta.url),org='of-a',session='session-a',actor='actual-agent';
class NextResponse extends Response { static json(data,init){return Response.json(data,init);} }
function fixture(){
 const flags={auth:{ok:true,email:'agent@example.test',userId:actor},scope:[org],baseUrl:'https://daily.example.test',url:'https://daily.example.test/client/daily?assistanceToken=offline-token',response:Response.json({documents:[{id:'draft',status:'to_check',created_by:actor}]}),fetchError:false,revokeError:null};
 const bytes=Buffer.from('<html><body>Contrat QA<script>throw 1</script></body></html>');
 const document={id:'doc-a',organisation_id:org,document_type:'training_contract',is_current:true,bucket:'documents',storage_path:`daily/${org}/enrolment/e/contract.doc`,mime_type:'application/msword',sha256:createHash('sha256').update(bytes).digest('hex')};
 const rows={daily_sessions:[{id:session,organisation_id:org,status:'ready',companies:[{name:'Entreprise QA'}]}],daily_session_enrolments:[{id:'enrolment-a',organisation_id:org,session_id:session,learner_id:'learner-a',status:'pending',updated_at:'2026-10-14T08:00:00.000000+00:00',contracting_party_type:'individual',company_name:null,daily_learners:{organisation_id:org,first_name:'Alice',last_name:'QA'}}],daily_documents:[document],selen_agent_assistance_tokens:[{id:'temporary',agent_user_id:actor,status:'active'}]};
 const issued=[],requests=[],downloads=[],writes=[];let content=bytes;
 const admin={from(table){assert.ok(rows[table],table);const filters=[];let patch,single=false;
  const query={select(){return query;},eq(k,v){filters.push(row=>row[k]===v);return query;},in(k,v){filters.push(row=>v.includes(row[k]));return query;},not(k,op,v){assert.equal(op,"in");filters.push(row=>!v.slice(1,-1).split(",").includes(row[k]));return query;},maybeSingle(){single=true;return query;},update(v){patch=v;return query;},then(resolve,reject){
   const matches=rows[table].filter(row=>filters.every(f=>f(row)));
   if(patch&&!flags.revokeError)for(const row of matches){Object.assign(row,patch);writes.push({table,id:row.id,patch});}
   return Promise.resolve({data:single?matches[0]??null:matches,error:patch?flags.revokeError:null}).then(resolve,reject);
  }};return query;
 },storage:{from(bucket){assert.equal(bucket,'documents');return{download:async path=>{downloads.push(path);return{data:new Blob([content]),error:null};}};}}};
 const modules={'next/server':{NextResponse},'@/app/agent/api/support/_utils':{requireSupportAgent:async()=>flags.auth},'@/lib/server/supabaseAdmin':{createSupabaseAdminClient:()=>admin},'@/lib/server/dailyOrganisationScope':{getDailyOrganisationIdsForAgent:async()=>flags.scope}};
 const bridge=isolatedTsModule('src/app/agent/api/daily/pretraining-documents/generate/route.ts',{...modules,'@/lib/server/agentAssistanceTokens':{createAgentAssistanceToken:async args=>{issued.push(args);return{tokenId:'temporary',url:flags.url};}},'@/lib/server/dailyPretrainingPreparation':isolatedTsModule('src/lib/server/dailyPretrainingPreparation.ts'),'@/lib/vitrineLinks':{getVitrineBaseUrl:()=>isolatedTsModule('src/lib/vitrineLinks.ts',{}, {process:{env:{NEXT_PUBLIC_VITRINE_URL:flags.baseUrl}}}).getVitrineBaseUrl()}},{AbortSignal,fetch:async(url,options)=>{requests.push({url:String(url),options});if(flags.fetchError)throw Error('Offline upstream');return flags.response;}});
 const preview=isolatedTsModule('src/app/agent/api/daily/pretraining-documents/preview/route.ts',{...modules,'node:crypto':{createHash},mammoth:{default:require('mammoth')}},{Buffer});
 const post=(body={})=>bridge.POST(new Request('https://studio.example.test/generate',{method:'POST',body:JSON.stringify({session_id:session,confirm_prepare:true,...body})}));
 return{flags,rows,document,issued,requests,downloads,writes,post,bridge,preview,setContent(value,mime){content=value;document.mime_type=mime;document.sha256=createHash('sha256').update(value).digest('hex');}};
}

test('Studio appelle le générateur Daily au nom de l’agent réel puis révoque sa délégation sans l’exposer',async()=>{
 const f=fixture();const response=await f.post();assert.equal(response.status,200);const body=await response.json();assert.equal(body.documents[0].created_by,actor);
 assert.equal(f.issued[0].agentUserId,actor);assert.equal(f.issued[0].organisationId,org);
 assert.equal(f.requests[0].url,'https://daily.example.test/api/client/daily/pretraining-documents');
 const options=f.requests[0].options;assert.deepEqual(JSON.parse(options.body),{session_id:session,only_missing:true,confirm_delegated:true});assert.equal(options.redirect,'error');assert.equal(options.headers['x-selen-agent-assistance'],'offline-token');
 assert.equal(f.rows.selen_agent_assistance_tokens[0].status,'revoked');assert.equal(JSON.stringify(body).includes('offline-token'),false);
});

test('le domaine de production est canonique avant tout envoi de jeton, sans autoriser les redirections',async()=>{
 for(const baseUrl of ['https://selen-editions.fr','https://selen-editions.fr/','https://www.selen-editions.fr']){
  const f=fixture();f.flags.baseUrl=baseUrl;f.flags.url='https://www.selen-editions.fr/client?assistanceToken=offline-token';
  assert.equal((await f.post()).status,200);
  assert.equal(f.requests[0].url,'https://www.selen-editions.fr/api/client/daily/pretraining-documents');
  assert.equal(f.requests[0].options.redirect,'error');
 }
 const links=isolatedTsModule('src/lib/vitrineLinks.ts',{}, {process:{env:{}}});
 assert.equal(links.getVitrineBaseUrl(),'https://www.selen-editions.fr');
 const preview=isolatedTsModule('src/lib/vitrineLinks.ts',{}, {process:{env:{NEXT_PUBLIC_VITRINE_URL:'https://preview.example.test/'}}});
 assert.equal(preview.getVitrineBaseUrl(),'https://preview.example.test');
});

test('préparation en lecture seule : toutes les parties manquantes visibles, aucune déduction ni délégation',async()=>{
 const f=fixture();f.rows.daily_session_enrolments[0].contracting_party_type=null;
 f.rows.daily_session_enrolments.push({...f.rows.daily_session_enrolments[0],id:'enrolment-b',siret:'12345678901234',funding_type:'employer'});
 f.rows.daily_session_enrolments.push({...f.rows.daily_session_enrolments[0],id:'foreign',organisation_id:'another-of'});
 const result=await f.bridge.GET(new Request(`https://studio.example.test/generate?session_id=${session}`));
 assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'private, no-store');
 const {preparation}=await result.json();assert.equal(preparation.ready,false);assert.equal(preparation.enrolments.length,2);
 assert.ok(preparation.enrolments.every(e=>e.contracting_party_type===null&&e.issue));
 assert.equal((await f.post()).status,400);assert.equal(f.issued.length,0);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
 f.flags.scope=[];assert.equal((await f.bridge.GET(new Request(`https://studio.example.test/generate?session_id=${session}`))).status,404);
});

test('choix explicite dans Studio : seule l’inscription sélectionnée et sa version sont transmises à Daily',async()=>{
 const f=fixture();const row=f.rows.daily_session_enrolments[0];row.contracting_party_type=null;
 const patch=extras=>f.bridge.PATCH(new Request('https://studio.example.test/generate',{method:'PATCH',body:JSON.stringify({session_id:session,enrolment_id:row.id,expected_updated_at:row.updated_at,contracting_party_type:'company',company_name:'Entreprise QA',confirm_contracting_party:true,status:'cancelled',...extras})}));
 assert.equal((await patch({confirm_contracting_party:false})).status,400);
 assert.equal((await patch({enrolment_id:'foreign'})).status,404);
 assert.equal((await patch({expected_updated_at:'stale'})).status,409);
 assert.equal((await patch({company_name:'Autre entreprise'})).status,400);
 assert.equal(f.issued.length,0);assert.equal(f.requests.length,0);
 assert.equal((await patch({})).status,200);
 const request=f.requests[0];assert.equal(request.url,'https://daily.example.test/api/client/daily/learners');assert.equal(request.options.method,'PATCH');
 assert.deepEqual(JSON.parse(request.options.body),{action:'contracting_party',id:row.id,session_id:session,expected_updated_at:row.updated_at,contracting_party_type:'company',company_name:'Entreprise QA',confirm_delegated:true});
 assert.equal(f.rows.selen_agent_assistance_tokens[0].status,'revoked');assert.equal(row.status,'pending');
});

test('incohérence de rattachement apprenant ou échec lecture : pas de génération ni de délégation',async()=>{
 const f=fixture();f.rows.daily_session_enrolments[0].daily_learners.organisation_id='foreign';
 assert.equal((await f.post()).status,500);assert.equal(f.issued.length,0);assert.equal(f.requests.length,0);
});

test('une inscription prête peut être préparée quand une autre partie contractante reste inconnue',async()=>{
 const f=fixture(),ready=f.rows.daily_session_enrolments[0];
 f.rows.daily_session_enrolments.push({...ready,id:'missing-party',contracting_party_type:null});
 assert.equal((await f.post()).status,400);assert.equal(f.issued.length,0);
 const response=await f.post({enrolment_id:ready.id,expected_enrolment_updated_at:ready.updated_at,only_missing:false});
 assert.equal(response.status,200);
 assert.deepEqual(JSON.parse(f.requests[0].options.body),{session_id:session,only_missing:true,confirm_delegated:true,enrolment_id:ready.id,expected_enrolment_updated_at:ready.updated_at});
 assert.equal(f.rows.daily_session_enrolments[1].contracting_party_type,null);
 assert.equal(f.rows.selen_agent_assistance_tokens[0].status,'revoked');
});

test('préparation ciblée : cible inconnue, partie manquante ou version périmée refusées avant délégation',async()=>{
 const f=fixture(),row=f.rows.daily_session_enrolments[0];
 for(const [extra,status]of[
  [{enrolment_id:null},400],
  [{enrolment_id:''},400],
  [{enrolment_id:row.id},400],
  [{enrolment_id:'foreign',expected_enrolment_updated_at:row.updated_at},404],
  [{enrolment_id:row.id,expected_enrolment_updated_at:'stale'},409],
 ])assert.equal((await f.post(extra)).status,status);
 row.contracting_party_type=null;assert.equal((await f.post({enrolment_id:row.id,expected_enrolment_updated_at:row.updated_at})).status,400);
 assert.equal(f.issued.length,0);assert.equal(f.requests.length,0);assert.equal(f.writes.length,0);
});
test('absence d’authentification, de confirmation, session étrangère ou archivée : aucune délégation ni appel Daily',async()=>{
 for(const [change,body,status]of[[f=>{f.flags.auth={ok:false,status:401,error:'Connexion requise'};},{},401],[f=>{f.flags.scope=[];},{},404],[f=>{f.rows.daily_sessions[0].status='archived';},{},404],[()=>{}, {confirm_prepare:false},400]]){
  const f=fixture();change(f);assert.equal((await f.post(body)).status,status);assert.equal(f.issued.length,0);assert.equal(f.requests.length,0);
 }
});
test('échecs Daily et origine détournée restent des échecs et révoquent le jeton',async()=>{
 for(const [change,status]of[[f=>{f.flags.response=Response.json({error:'Partie contractante absente'},{status:400});},400],[f=>{f.flags.fetchError=true;},502],[f=>{f.flags.response=new Response('<html>Erreur</html>');},502],[f=>{f.flags.url='https://foreign.example.test/?assistanceToken=offline-token';},502]]){
  const f=fixture();change(f);assert.equal((await f.post()).status,status);assert.equal(f.rows.selen_agent_assistance_tokens[0].status,'revoked');if(f.flags.url.includes('foreign'))assert.equal(f.requests.length,0);
 }
 const f=fixture();f.flags.revokeError={message:'Offline revocation'};assert.equal((await f.post()).status,502);assert.equal(f.writes.length,0);
});
test('prévisualisation privée vérifie les droits, le fichier et son empreinte, avec sandbox',async()=>{
 const f=fixture(),req=new Request('https://studio.example.test/preview?id=doc-a');
 const response=await f.preview.GET(req);assert.equal(response.status,200);assert.match(await response.text(),/Contrat QA/);assert.match(response.headers.get('Content-Security-Policy'),/sandbox; default-src 'none'/);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(f.writes.length,0);
 f.document.sha256='0'.repeat(64);assert.equal((await f.preview.GET(req)).status,409);
 f.flags.scope=[];assert.equal((await f.preview.GET(req)).status,404);assert.equal(f.downloads.length,2);
 f.flags.scope=[org];f.document.storage_path='daily/another-of/file.doc';assert.equal((await f.preview.GET(req)).status,404);assert.equal(f.downloads.length,2);
 f.flags.auth={ok:false,status:401,error:'Connexion requise'};assert.equal((await f.preview.GET(req)).status,401);
});
test('PDF et vrai Word peuvent être relus sans publication ; ancien Word binaire exige un téléchargement',async()=>{
 const f=fixture(),req=new Request('https://studio.example.test/preview?id=doc-a');
 f.setContent(Buffer.from('%PDF-offline'),'application/pdf');assert.equal((await f.preview.GET(req)).headers.get('Content-Type'),'application/pdf');
 const PizZip=require('pizzip'),zip=new PizZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Contrat QA Word</w:t></w:r></w:p></w:body></w:document>');
 f.setContent(zip.generate({type:'nodebuffer'}),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');const response=await f.preview.GET(req);assert.equal(response.status,200);assert.match(await response.text(),/Contrat QA Word/);
 f.setContent(Buffer.from([0xd0,0xcf,0x11,0xe0]),'application/msword');assert.equal((await f.preview.GET(req)).status,422);assert.equal(f.writes.length,0);
});
