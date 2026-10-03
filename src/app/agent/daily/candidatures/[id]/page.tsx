import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { loadScopedDailyCandidature, loadCandidaturePositioning, candidatureRecord, type CandidaturePositioning } from "@/lib/server/dailyStudioCandidature";
import { privateDailyPath, downloadPrivateDailySource } from "@/lib/server/dailyStudioFormationSources";
type Props={params:Promise<{id:string}>};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
async function saveAnalysis(formData:FormData){
  "use server";
  const auth=await requireSupportAgent(); if(!auth.ok) throw new Error(auth.error);
  const id=text(formData,"id"); if(!id) throw new Error("Candidature introuvable.");
  const admin=createSupabaseAdminClient();
  const scoped=await loadScopedDailyCandidature(admin,auth.email,id);
  if(!scoped) throw new Error("Candidature introuvable.");
  const req={...scoped.request,daily_formations:scoped.formation};
  if(req.decision_status!=="pending"&&req.decision_status!=="ready_for_of") throw new Error("Cette candidature a déjà reçu une décision finale.");
  const expectedUpdatedAt=text(formData,"candidature_updated_at");
  if(!expectedUpdatedAt||!Number.isFinite(new Date(expectedUpdatedAt).getTime())) throw new Error("Rechargez le dossier pour relire la version courante de l’analyse.");
  const conflictMessage="Le dossier a changé depuis son ouverture. Rechargez-le avant de transmettre l’analyse à l’OF.";
  if(req.updated_at!==expectedUpdatedAt) throw new Error(conflictMessage);
  if(scoped.formation.status==="archived") throw new Error("Cette version de formation est archivée. Le dossier est conservé en lecture seule.");
  if(candidatureRecord(req.positioning_answers).mode==="off_platform"){
    const positioning=await loadCandidaturePositioning(admin,scoped.request,scoped.formation);
    if(!positioning?.filled.length) throw new Error("Vérifie les copies de positionnement avant de terminer l’analyse.");
    if(!positioning.current) throw new Error("Le questionnaire a changé. Un positionnement courant est nécessaire avant transmission à l’OF.");
    for(const document of positioning.filled) await downloadPrivateDailySource(admin,document);
  }
  const prerequisiteMode=(req.daily_formations as any)?.prerequisite_mode??"none";
  const {data:evidence,error:evidenceError}=await admin.from("daily_prerequisite_evidence").select("status").eq("registration_request_id",id);
  if(evidenceError) throw new Error(evidenceError.message);
  const rows=evidence??[];
  const prerequisitesValidated=prerequisiteMode==="none" || (rows.length>0 && rows.every((row)=>row.status==="verified"));
  if(!prerequisitesValidated) throw new Error("Tous les prérequis obligatoires doivent être vérifiés humainement avant transmission à l’OF.");
  const summary={motivation_summary:text(formData,"motivation_summary"),expectations_summary:text(formData,"expectations_summary"),positioning_summary:text(formData,"positioning_summary"),needs_summary:text(formData,"needs_summary"),adaptations_summary:text(formData,"adaptations_summary"),prerequisites_comment:text(formData,"prerequisites_comment"),observations:text(formData,"observations"),evaluator_email:auth.email};
  if(!summary.motivation_summary||!summary.positioning_summary||!summary.needs_summary) throw new Error("Motivation, positionnement et besoins doivent être synthétisés avant transmission.");
  const now=new Date().toISOString();
  const {data:updated,error}=await admin.from("daily_formation_registration_requests").update({agent_analysis_summary:summary,agent_analysis_completed_at:now,agent_analysis_completed_by:auth.userId,prerequisites_validated:true,decision_status:"ready_for_of",updated_at:now}).eq("id",id).eq("formation_id",scoped.formation.id).in("decision_status",["pending","ready_for_of"]).eq("decision_status",req.decision_status).eq("updated_at",expectedUpdatedAt).select("id").maybeSingle();
  if(error) throw new Error(error.message);
  if(!updated) throw new Error(conflictMessage);
  const formation=(req.daily_formations as any);
  const organisationId=String(formation?.organisation_id??"").trim();
  if(organisationId){
    const {data:organisation}=await admin.from("organisations").select("email,name,legal_name").eq("id",organisationId).maybeSingle();
    const recipient=String(organisation?.email??"").trim().toLowerCase();
    if(recipient){
      const organisationName=String(organisation?.legal_name||organisation?.name||"votre organisme");
      const formationTitle=String(formation?.title||"la formation");
      const subject=`Selen Daily · synthèse de candidature prête pour ${formationTitle}`;
      const bodyText=`Bonjour,\n\nL’analyse Selen du dossier de candidature pour ${formationTitle} est terminée.\n\nLa synthèse est disponible dans votre espace Selen Daily. Vous pouvez la consulter avec le dossier de candidature puis accepter ou refuser l’inscription.\n\nAucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription.\n\nSelen Editions`;
      const html=`<div style="font-family:Arial,sans-serif;line-height:1.6"><p>Bonjour,</p><p>L’analyse Selen du dossier de candidature pour <strong>${formationTitle}</strong> est terminée.</p><p>La synthèse est disponible dans votre espace Selen Daily. Vous pouvez la consulter avec le dossier de candidature puis <strong>accepter ou refuser l’inscription</strong>.</p><p>Aucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription.</p><p>Selen Editions</p></div>`;
      const notification=await sendClientEmailWithSilence({supabase:admin,organisationId,email:recipient,to:recipient,subject,html,text:bodyText});
      if(!notification.sent) console.warn("Daily candidature : synthèse enregistrée mais notification OF non envoyée.",notification.error);
    }
  }
  revalidatePath(`/agent/daily/candidatures/${id}`); revalidatePath("/agent/daily/candidatures"); revalidatePath("/agent/daily");
}
export default async function DailyCandidatureAnalysisPage({params}:Props){
  const {id}=await params; const auth=await requireSupportAgent(); if(!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin=createSupabaseAdminClient();
  const scoped=await loadScopedDailyCandidature(admin,auth.email,id);
  if(!scoped) notFound();
  const req={...scoped.request,daily_formations:scoped.formation};
  let positioning:CandidaturePositioning|null=null;
  let positioningError=false;
  try{positioning=await loadCandidaturePositioning(admin,scoped.request,scoped.formation);}catch{positioningError=true;}
  const {data:evidence,error:evidenceError}=await admin.from("daily_prerequisite_evidence").select("id,participant_index,requirement_label,document_id,status,reviewed_at,review_comment").eq("registration_request_id",id).order("participant_index");
  if(evidenceError) throw new Error(evidenceError.message);
  const documentIds=(evidence??[]).map((row)=>row.document_id).filter(Boolean);
  const {data:documents}=documentIds.length?await admin.from("daily_documents").select("id,logical_name,bucket,storage_path,mime_type,status").eq("organisation_id",scoped.formation.organisation_id).in("id",documentIds):{data:[]};
  const documentMap=new Map((documents??[]).map((doc)=>[doc.id,doc]));
  const evidenceWithUrls=await Promise.all((evidence??[]).map(async(row)=>{const doc=row.document_id?documentMap.get(row.document_id):null;if(doc?.bucket!=="documents"||doc.status==="archived"||!privateDailyPath(doc.storage_path,scoped.formation.organisation_id))return {...row,url:null,name:doc?.logical_name??null};const {data}=await admin.storage.from("documents").createSignedUrl(doc.storage_path,600);return {...row,url:data?.signedUrl??null,name:doc.logical_name};}));
  const summary=(req.agent_analysis_summary??{}) as Record<string,unknown>;
  const label=req.company_name || [req.respondent_first_name,req.respondent_last_name].filter(Boolean).join(" ") || req.respondent_email || "Candidat";
  const final=req.decision_status==="accepted"||req.decision_status==="refused";
  return <main style={{maxWidth:1180,margin:"0 auto",padding:"28px"}}><Link href="/agent/daily/candidatures">← Candidatures</Link>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--selen-gold2)",marginTop:18}}>Analyse du dossier de candidature</p><h1>{label}</h1><p>{(req.daily_formations as any)?.title||"Formation"} · {req.submitted_at?new Date(req.submitted_at).toLocaleString("fr-FR"):""}</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,alignItems:"start"}}>
      <section style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12}}><h2>Dossier original</h2><p><strong>Identité :</strong> {label} · {req.respondent_email||"email non renseigné"}</p><p><strong>Type :</strong> {req.response_type==="company"?"Entreprise":"Bénéficiaire"} · <strong>Adaptation signalée :</strong> {req.adaptation_needed?"Oui":"Non"}</p>
        <h3>Réponses besoins / motivation / attentes</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.need_answers??{},null,2)}</pre>
        <h3>Positionnement</h3>
        {positioning ? <div>
          <p><a href={`/agent/api/daily/candidatures/${req.id}/positioning-document?document=original`}>Télécharger le questionnaire original de cette candidature →</a></p>
          {!positioning.current ? <p>Une nouvelle version du questionnaire existe. Ces copies sont conservées comme historique de cette candidature.</p> : null}
          {positioning.filled.map(document=><p key={document.id}><strong>{document.participant}</strong><br/><a href={`/agent/api/daily/candidatures/${req.id}/positioning-document?document=${document.id}`}>Télécharger le positionnement rempli · {document.name} →</a></p>)}
          <p>Le dépôt d’une copie ne vaut pas validation humaine du niveau ou des prérequis.</p>
        </div> : candidatureRecord(req.positioning_answers).mode==="off_platform" || positioningError ? <p>Les documents de positionnement ne peuvent pas être vérifiés. Contrôle le dossier avant de terminer l’analyse.</p> : <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.positioning_answers??{},null,2)}</pre>}
        <h3>Participants</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.participants??[],null,2)}</pre><h3>Prérequis et justificatifs</h3>
        {(evidenceWithUrls.length?evidenceWithUrls:[{id:"none",requirement_label:"Aucun justificatif requis",status:"verified",url:null,name:null}]).map((row:any)=><div key={row.id} style={{padding:"8px 0",borderTop:"1px solid var(--selen-border)"}}><strong>{row.requirement_label}</strong> · {row.status}{row.url?<><br/><a href={row.url} target="_blank" rel="noreferrer">Ouvrir le justificatif{row.name?" · "+row.name:""} →</a></>:null}{row.review_comment?<p>{row.review_comment}</p>:null}</div>)}
      </section>
      <section style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12}}><h2>Synthèse Selen</h2><p style={{color:"var(--selen-text2)"}}>Cette synthèse prépare la décision de l’OF. L’agent n’accepte ni ne refuse la candidature.</p>
        <form action={saveAnalysis} style={{display:"grid",gap:12}}><input type="hidden" name="id" value={req.id}/><input type="hidden" name="candidature_updated_at" value={String(req.updated_at??"")}/>{[["motivation_summary","Synthèse motivation"],["expectations_summary","Attentes"],["positioning_summary","Positionnement / niveau"],["needs_summary","Besoins spécifiques"],["adaptations_summary","Adaptations à prévoir"],["prerequisites_comment","Commentaire prérequis"],["observations","Observations / notes utiles"]].map(([name,label])=><label key={name} style={{display:"grid",gap:5}}><strong>{label}</strong><textarea name={name} defaultValue={String(summary[name]??"")} rows={name==="observations"?5:3} disabled={final}/></label>)}<p><strong>Prérequis :</strong> {req.prerequisites_validated?"Vérifiés":"À vérifier"} · <strong>État :</strong> {req.decision_status}</p>{!final?<button style={{padding:"10px 14px",fontWeight:800}}>Terminer l’analyse et transmettre à l’OF</button>:<p>Décision OF déjà enregistrée. L’analyse est conservée en lecture seule.</p>}</form>
        {req.agent_analysis_completed_at?<p style={{marginTop:12}}>Analyse terminée le {new Date(req.agent_analysis_completed_at).toLocaleString("fr-FR")} par {String(summary.evaluator_email??"Selen")}.</p>:null}
      </section>
    </div></main>;
}
