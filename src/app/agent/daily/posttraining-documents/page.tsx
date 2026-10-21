"use client";
import { useCallback,useEffect,useMemo,useState } from "react";

type DocumentRow={id:string;document_type:string;status:string;version:number;created_at:string;updated_at:string;sha256:string;metadata?:Record<string,unknown>|null;organisations?:{name?:string|null}|null};
const labels:Record<string,string>={attendance_summary:"Relevé des présences",completion_certificate:"Certificat de réalisation"};
const statusLabels:Record<string,string>={to_check:"À vérifier",to_validate:"À valider",validated:"Validé",correction_requested:"Correction demandée",published:"Publié",signed:"Signé",archived:"Archivé"};

export default function Page(){
  const[documents,setDocuments]=useState<DocumentRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[filter,setFilter]=useState("attention"),[openedIds,setOpenedIds]=useState<Set<string>>(new Set()),[openingId,setOpeningId]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/agent/api/daily/posttraining-documents",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Chargement impossible.");setDocuments(d.documents??[]);setOpenedIds(new Set());}catch(e){setError(e instanceof Error?e.message:"Chargement impossible.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  const visible=useMemo(()=>documents.filter(d=>filter==="all"||["to_check","to_validate","correction_requested","validated"].includes(d.status)),[documents,filter]);

  async function openDocument(doc:DocumentRow){
    const preview=window.open("about:blank","_blank");
    if(preview)preview.opener=null;
    setOpeningId(doc.id);setError("");setMessage("");
    try{
      const r=await fetch(`/agent/api/daily/posttraining-documents/download?id=${encodeURIComponent(doc.id)}`,{headers:{Accept:"application/json"},cache:"no-store"});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error??"Consultation impossible.");
      if(preview)preview.location.replace(d.signedUrl);else window.open(d.signedUrl,"_blank","noopener,noreferrer");
      setDocuments(current=>current.map(item=>item.id===doc.id?{...item,...d.document}:item));
      setOpenedIds(current=>new Set(current).add(doc.id));
      setMessage("Version courante ouverte. Tu peux maintenant la valider ou demander une correction.");
    }catch(e){preview?.close();setError(e instanceof Error?e.message:"Consultation impossible.");}
    finally{setOpeningId("");}
  }

  async function review(doc:DocumentRow,action:"validate"|"request_correction"|"publish"){
    const note=action==="request_correction"?window.prompt("Motif ou correction demandée :","")??"":"";
    if(action==="publish"&&!window.confirm("Publier ce document dans Selen Daily et envoyer l’email au client ?"))return;
    setError("");setMessage("");
    const r=await fetch("/agent/api/daily/posttraining-documents",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:doc.id,action,note,expected_updated_at:doc.updated_at,expected_status:doc.status,expected_version:doc.version})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){if(r.status===409)await load();return setError(d.error??"Action impossible.");}
    setMessage(action==="validate"?"Document validé. Tu peux maintenant le publier.":action==="publish"?"Document publié et client notifié par email.":"Correction demandée.");
    await load();
  }

  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}><p style={{fontSize:12,fontWeight:700}}>SELEN DAILY</p><h1>Documents de fin</h1><p>Contrôle des relevés de présence et certificats de réalisation produits à partir des preuves réelles de session. Ouvre la version courante dans Studio avant de la valider ou demander une correction. Si elle change entre-temps, la décision est refusée et la file est rechargée.</p><div style={{display:"flex",gap:8,margin:"18px 0"}}><button onClick={()=>setFilter("attention")} disabled={filter==="attention"}>À traiter</button><button onClick={()=>setFilter("all")} disabled={filter==="all"}>Tous</button></div>{error?<div style={{padding:12,border:"1px solid #b24c3d",marginBottom:12}}>{error}</div>:null}{message?<div style={{padding:12,border:"1px solid var(--selen-border)",marginBottom:12}}>{message}</div>:null}{loading?<p>Chargement…</p>:<section style={{display:"grid",gap:12}}>{visible.length===0?<div>Aucun document dans cette vue.</div>:visible.map(doc=>{const mayReview=!["published","signed","archived"].includes(doc.status);const opened=openedIds.has(doc.id);return <article key={doc.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16}}><div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{labels[doc.document_type]??doc.document_type}</strong>{typeof doc.metadata?.learner_name==="string"?` · ${doc.metadata.learner_name}`:""}<div style={{fontSize:12}}>{doc.organisations?.name??"Organisme"} · v{doc.version} · {statusLabels[doc.status]??doc.status}</div></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>void openDocument(doc)} disabled={openingId===doc.id}>{openingId===doc.id?"Ouverture…":"Ouvrir la pièce"}</button>{doc.status==="validated"?<button onClick={()=>void review(doc,"publish")}>Publier et notifier</button>:mayReview?<><button onClick={()=>void review(doc,"validate")} disabled={!opened}>Valider</button><button onClick={()=>void review(doc,"request_correction")} disabled={!opened}>Correction</button></>:null}</div></div>{mayReview&&!opened?<p style={{fontSize:12,marginBottom:0}}>Ouvre cette version avant toute décision.</p>:null}</article>;})}</section>}</main>;
}
