"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DocumentRow = {
  id:string;
  organisation_id:string;
  document_type:string;
  status:string;
  version:number;
  logical_name:string;
  created_at:string;
  metadata?:Record<string,unknown>|null;
  organisations?:{name?:string|null}|null;
};

const labels:Record<string,string> = {
  attendance_report:"Relevé de présence",
  completion_certificate:"Certificat de réalisation",
  satisfaction_summary:"Synthèse de satisfaction",
};
const statusLabels:Record<string,string> = {
  to_check:"À vérifier",
  to_validate:"À valider",
  validated:"Validé",
  correction_requested:"Correction demandée",
  published:"Publié",
  signed:"Signé",
  draft:"Brouillon",
  active:"Actif",
  archived:"Archivé",
};

export default function DailyPosttrainingReviewPage() {
  const [documents,setDocuments]=useState<DocumentRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [filter,setFilter]=useState("attention");

  const load=useCallback(async()=>{
    setLoading(true); setError("");
    try {
      const response=await fetch("/agent/api/daily/posttraining-documents",{cache:"no-store"});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data.error??"Chargement impossible.");
      setDocuments(data.documents??[]);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:"Chargement impossible.");
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(()=>{void load();},[load]);
  const visible=useMemo(()=>documents.filter((document)=>filter==="all"||["to_check","to_validate","correction_requested"].includes(document.status)),[documents,filter]);

  async function review(id:string,action:"validate"|"request_correction") {
    const note=action==="request_correction"?window.prompt("Motif ou correction demandée :","")??"":"";
    setError(""); setMessage("");
    const response=await fetch("/agent/api/daily/posttraining-documents",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({id,action,note}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){setError(data.error??"Action impossible.");return;}
    setMessage(action==="validate"?"Document validé.":"Correction demandée.");
    await load();
  }

  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}>
    <p style={{fontSize:12,fontWeight:700,color:"var(--selen-text2)"}}>SELEN DAILY</p>
    <h1>Documents de fin de formation</h1>
    <p style={{color:"var(--selen-text2)",maxWidth:780}}>Contrôle des relevés de présence, certificats de réalisation et synthèses de satisfaction générés depuis les données de session Daily.</p>
    <div style={{display:"flex",gap:8,margin:"18px 0"}}>
      <button onClick={()=>setFilter("attention")} disabled={filter==="attention"}>À traiter</button>
      <button onClick={()=>setFilter("all")} disabled={filter==="all"}>Tous</button>
    </div>
    {error&&<div style={{padding:12,border:"1px solid #b24c3d",marginBottom:12}}>{error}</div>}
    {message&&<div style={{padding:12,border:"1px solid var(--selen-border)",marginBottom:12}}>{message}</div>}
    {loading?<p>Chargement…</p>:<section style={{display:"grid",gap:12}}>
      {visible.length===0?<div style={{padding:18,border:"1px solid var(--selen-border)",borderRadius:12}}>Aucun document dans cette vue.</div>:visible.map((document)=><article key={document.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
          <div>
            <strong>{labels[document.document_type]??document.document_type}</strong>{typeof document.metadata?.learner_name==="string"?` · ${document.metadata.learner_name}`:""}
            <div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>{document.organisations?.name??"Organisme"} · v{document.version} · {statusLabels[document.status]??document.status}</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <a href={`/agent/api/daily/posttraining-documents/download?id=${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Télécharger</a>
            {!["validated","published","signed","archived"].includes(document.status)&&<>
              <button onClick={()=>void review(document.id,"validate")}>Valider</button>
              <button onClick={()=>void review(document.id,"request_correction")}>Demander une correction</button>
            </>}
          </div>
        </div>
        {typeof document.metadata?.review_note==="string"&&document.metadata.review_note?<p style={{marginTop:10,fontSize:12}}>Note : {document.metadata.review_note}</p>:null}
      </article>)}
    </section>}
  </main>;
}
