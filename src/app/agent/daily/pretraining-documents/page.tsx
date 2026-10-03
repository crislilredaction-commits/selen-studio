"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type DocumentRow = { id:string; organisation_id:string; session_id?:string|null; document_type:string; status:string; version:number; logical_name:string; created_at:string; updated_at:string; metadata?:Record<string,unknown>|null; organisations?:{name?:string|null}|null };
const labels:Record<string,string>={training_program:"Programme",training_agreement:"Convention",convocation:"Convocation",registration_positioning:"Inscription & positionnement",welcome_booklet:"Livret d’accueil",internal_regulations:"Règlement intérieur"};
const statusLabels:Record<string,string>={to_check:"À vérifier",to_validate:"À valider",validated:"Validé",correction_requested:"Correction demandée",published:"Publié",signed:"Signé",draft:"Brouillon",active:"Actif",archived:"Archivé"};
function metaText(doc:DocumentRow,...keys:string[]){for(const key of keys){const value=doc.metadata?.[key];if(typeof value==="string"&&value.trim())return value.trim();}return""}
function learnerKey(doc:DocumentRow){return metaText(doc,"learner_id","learner_email","learner_name")}
function learnerLabel(doc:DocumentRow){return metaText(doc,"learner_name","learner_email","learner_id")||"Sans apprenant"}
function sessionKey(doc:DocumentRow){return doc.session_id?.trim()||metaText(doc,"session_id","session_name","session_title")}
function sessionLabel(doc:DocumentRow){return metaText(doc,"session_name","session_title")||doc.session_id?.trim()||metaText(doc,"session_id")||"Sans session"}
function notificationDate(doc:DocumentRow){const value=metaText(doc,"publication_notification_sent_at");const date=new Date(value);return value&&Number.isFinite(date.getTime())?date.toLocaleString("fr-FR",{timeZone:"Europe/Paris"}):""}

export default function DailyPretrainingReviewPage(){
  const searchParams=useSearchParams(); const requestedSession=searchParams.get("session")?.trim()||"all";
  const [documents,setDocuments]=useState<DocumentRow[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [message,setMessage]=useState(""); const [filter,setFilter]=useState("attention"); const [learnerFilter,setLearnerFilter]=useState("all"); const [sessionFilter,setSessionFilter]=useState(requestedSession);
  const [pendingId,setPendingId]=useState(""); const actionPending=useRef(false);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/agent/api/daily/pretraining-documents",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Chargement impossible.");setDocuments(d.documents??[]);}catch(c){setError(c instanceof Error?c.message:"Chargement impossible.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setSessionFilter(requestedSession);},[requestedSession]);
  const learners=useMemo(()=>{const map=new Map<string,string>();for(const doc of documents){const key=learnerKey(doc);if(key)map.set(key,learnerLabel(doc));}return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],"fr"));},[documents]);
  const sessions=useMemo(()=>{const map=new Map<string,string>();for(const doc of documents){const key=sessionKey(doc);if(key)map.set(key,sessionLabel(doc));}return [...map.entries()].sort((a,b)=>a[1].localeCompare(b[1],"fr"));},[documents]);
  const visible=useMemo(()=>documents.filter((d)=>(filter==="all"||["to_check","to_validate","correction_requested","validated"].includes(d.status))&&(learnerFilter==="all"||learnerKey(d)===learnerFilter)&&(sessionFilter==="all"||sessionKey(d)===sessionFilter)),[documents,filter,learnerFilter,sessionFilter]);
  async function review(id:string,action:"validate"|"request_correction"|"publish"){
    if(actionPending.current)return;
    const doc=documents.find((document)=>document.id===id);
    if(!doc?.updated_at){setError("Rechargez la liste pour relire la version courante du document.");return;}
    const note=action==="request_correction"?window.prompt("Motif ou correction demandée :",""):"";
    if(note===null)return;
    if(action==="publish"&&!window.confirm("Publier ce document dans Selen Daily et envoyer l’email au client ?"))return;
    actionPending.current=true;setPendingId(id);setError("");setMessage("");
    try{
      const r=await fetch("/agent/api/daily/pretraining-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,action,note,expected_updated_at:doc.updated_at})});
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
  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}><p style={{fontSize:12,fontWeight:700,color:"var(--selen-text2)"}}>SELEN DAILY</p><h1>Documents préformation</h1><p style={{color:"var(--selen-text2)",maxWidth:760}}>Contrôle des programmes, conventions, convocations, livrets d’accueil, règlements intérieurs et documents d’inscription/positionnement générés depuis les dossiers Daily. Ouvrez la pièce dans Studio avant toute validation ou demande de correction. Filtrez par apprenant et par session pour travailler sur le bon dossier sans mélanger les pièces.</p>
    <div style={{display:"flex",gap:8,margin:"18px 0",flexWrap:"wrap",alignItems:"end"}}><button onClick={()=>setFilter("attention")} disabled={filter==="attention"}>À traiter</button><button onClick={()=>setFilter("all")} disabled={filter==="all"}>Tous</button><label style={{display:"grid",gap:4,fontSize:12,fontWeight:700}}>Apprenant<select aria-label="Filtrer par apprenant" value={learnerFilter} onChange={(e)=>setLearnerFilter(e.target.value)} style={{minWidth:220,padding:8}}><option value="all">Tous les apprenants</option>{learners.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label style={{display:"grid",gap:4,fontSize:12,fontWeight:700}}>Session<select aria-label="Filtrer par session" value={sessionFilter} onChange={(e)=>setSessionFilter(e.target.value)} style={{minWidth:220,padding:8}}><option value="all">Toutes les sessions</option>{sessions.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>{learnerFilter!=="all"||sessionFilter!=="all"?<button onClick={()=>{setLearnerFilter("all");setSessionFilter("all")}}>Réinitialiser les filtres</button>:null}</div>
    {error&&<div role="alert" style={{padding:12,border:"1px solid #b24c3d",marginBottom:12}}>{error}</div>}{message&&<div role="status" style={{padding:12,border:"1px solid var(--selen-border)",marginBottom:12}}>{message}</div>}
    {loading?<p>Chargement…</p>:<section aria-busy={Boolean(pendingId)} style={{display:"grid",gap:12}}>{visible.length===0?<div style={{padding:18,border:"1px solid var(--selen-border)",borderRadius:12}}>Aucun document dans cette vue pour les filtres sélectionnés.</div>:visible.map((doc)=><article key={doc.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{labels[doc.document_type]??doc.document_type}</strong>{learnerKey(doc)?` · ${learnerLabel(doc)}`:""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>{doc.organisations?.name??"Organisme"}{sessionKey(doc)?` · ${sessionLabel(doc)}`:""} · v{doc.version} · {statusLabels[doc.status]??doc.status}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><a href={`/agent/api/daily/pretraining-documents/download?id=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer">Ouvrir la pièce</a>{doc.status==="validated"?<button disabled={Boolean(pendingId)} onClick={()=>review(doc.id,"publish")}>Publier et notifier</button>:!["published","signed","archived"].includes(doc.status)?<><button disabled={Boolean(pendingId)} onClick={()=>review(doc.id,"validate")}>Valider</button><button disabled={Boolean(pendingId)} onClick={()=>review(doc.id,"request_correction")}>Demander une correction</button></>:null}</div></div>{typeof doc.metadata?.review_note==="string"&&doc.metadata.review_note?<p style={{marginTop:10,fontSize:12}}>Note : {doc.metadata.review_note}</p>:null}{notificationDate(doc)?<p style={{marginTop:10,fontSize:12}}>Email transmis au service d’envoi le {notificationDate(doc)}{metaText(doc,"publication_notification_resend_id")?` · Référence : ${metaText(doc,"publication_notification_resend_id")}`:""}</p>:null}</article>)}</section>}
  </main>;
}
