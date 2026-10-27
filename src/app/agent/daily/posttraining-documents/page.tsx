"use client";
import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import { filterPosttrainingDocuments, posttrainingDocumentMetrics } from "@/lib/daily/posttrainingDocumentTriage.mjs";

type DocumentRow={id:string;organisation_id:string;document_type:string;status:string;version:number;created_at:string;updated_at:string;sha256:string;metadata?:Record<string,unknown>|null;organisations?:{name?:string|null}|null};
const labels:Record<string,string>={attendance_summary:"Relevé des présences",completion_certificate:"Certificat de réalisation"};
const statusLabels:Record<string,string>={to_check:"À vérifier",to_validate:"À valider",validated:"Validé",correction_requested:"Correction demandée",published:"Publié",signed:"Signé",archived:"Archivé"};

export default function Page(){
  const[documents,setDocuments]=useState<DocumentRow[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[filter,setFilter]=useState("attention"),[query,setQuery]=useState(""),[typeFilter,setTypeFilter]=useState("all"),[organisationFilter,setOrganisationFilter]=useState(""),[openedIds,setOpenedIds]=useState<Set<string>>(new Set()),[openingId,setOpeningId]=useState(""),[pendingId,setPendingId]=useState("");
  const actionPending=useRef(false);
  const load=useCallback(async()=>{setLoading(true);setError("");try{const r=await fetch("/agent/api/daily/posttraining-documents",{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error??"Chargement impossible.");setDocuments(d.documents??[]);setOrganisationFilter(current=>!current||(d.documents??[]).some((doc:DocumentRow)=>doc.organisation_id===current)?current:"");setOpenedIds(new Set());}catch(e){setError(e instanceof Error?e.message:"Chargement impossible.");}finally{setLoading(false);}},[]);
  useEffect(()=>{void load();},[load]);
  // Le filtre local ne remplace jamais le contrôle des affectations côté API.
  const organisationOptions=useMemo(()=>Array.from(new Map(documents.map(doc=>[
    doc.organisation_id,{id:doc.organisation_id,name:doc.organisations?.name??"Organisme sans nom"},
  ])).values()).sort((a,b)=>a.name.localeCompare(b.name,"fr")),[documents]);
  const scopedDocuments=useMemo(()=>filterPosttrainingDocuments(documents,{view:"all",organisationId:organisationFilter}) as DocumentRow[],[documents,organisationFilter]);
  const visible=useMemo(()=>filterPosttrainingDocuments(scopedDocuments,{query,view:filter,type:typeFilter}) as DocumentRow[],[scopedDocuments,query,filter,typeFilter]);
  const metrics=useMemo(()=>posttrainingDocumentMetrics(scopedDocuments),[scopedDocuments]);

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
    if(actionPending.current || openingId) return;
    let note="";
    if(action==="request_correction"){
      const entered=window.prompt("Motif ou correction demandée :","");
      if(entered===null) return;
      note=entered.trim();
      if(!note){setError("Indique un motif avant de demander une correction.");return;}
    }
    if(action==="publish"&&!window.confirm("Publier ce document dans Selen Daily et envoyer l’email au client ?"))return;
    actionPending.current=true;
    setPendingId(doc.id);setError("");setMessage("");
    try{
      const r=await fetch("/agent/api/daily/posttraining-documents",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:doc.id,action,note,expected_updated_at:doc.updated_at,expected_status:doc.status,expected_version:doc.version}),
      });
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        if(r.status===409)await load();
        setError(d.error??"Action impossible.");
        return;
      }
      await load();
      setMessage(action==="validate"?"Document validé. Tu peux maintenant le publier.":action==="publish"?"Publication traitée. Consulte le suivi des communications pour vérifier la notification.":"Correction demandée.");
    }catch(e){
      setError(e instanceof Error?e.message:"Action impossible. Vérifie la connexion puis recharge la file.");
    }finally{
      actionPending.current=false;
      setPendingId("");
    }
  }


  return (
    <main style={{maxWidth:1180,margin:"0 auto",padding:28}}>
      <p style={{fontSize:12,fontWeight:700}}>SELEN DAILY</p>
      <h1>Documents de fin</h1>
      <p>Contrôle des relevés de présence et certificats de réalisation produits à partir des preuves réelles de session. Ouvre la version courante avant toute décision. Si elle change, la décision est refusée et la file est rechargée.</p>
      <section aria-label="Recherche et priorités des documents de fin" style={{display:"grid",gap:12,margin:"18px 0"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
          <label style={{display:"grid",gap:4,flex:"1 1 270px"}}>Rechercher un document
            <input aria-label="Rechercher un document de fin" value={query} maxLength={80} onChange={event=>setQuery(event.target.value)} placeholder="Organisme, apprenant ou référence de session" style={{padding:9,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg2)",color:"var(--selen-text)"}}/>
          </label>
          <label style={{display:"grid",gap:4,flex:"1 1 200px"}}>Organisme
            <select aria-label="Filtrer les documents de fin par organisme" value={organisationFilter} onChange={event=>setOrganisationFilter(event.target.value)} style={{padding:9,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg2)",color:"var(--selen-text)"}}>
              <option value="">Tous mes organismes</option>
              {organisationOptions.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
          </label>
          <label style={{display:"grid",gap:4,flex:"1 1 200px"}}>Type de pièce
            <select aria-label="Type de document" value={typeFilter} onChange={event=>setTypeFilter(event.target.value)} style={{padding:9,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg2)",color:"var(--selen-text)"}}>
              <option value="all">Tous les types</option>
              <option value="attendance_summary">Relevés des présences</option>
              <option value="completion_certificate">Certificats de réalisation</option>
            </select>
          </label>
        </div>
        <div role="group" aria-label="État des documents" style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button onClick={()=>setFilter("attention")} disabled={filter==="attention"}>À traiter ({metrics.attention})</button>
          <button onClick={()=>setFilter("corrections")} disabled={filter==="corrections"}>Corrections ({metrics.corrections})</button>
          <button onClick={()=>setFilter("ready")} disabled={filter==="ready"}>Validés à publier ({metrics.ready})</button>
          <button onClick={()=>setFilter("all")} disabled={filter==="all"}>Tous ({metrics.total})</button>
          <button onClick={()=>{setFilter("attention");setTypeFilter("all");setQuery("");setOrganisationFilter("");}} disabled={filter==="attention"&&typeFilter==="all"&&!query&&!organisationFilter}>Réinitialiser</button>
        </div>
        <p role="status" style={{fontSize:12,margin:0}}>{visible.length} document(s) affiché(s) sur {metrics.total} pour {organisationFilter?"l’organisme sélectionné":"mes organismes affectés"}. Les corrections sont prioritaires.</p>
      </section>
      {error?<div role="alert" style={{padding:12,border:"1px solid #b24c3d",marginBottom:12}}>{error}</div>:null}
      {message?<div role="status" style={{padding:12,border:"1px solid var(--selen-border)",marginBottom:12}}>{message}</div>:null}
      {loading?<p aria-busy="true">Chargement…</p>:<section style={{display:"grid",gap:12}}>
        {visible.length===0?<div>Aucun document dans cette vue. Modifie les filtres ou réinitialise la recherche.</div>:visible.map(doc=>{
          const mayReview=!["published","signed","archived"].includes(doc.status);
          const opened=openedIds.has(doc.id);
          const busy=Boolean(pendingId)||Boolean(openingId);
          return <article key={doc.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <strong>{labels[doc.document_type]??doc.document_type}</strong>
                {typeof doc.metadata?.learner_name==="string"?" · "+doc.metadata.learner_name:""}
                <div style={{fontSize:12}}>{doc.organisations?.name??"Organisme"} · v{doc.version} · {statusLabels[doc.status]??doc.status}</div>
                {doc.status==="correction_requested"?<p style={{fontSize:12,margin:"6px 0 0"}}>Correction demandée : vérifier la nouvelle version avant validation.</p>:null}
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={()=>void openDocument(doc)} disabled={busy}>{openingId===doc.id?"Ouverture…":"Ouvrir la pièce"}</button>
                {doc.status==="validated"?<button onClick={()=>void review(doc,"publish")} disabled={!opened || busy}>{pendingId===doc.id?"Traitement…":"Publier et notifier"}</button>:mayReview?<>
                  <button onClick={()=>void review(doc,"validate")} disabled={!opened || Boolean(pendingId) || Boolean(openingId)}>{pendingId===doc.id?"Traitement…":"Valider"}</button>
                  <button onClick={()=>void review(doc,"request_correction")} disabled={!opened || Boolean(pendingId) || Boolean(openingId)}>Correction</button>
                </>:null}
              </div>
            </div>
            {mayReview&&!opened?<p style={{fontSize:12,marginBottom:0}}>Ouvre cette version avant toute décision.</p>:null}
          </article>;
        })}
      </section>}
    </main>
  );
}
