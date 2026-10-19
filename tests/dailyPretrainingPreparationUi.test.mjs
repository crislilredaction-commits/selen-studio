import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {isolatedTsModule} from './helpers/isolatedTsModule.mjs';

const require=createRequire(import.meta.url),jsx=require('react/jsx-runtime'),renderHtml=require('react-dom/server').renderToStaticMarkup;
function walk(node,out=[]){if(Array.isArray(node))node.forEach(n=>walk(n,out));else if(node?.props){out.push(node);walk(node.props.children,out);}return out;}
function button(tree,label){const result=walk(tree).find(n=>n.type==='button'&&n.props.children===label);assert.ok(result,label);return result;}
function fixture(){
 const session='historical-session',rows=[{id:'a',learner_id:'learner-a',name:'Alice QA',updated_at:'2026-10-14T08:00:00Z',contracting_party_type:null,company_name:null},{id:'b',learner_id:'learner-b',name:'Bob QA',updated_at:'2026-10-14T08:00:00Z',contracting_party_type:'individual',company_name:null}];
 const requests=[],flags={confirm:true,pending:null,fail:false,unconfirmed:false};const documents=[];
 const states=[],refs=[],effects=[],callbacks=[];let stateIndex=0,refIndex=0,effectIndex=0,callbackIndex=0,pendingEffects=[];
 const preparation=()=>({session_id:session,companies:['Entreprise QA'],enrolments:rows.map(row=>({...row,issue:row.contracting_party_type?null:'Choisissez qui signe : particulier ou entreprise commanditaire.'})),ready:rows.every(row=>row.contracting_party_type)});
 const page=isolatedTsModule('src/app/agent/daily/pretraining-documents/page.tsx',{
  'react/jsx-runtime':jsx,
  react:{useState(initial){const i=stateIndex++;if(!(i in states))states[i]=initial;return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial){const i=refIndex++;if(!(i in refs))refs[i]={current:initial};return refs[i];},useMemo:fn=>fn(),useCallback(fn,deps){const i=callbackIndex++;if(!callbacks[i]||deps.some((v,j)=>v!==callbacks[i].deps[j]))callbacks[i]={fn,deps};return callbacks[i].fn;},useEffect(fn,deps){const i=effectIndex++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j])){const old=effects[i];effects[i]={deps,cleanup:old?.cleanup};pendingEffects.push(()=>{effects[i].cleanup?.();effects[i].cleanup=fn();});}}},
  'next/navigation':{useSearchParams:()=>new URLSearchParams({session})},
  'next/link':{default:props=>jsx.jsx('a',props)},
 },{window:{confirm:()=>flags.confirm},fetch:async(url,options)=>{
  if(!options?.method)return Response.json(String(url).includes('/generate?')?{preparation:preparation()}:{documents,sessions:[{id:session,organisation_id:'of-a',start_date:'2026-10-12',daily_formations:{title:'Formation historique'}}]});
  const body=JSON.parse(options.body);requests.push({method:options.method,body});if(flags.pending)await flags.pending;
  if(flags.fail)return Response.json({error:'Délégation expirée.'},{status:403});
  if(flags.unconfirmed)return Response.json({ok:true});
  if(options.method==='PATCH'){const row=rows.find(r=>r.id===body.enrolment_id);Object.assign(row,{contracting_party_type:body.contracting_party_type,company_name:body.company_name,updated_at:'2026-10-14T09:00:00Z'});return Response.json({enrolment:row});}
  const recipient=rows.find(row=>row.id===body.enrolment_id)??rows[0];
  documents.push({id:`contract-${recipient.id}`,organisation_id:'of-a',session_id:session,document_type:'training_contract',status:'to_check',logical_name:'contrat',version:1,updated_at:'2026-10-14T09:00:00Z',metadata:{learner_name:recipient.name,learner_id:recipient.learner_id}});return Response.json({documents,count:1,enrolment_id:body.enrolment_id??null});
 }});
 const render=()=>{stateIndex=0;refIndex=0;effectIndex=0;callbackIndex=0;return page.default();};
 const settle=async()=>{let tree;for(let i=0;i<5;i++){tree=render();const batch=pendingEffects;pendingEffects=[];for(const fn of batch)fn();await new Promise(resolve=>setImmediate(resolve));}return render();};
 const choose=(tree,value)=>walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Partie contractante de Alice QA').props.onChange({target:{value}});
 const submit=tree=>walk(tree).find(n=>n.type==='form'&&renderHtml(n).includes('Alice QA')).props.onSubmit({preventDefault(){}});
 return{rows,requests,flags,render,settle,choose,submit};
}

test('parcours écran : blocage nommé, choix explicite, enregistrement, génération puis pièce à relire',async()=>{
 const f=fixture();let tree=await f.settle();let html=renderHtml(tree);
 assert.ok(html.includes('1 inscription(s) à compléter'));assert.ok(html.includes('Alice QA'));assert.ok(html.includes('Bob QA'));assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
 f.choose(tree,'individual');tree=await f.settle();assert.equal(f.rows[0].contracting_party_type,null);assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
 f.flags.confirm=false;f.submit(tree);await f.settle();assert.equal(f.requests.length,0);
 f.flags.confirm=true;f.submit(f.render());tree=await f.settle();assert.equal(f.rows[0].contracting_party_type,'individual');assert.equal(f.requests[0].method,'PATCH');assert.equal(f.requests[0].body.expected_updated_at,'2026-10-14T08:00:00Z');
 assert.equal(button(tree,'Générer les documents manquants').props.disabled,false);assert.ok(renderHtml(tree).includes('Partie contractante enregistrée pour Alice QA'));
 button(tree,'Générer les documents manquants').props.onClick();tree=await f.settle();assert.equal(f.requests[1].method,'POST');assert.equal(f.requests[1].body.session_id,'historical-session');
 html=renderHtml(tree);assert.ok(html.includes('Contrat individuel'));assert.ok(html.includes('À vérifier'));assert.ok(html.includes('Prévisualisez chaque pièce'));assert.equal(button(tree,'Valider').props.disabled,true);
 assert.equal(f.requests.some(r=>r.body.action==='publish'),false);
});

test('un choix en cours désactive les doubles soumissions et une erreur reste visible sans fausse validation',async()=>{
 const f=fixture();let tree=await f.settle();f.choose(tree,'individual');tree=f.render();let release;f.flags.pending=new Promise(resolve=>{release=resolve;});f.flags.fail=true;
 f.submit(tree);f.submit(tree);assert.equal(f.requests.length,1);assert.equal(button(f.render(),'Enregistrement…').props.disabled,true);
 release();tree=await f.settle();assert.ok(renderHtml(tree).includes('Délégation expirée.'));assert.equal(f.rows[0].contracting_party_type,null);assert.ok(!renderHtml(tree).includes('Partie contractante enregistrée pour Alice QA'));
 assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
});

test('une entreprise doit être choisie avant enregistrement et les choix non enregistrés bloquent la génération',async()=>{
 const f=fixture();let tree=await f.settle();f.choose(tree,'company');tree=f.render();assert.equal(button(tree,'Enregistrer le choix de Alice QA').props.disabled,true);assert.equal(f.requests.length,0);
 const select=walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Entreprise commanditaire de Alice QA');select.props.onChange({target:{value:'Entreprise QA'}});tree=f.render();assert.equal(button(tree,'Enregistrer le choix de Alice QA').props.disabled,false);assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
 f.submit(tree);tree=await f.settle();assert.equal(f.requests[0].body.company_name,'Entreprise QA');assert.equal(f.requests[0].body.contracting_party_type,'company');assert.equal(button(tree,'Générer les documents manquants').props.disabled,false);
 f.choose(tree,'individual');tree=f.render();assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);assert.equal(f.rows[0].contracting_party_type,'company');
});

test('enregistrer une inscription conserve les choix non enregistrés des autres participantes',async()=>{
 const f=fixture();f.rows[1].contracting_party_type=null;let tree=await f.settle();
 f.choose(tree,'individual');tree=f.render();walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Partie contractante de Bob QA').props.onChange({target:{value:'company'}});
 tree=f.render();f.submit(tree);tree=await f.settle();
 assert.equal(walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Partie contractante de Bob QA').props.value,'company');assert.equal(f.rows[1].contracting_party_type,null);assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
});

test('HTTP 200 sans inscription confirmée ne débloque ni la génération ni un message de succès',async()=>{
 const f=fixture();let tree=await f.settle();f.choose(tree,'individual');f.flags.unconfirmed=true;f.submit(f.render());tree=await f.settle();
 assert.ok(renderHtml(tree).includes('L’enregistrement n’est pas confirmé.'));assert.ok(!renderHtml(tree).includes('Partie contractante enregistrée pour Alice QA'));assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
});

test('le bouton personnel prépare le dossier prêt, sans modifier l’autre inscription ni déclarer la session terminée',async()=>{
 const f=fixture();let tree=await f.settle();
 assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
 assert.equal(button(tree,'Préparer les documents de Alice QA').props.disabled,true);
 assert.equal(button(tree,'Préparer les documents de Bob QA').props.disabled,false);
 button(tree,'Préparer les documents de Bob QA').props.onClick();tree=await f.settle();
 assert.deepEqual(f.requests.map(r=>r.method),['POST']);assert.deepEqual(f.requests[0].body,{session_id:'historical-session',confirm_prepare:true,enrolment_id:'b',expected_enrolment_updated_at:'2026-10-14T08:00:00Z'});
 assert.equal(f.rows[0].contracting_party_type,null);assert.equal(button(tree,'Générer les documents manquants').props.disabled,true);
 const html=renderHtml(tree);assert.ok(html.includes('Documents préparés pour Bob QA.'));assert.ok(html.includes('1 inscription(s) à compléter'));assert.ok(html.includes('Contrat individuel'));assert.equal(button(tree,'Valider').props.disabled,true);
});

test('la préparation ciblée refuse une saisie non enregistrée et ne donne aucun succès sans preuve',async()=>{
 const f=fixture();let tree=await f.settle();
 const select=walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Partie contractante de Bob QA');select.props.onChange({target:{value:'company'}});tree=f.render();
 assert.equal(button(tree,'Préparer les documents de Bob QA').props.disabled,true);button(tree,'Préparer les documents de Bob QA').props.onClick();tree=await f.settle();assert.equal(f.requests.length,0);
 walk(tree).find(n=>n.type==='select'&&n.props['aria-label']==='Partie contractante de Bob QA').props.onChange({target:{value:'individual'}});f.flags.unconfirmed=true;
 button(f.render(),'Préparer les documents de Bob QA').props.onClick();tree=await f.settle();assert.ok(renderHtml(tree).includes('La préparation n’est pas confirmée.'));assert.ok(!renderHtml(tree).includes('Documents préparés pour Bob QA.'));
});
