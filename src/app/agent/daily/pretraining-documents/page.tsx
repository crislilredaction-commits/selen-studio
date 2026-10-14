"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type PreparationSession = { id:string; organisation_id:string; internal_reference?:string|null; start_date?:string|null; daily_formations?:{title?:string|null}|null };
type ContractualEnrolment = {id:string;learner_id:string;name:string;updated_at:string;contracting_party_type:"individual"|"company"|null;company_name:string|null;issue:string|null};
type Preparation = {session_id:string;companies:string[];enrolments:ContractualEnrolment[];ready:boolean};
type PartyDraft = {party:string;company:string};
type DocumentRow = { id:string; organisation_id:string; session_id?:string|null; document_type:string; status:string; version:number; logical_name:string; created_at:string; updated_at:string; metadata?:Record<string,unknown>|null; organisations?:{name?:string|null}|null };
const labels:Record<string,string>={training_program:"Programme",training_agreement:"Convention",training_contract:"Contrat individuel",convocation:"Convocation",registration_positioning:"Inscription & positionnement",welcome_booklet:"Livret d’accueil",internal_regulations:"Règlement intérieur"};
const statusLabels:Record<string,string>={to_check:"À vérifier",to_validate:"À valider",validated:"Validé",correction_requested:"Correction demandée",published:"Publié",signed:"Signé",draft:"Brouillon",active:"Actif",archived:"Archivé"};
function metaText(doc:DocumentRow,...keys:string[]){for(const key of keys){const value=doc.metadata?.[key];if(typeof value==="string"&&value.trim())return value.trim();}return""}
function learnerKey(doc:DocumentRow){return metaText(doc,"learner_id","learner_email","learner_name")}
function learnerLabel(doc:DocumentRow){return metaText(doc,"learner_name","learner_email","learner_id")||"Sans apprenant"}
function sessionKey(doc:DocumentRow){return doc.session_id?.trim()||metaText(doc,"session_id","session_name","session_title")}
function sessionLabel(doc:DocumentRow){return metaText(doc,"session_name","session_title")||doc.session_id?.trim()||metaText(doc,"session_id")||"Sans session"}
function notificationDate(doc:DocumentRow){const value=metaText(doc,"publication_notification_sent_at");const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleString("fr-FR",{timeZone:"Europe/Paris"}):""}

export default function DailyPretrainingReviewPage(){
  const searchParams=useSearchParams(); const requestedSession=searchParams.get("session")?.trim()||"all";
  const [documents,setDocuments]=useState<DocumentRow[]>([]); const [preparationSessions,setPreparationSessions]=useState<PreparationSession[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [filter,setFilter]=useState("attention"); const [learnerFilter,setLearnerFilter]=useState("all"); const [sessionFilter,setSessionFilter]=useState(requestedSession);
  const [preview,setPreview]=useState<DocumentRow|null>(null); const [openedVersions,setOpenedVersions]=useState<Record<string,string>>({});
  const [pendingId,setPendingId]=useState(""); const actionPending=useRef(false);
  const [preparation,setPreparation]=useState<Preparation|null>(null); const [preparationError,setPreparationError]=useState(""); const [preparationLoading,setPreparationLoading]=useState(false); const [preparationRevision,setPreparationRevision]=useState(0); const [partyDrafts,setPartyDrafts]=useState<Record<string,PartyDraft>>({});
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/agent/api/daily/pretraining-documents",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Chargement impossible.");setDocuments(d.documents??[]);setPreparationSessions(d.sessions??[]);}catch(c){setError(c instanceof Error?c.message:"Chargement impossible.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setSessionFilter(requestedSession);},[requestedSession]);
  const learners=useMemo(()=>{const map=new Map<string,string>();for(const doc of documents){const key=learnerKey(doc);if(key)map.set(key,learnerLabel(doc));}return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],"fr"));},[documents]);
  const sessions=useMemo(()=>{const map=new Map<string,string>();for(const session of preparationSessions)map.set(session.id,`${session.daily_formations?.title||session.internal_reference||"Session"}${session.start_date?` · ${session.start_date}`:""}`);for(const doc of documents){const key=sessionKey(doc);if(key)map.set(key,sessionLabel(doc));}return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],"fr"));},[documents,preparationSessions]);
  const preparationSession=preparationSessions.find(session=>session.id===sessionFilter);
  useEffect(()=>{
    let cancelled=false; setPreparation(null);setPreparationError("");setPartyDrafts({});
    if(!preparationSession){setPreparationLoading(false);return;}
    setPreparationLoading(true);
    void (async()=>{try{
      const response=await fetch(`/agent/api/daily/pretraining-documents/generate?session_id=${encodeURIComponent(preparationSession.id)}`,{cache:"no-store"});
      const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||"Informations contractuelles indisponibles.");
      if(!cancelled){setPreparation(body.preparation);setPartyDrafts(Object.fromEntries((body.preparation?.enrolments??[]).map((row:ContractualEnrolment)=>[row.id,{party:row.contracting_party_type??"",company:row.company_name??""}])));}
    }catch(cause){if(!cancelled)setPreparationError(cause instanceof Error?cause.message:"Informations contractuelles indisponibles.");}
    finally{if(!cancelled)setPreparationLoading(false);}})();
    return()=>{cancelled=true;};
  },[preparationSession?.id,preparationRevision]);
  const unsavedChoices=Boolean(preparation?.enrolments.some(row=>{const draft=partyDrafts[row.id];return draft&&(draft.party!==(row.contracting_party_type??"")||(draft.party==="company"&&draft.company!==(row.company_name??"")));}));
  const visible=useMemo(()=>documents.filter((d)=>(filter==="all"||["to_check","to_validate","correction_requested","validated"].includes(d.status))&&(learnerFilter==="all"||learnerKey(d)===learnerFilter)&&(sessionFilter==="all"||sessionKey(d)===sessionFilter)),[documents,filter,learnerFilter,sessionFilter]);
  async function review(id:string,action:"validate"|"request_correction"|"publish"){
    if(actionPending.current)return;
    const doc=documents.find((document)=>document.id===id);
    if(!doc?.updated_at){setError("Rechargez la liste pour relire la version courante du document.");return;}
    if(action==="validate" && (openedVersions[doc.id]!==doc.updated_at || doc.metadata?.requires_template_completion===true)){setError("Prévisualisez et complétez cette version avant de confirmer sa relecture.");return;}
    if(action==="validate" && !window.confirm("Confirmez-vous avoir relu cette version et vérifié ses destinataires avant validation ?"))return;
    const note=action==="request_correction"?window.prompt("Motif ou correction demandée :",""):"";
    if(note===null)return;
    if(action==="publish"&&!window.confirm("Publier ce document dans Selen Daily et envoyer l’email au client ?"))return;
    actionPending.current=true;setPendingId(id);setError("");setMessage("");
    try{
      const r=await fetch("/agent/api/daily/pretraining-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,note,expected_updated_at:doc.updated_at,confirm_reviewed:action==="validate" && openedVersions[doc.id]===doc.updated_at})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        const actionError=d.error??"Action impossible.";
        if(r.status===409)await load();
        setError(actionError);return;
      }
      const publicationMessage=d.notification?.sent===true
        ?"Document publié. Email transmis au service d’envoi."
        :d.notification?.deduplicated===true
          ?"Document publié. Notification déjà enregistrée, aucun nouvel email envoyé."
          :"Document publié. Aucun nouvel envoi d’email confirmé.";
      setMessage(action==="validate"?"Document validé. Vous pouvez maintenant le publier.":action==="publish"?publicationMessage:"Correction demandée.");
      await load();
    }catch(c){setError(c instanceof Error?c.message:"Action impossible.");}
    finally{actionPending.current=false;setPendingId("");}
  }
  async function generate(row?:ContractualEnrolment){
    if(actionPending.current || !preparationSession)return;
    const selected=row?preparation?.enrolments.find(item=>item.id===row.id):null;
    const draft=selected?partyDrafts[selected.id]:null;
    const selectedReady=selected&&!selected.issue&&draft?.party===selected.contracting_party_type&&(draft.party!=="company"||draft.company===selected.company_name);
    if(preparation?.session_id!==preparationSession.id || (row?!selectedReady:!preparation.ready||unsavedChoices)){setError(row?"Enregistrez la partie contractante de cette inscription avant de préparer ses documents.":"Enregistrez les parties contractantes de cette session avant de générer les documents.");return;}
    const confirmation=selected?`Préparer les documents manquants de ${selected.name} et les pièces communes de la session ? Les documents existants seront conservés. Aucune publication ni notification ne sera déclenchée.`:"Préparer les documents manquants de cette session pour l’organisme ? Les pièces existantes seront conservées. Aucune publication ni notification ne sera déclenchée.";
    if(!window.confirm(confirmation))return;
    actionPending.current=true;setPendingId(selected?`generation:${selected.id}`:"generation");setError("");setMessage("");
    try{
      const response=await fetch("/agent/api/daily/pretraining-documents/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:preparationSession.id,confirm_prepare:true,...(selected?{enrolment_id:selected.id,expected_enrolment_updated_at:selected.updated_at}:{})})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok){if(body.preparation||response.status===409)setPreparationRevision(value=>value+1);throw new Error(body.error||"Préparation impossible.");}
      if(!Array.isArray(body.documents)||!body.documents.length||selected&&body.enrolment_id!==selected.id){await load();throw new Error("La préparation n’est pas confirmée. Vérifiez les pièces chargées avant une nouvelle tentative.");}
      setMessage(`${selected?`Documents préparés pour ${selected.name}.`:"Documents préparés."} Prévisualisez chaque pièce, vérifiez ses destinataires puis validez-la avant publication.`);await load();
    }catch(cause){setError(cause instanceof Error?cause.message:"Préparation impossible.");}finally{actionPending.current=false;setPendingId("");}
  }
  async function saveParty(row:ContractualEnrolment){
    if(actionPending.current || !preparationSession || preparation?.session_id!==preparationSession.id)return;
    const draft=partyDrafts[row.id];if(!draft?.party || draft.party==="company"&&!draft.company)return;
    if(!window.confirm(`Enregistrer pour ${row.name} : ${draft.party==="individual"?"contrat individuel":`convention avec ${draft.company}`} ? Vérifiez ce choix avec l’organisme. Aucun document ne sera publié.`))return;
    actionPending.current=true;setPendingId(row.id);setError("");setMessage("");
    try{
      const response=await fetch("/agent/api/daily/pretraining-documents/generate",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:preparationSession.id,enrolment_id:row.id,contracting_party_type:draft.party,company_name:draft.party==="company"?draft.company:null,expected_updated_at:row.updated_at,confirm_contracting_party:true})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok){if(response.status===409||body.saved){setPreparation(null);setPreparationRevision(value=>value+1);}throw new Error(body.error||"Enregistrement impossible.");}
      const saved=body.enrolment;
      if(saved?.id!==row.id||saved.contracting_party_type!==draft.party||!saved.updated_at||draft.party==="company"&&saved.company_name!==draft.company){setPreparation(null);setPreparationRevision(value=>value+1);throw new Error("L’enregistrement n’est pas confirmé. Rechargez et vérifiez le choix actuel.");}
      setPreparation(current=>{if(!current||current.session_id!==preparationSession.id)return current;const enrolments=current.enrolments.map(item=>item.id===row.id?{...item,contracting_party_type:saved.contracting_party_type,company_name:saved.company_name,updated_at:saved.updated_at,issue:null}:item);return{...current,enrolments,ready:enrolments.length>0&&enrolments.every(item=>!item.issue)};});
      setPartyDrafts(current=>({...current,[row.id]:{party:saved.contracting_party_type,company:saved.company_name??""}}));
      setMessage(`Partie contractante enregistrée pour ${row.name}.`);
    }catch(cause){setError(cause instanceof Error?cause.message:"Enregistrement impossible.");}
    finally{actionPending.current=false;setPendingId("");}
  }
  async function replaceDocument(doc:DocumentRow,file:File){
    if(actionPending.current)return;
    actionPending.current=true;setPendingId(doc.id);setError("");setMessage("");
    try{const form=new FormData();form.set("id",doc.id);form.set("expected_updated_at",doc.updated_at);form.set("file",file);const r=await fetch("/agent/api/daily/pretraining-documents",{method:"POST",body:form});const d=await r.json().catch(()=>({}));if(!r.ok){if(r.status===409)await load();setError(d.error??"Remplacement impossible.");return}setMessage(`Nouvelle version v${d.document?.version??""} créée. Relisez-la avant validation.`);await load();}catch(c){setError(c instanceof Error?c.message:"Remplacement impossible.");}finally{actionPending.current=false;setPendingId("");}
  }
  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}><p style={{fontSize:12,fontWeight:700,color:"var(--selen-text2)"}}>SELEN DAILY</p><h1>Documents préformation</h1><p style={{color:"var(--selen-text2)",maxWidth:760}}>Contrôle des programmes, conventions, convocations, livrets d’accueil, règlements intérieurs et documents d’inscription/positionnement générés depuis les dossiers Daily. Ouvrez la pièce dans Studio avant toute validation ou demande de correction. Filtrez par apprenant et par session pour travailler sur le bon dossier sans mélanger les pièces.</p>
    <div style={{display:"flex",gap:8,margin:"18px 0",flexWrap:"wrap",alignItems:"end"}}><button onClick={()=>setFilter("attention")} disabled={filter==="attention"}>À traiter</button><button onClick={()=>setFilter("all")} disabled={filter==="all"}>Tous</button><label style={{display:"grid",gap:4,fontSize:12,fontWeight:700}}>Apprenant<select aria-label="Filtrer par apprenant" value={learnerFilter} onChange={(e)=>setLearnerFilter(e.target.value)} style={{minWidth:220,padding:8}}><option value="all">Tous les apprenants</option>{learners.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label style={{display:"grid",gap:4,fontSize:12,fontWeight:700}}>Session<select aria-label="Filtrer par session" disabled={Boolean(pendingId)} value={sessionFilter} onChange={(e)=>setSessionFilter(e.target.value)} style={{minWidth:220,padding:8}}><option value="all">Toutes les sessions</option>{sessions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{learnerFilter!=="all"||sessionFilter!=="all"?<button disabled={Boolean(pendingId)} onClick={()=>{setLearnerFilter("all");setSessionFilter("all")}}>Réinitialiser les filtres</button>:null}</div>
    {preparationSession?<section aria-label="Informations contractuelles" style={{padding:18,border:"1px solid var(--selen-border)",borderRadius:12,marginBottom:18}}>
      <h2>Qui signe les documents de formation ?</h2><p>Choisissez pour chaque inscription : un particulier signe un contrat individuel ; une entreprise commanditaire signe une convention. Le SIRET personnel et le financement ne déterminent pas ce choix.</p>
      {preparationLoading?<p>Chargement des inscriptions…</p>:null}
      {preparationError?<div role="alert">{preparationError} <button onClick={()=>setPreparationRevision(value=>value+1)}>Recharger les inscriptions</button></div>:null}
      {preparation?.session_id===preparationSession.id?<>
        <p>{preparation.ready?"Toutes les parties contractantes sont renseignées.":preparation.enrolments.length?`${preparation.enrolments.filter(row=>row.issue).length} inscription(s) à compléter avant génération de toute la session. Vous pouvez préparer séparément les inscriptions déjà renseignées.`:"Aucune inscription active dans cette session."}</p>
        {preparation.enrolments.map(row=>{const draft=partyDrafts[row.id]??{party:"",company:""};const changed=draft.party!==(row.contracting_party_type??"")||(draft.party==="company"&&draft.company!==(row.company_name??""));return <form key={row.id} onSubmit={event=>{event.preventDefault();void saveParty(row);}} style={{borderTop:"1px solid var(--selen-border)",padding:"14px 0",display:"grid",gap:8}}>
          <strong>{row.name}</strong>{row.issue?<p style={{margin:0}}>{row.issue}</p>:null}
          <label>Partie contractante de {row.name}<select aria-label={`Partie contractante de ${row.name}`} value={draft.party} disabled={Boolean(pendingId)} onChange={event=>setPartyDrafts(current=>({...current,[row.id]:{...draft,party:event.target.value}}))} style={{display:"block",padding:8,minWidth:240}}><option value="">Choisir explicitement</option><option value="individual">Particulier — contrat individuel</option><option value="company">Entreprise commanditaire — convention</option></select></label>
          {draft.party==="company"?<><label>Entreprise commanditaire de {row.name}<select aria-label={`Entreprise commanditaire de ${row.name}`} value={draft.company} disabled={Boolean(pendingId)} onChange={event=>setPartyDrafts(current=>({...current,[row.id]:{...draft,company:event.target.value}}))} style={{display:"block",padding:8,minWidth:240}}><option value="">Choisir une entreprise de la session</option>{preparation.companies.map(company=><option key={company} value={company}>{company}</option>)}</select></label>{!preparation.companies.length?<p>Aucune entreprise commanditaire n’est enregistrée. Ajoutez-la dans l’organisation de la session Daily depuis <a href={`/agent/daily/organisations/${encodeURIComponent(preparationSession.organisation_id)}`}>la fiche de l’organisme</a>, puis <button type="button" onClick={()=>setPreparationRevision(value=>value+1)}>Recharger les inscriptions</button>.</p>:null}</>:null}
          <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}><button type="submit" disabled={Boolean(pendingId)||!changed||!draft.party||draft.party==="company"&&!preparation.companies.includes(draft.company)}>{pendingId===row.id?"Enregistrement…":`Enregistrer le choix de ${row.name}`}</button><button type="button" disabled={Boolean(pendingId)||Boolean(row.issue)||changed} onClick={()=>void generate(row)}>{pendingId===`generation:${row.id}`?"Préparation…":`Préparer les documents de ${row.name}`}</button><a href={`/agent/daily/learners/${encodeURIComponent(row.learner_id)}?session=${encodeURIComponent(preparationSession.id)}`}>Consulter le dossier apprenant</a></div>
        </form>;})}
      </>:null}
      {unsavedChoices?<p>Enregistrez les choix modifiés avant de générer les documents.</p>:null}
      <button disabled={Boolean(pendingId)||loading||preparationLoading||!preparation?.ready||preparation.session_id!==preparationSession.id||unsavedChoices} onClick={()=>void generate()}>{pendingId==="generation"?"Préparation…":"Générer les documents manquants"}</button>
    </section>:null}
    {preview?<section aria-label="Prévisualisation du document"><h2>{labels[preview.document_type]||preview.logical_name}</h2><iframe title="Version à relire" sandbox="" src={`/agent/api/daily/pretraining-documents/preview?id=${encodeURIComponent(preview.id)}`} style={{width:"100%",height:560,border:"1px solid var(--selen-border)"}}/><p>Pour les fichiers Word non prévisualisables, téléchargez et relisez la pièce avant de confirmer sa validation.</p><button onClick={()=>setPreview(null)}>Fermer la prévisualisation</button></section>:null}
    {error&&<div role="alert" style={{padding:12,border:"1px solid #b24c3d",marginBottom:12}}>{error}</div>}{message&&<div role="status" style={{padding:12,border:"1px solid var(--selen-border)",marginBottom:12}}>{message}</div>}
    {loading?<p>Chargement…</p>:<section aria-busy={Boolean(pendingId)} style={{display:"grid",gap:12}}>{visible.length===0?<div style={{padding:18,border:"1px solid var(--selen-border)",borderRadius:12}}>Aucun document dans cette vue pour les filtres sélectionnés.{preparationSession?<p>Utilisez « Générer les documents manquants » pour préparer les pièces de cette session. Elles apparaîtront ici pour relecture avant publication. <a href={`/agent/daily/organisations/${encodeURIComponent(preparationSession.organisation_id)}`}>Ouvrir l’organisme</a></p>:<p>Sélectionnez une session pour accéder à son organisme et préparer ses documents dans Daily.</p>}</div>:visible.map((doc)=><article key={doc.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{labels[doc.document_type]??doc.document_type}</strong>{learnerKey(doc)?` · ${learnerLabel(doc)}`:""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>{doc.organisations?.name??"Organisme"}{sessionKey(doc)?` · ${sessionLabel(doc)}`:""} · v{doc.version} · {statusLabels[doc.status]??doc.status}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>{setPreview(doc);setOpenedVersions(current=>({...current,[doc.id]:doc.updated_at}));}}>Prévisualiser</button><a href={`/agent/api/daily/pretraining-documents/download?id=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">Ouvrir la pièce</a>{!["published","signed","archived"].includes(doc.status)?<label style={{cursor:"pointer"}}>Remplacer la version<input hidden type="file" accept="application/pdf,.pdf,.doc,.docx" disabled={Boolean(pendingId)} onChange={(event)=>{const file=event.target.files?.[0];if(file)void replaceDocument(doc,file);event.currentTarget.value="";}}/></label>:null}{doc.status==="validated"?<button disabled={Boolean(pendingId)} onClick={()=>review(doc.id,"publish")}>Publier et notifier</button>:!["published","signed","archived"].includes(doc.status)?<><button disabled={Boolean(pendingId)||openedVersions[doc.id]!==doc.updated_at||doc.metadata?.requires_template_completion===true} onClick={()=>review(doc.id,"validate")}>Valider</button><button disabled={Boolean(pendingId)} onClick={()=>review(doc.id,"request_correction")}>Demander une correction</button></>:null}</div></div>{doc.metadata?.requires_template_completion===true?<p>Ce modèle personnalisé doit être complété puis remplacé avant validation.</p>:null}{typeof doc.metadata?.review_note==="string"&&doc.metadata.review_note?<p style={{marginTop:10,fontSize:12}}>Note : {doc.metadata.review_note}</p>:null}{notificationDate(doc)?<p style={{marginTop:10,fontSize:12}}>Email transmis au service d’envoi le {notificationDate(doc)}{metaText(doc,"publication_notification_resend_id")?` · Référence : ${metaText(doc,"publication_notification_resend_id")}`:""}</p>:null}</article>)}</section>}
  </main>;
}
