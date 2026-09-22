import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
type Props={params:Promise<{id:string}>};
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
async function saveAnalysis(formData:FormData){
  "use server";
  const auth=await requireSupportAgent(); if(!auth.ok) throw new Error(auth.error);
  const id=text(formData,"id"); if(!id) throw new Error("Candidature introuvable.");
  const admin=createSupabaseAdminClient();
  const {data:req,error:reqError}=await admin.from("daily_formation_registration_requests").select("id,formation_id,decision_status,daily_formations(prerequisite_mode)").eq("id",id).maybeSingle();
  if(reqError||!req) throw new Error(reqError?.message??"Candidature introuvable.");
  if(req.decision_status!=="pending"&&req.decision_status!=="ready_for_of") throw new Error("Cette candidature a déjà reçu une décision finale.");
  const prerequisiteMode=(req.daily_formations as any)?.prerequisite_mode??"none";
  const {data:evidence,error:evidenceError}=await admin.from("daily_prerequisite_evidence").select("status").eq("registration_request_id",id);
  if(evidenceError) throw new Error(evidenceError.message);
  const rows=evidence??[];
  const prerequisitesValidated=prerequisiteMode==="none" || (rows.length>0 && rows.every((row)=>row.status==="verified"));
  if(!prerequisitesValidated) throw new Error("Tous les prérequis obligatoires doivent être vérifiés humainement avant transmission à l’OF.");
  const summary={motivation_summary:text(formData,"motivation_summary"),expectations_summary:text(formData,"expectations_summary"),positioning_summary:text(formData,"positioning_summary"),needs_summary:text(formData,"needs_summary"),adaptations_summary:text(formData,"adaptations_summary"),prerequisites_comment:text(formData,"prerequisites_comment"),observations:text(formData,"observations"),evaluator_email:auth.email};
  if(!summary.motivation_summary||!summary.positioning_summary||!summary.needs_summary) throw new Error("Motivation, positionnement et besoins doivent être synthétisés avant transmission.");
  const now=new Date().toISOString();
  const {error}=await admin.from("daily_formation_registration_requests").update({agent_analysis_summary:summary,agent_analysis_completed_at:now,agent_analysis_completed_by:auth.userId,prerequisites_validated:true,decision_status:"ready_for_of",updated_at:now}).eq("id",id).in("decision_status",["pending","ready_for_of"]);
  if(error) throw new Error(error.message);
  revalidatePath(`/agent/daily/candidatures/${id}`); revalidatePath("/agent/daily/candidatures"); revalidatePath("/agent/daily");
}
export default async function DailyCandidatureAnalysisPage({params}:Props){
  const {id}=await params; const auth=await requireSupportAgent(); if(!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin=createSupabaseAdminClient();
  const {data:req,error}=await admin.from("daily_formation_registration_requests").select("id,formation_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,need_answers,positioning_answers,adaptation_needed,submitted_at,signature_signed_at,decision_status,agent_analysis_summary,agent_analysis_completed_at,prerequisites_validated,daily_formations(title,prerequisite_mode,prerequisite_requirements)").eq("id",id).maybeSingle();
  if(error) throw new Error(error.message); if(!req) notFound();
  const {data:evidence,error:evidenceError}=await admin.from("daily_prerequisite_evidence").select("id,participant_index,requirement_label,document_id,status,reviewed_at,review_comment").eq("registration_request_id",id).order("participant_index");
  if(evidenceError) throw new Error(evidenceError.message);
  const documentIds=(evidence??[]).map((row)=>row.document_id).filter(Boolean);
  const {data:documents}=documentIds.length?await admin.from("daily_documents").select("id,logical_name,bucket,storage_path,mime_type,status").in("id",documentIds):{data:[]};
  const documentMap=new Map((documents??[]).map((doc)=>[doc.id,doc]));
  const evidenceWithUrls=await Promise.all((evidence??[]).map(async(row)=>{const doc=row.document_id?documentMap.get(row.document_id):null;if(!doc?.storage_path||!doc?.bucket)return {...row,url:null,name:doc?.logical_name??null};const {data}=await admin.storage.from(doc.bucket).createSignedUrl(doc.storage_path,600);return {...row,url:data?.signedUrl??null,name:doc.logical_name};}));
  const summary=(req.agent_analysis_summary??{}) as Record<string,unknown>;
  const label=req.company_name || [req.respondent_first_name,req.respondent_last_name].filter(Boolean).join(" ") || req.respondent_email || "Candidat";
  const final=req.decision_status==="accepted"||req.decision_status==="refused";
  return <main style={{maxWidth:1180,margin:"0 auto",padding:"28px"}}><Link href="/agent/daily/candidatures">← Candidatures</Link>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--selen-gold2)",marginTop:18}}>Analyse du dossier de candidature</p><h1>{label}</h1><p>{(req.daily_formations as any)?.title||"Formation"} · {req.submitted_at?new Date(req.submitted_at).toLocaleString("fr-FR"):""}</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:16,alignItems:"start"}}>
      <section style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12}}><h2>Dossier original</h2><p><strong>Identité :</strong> {label} · {req.respondent_email||"email non renseigné"}</p><p><strong>Type :</strong> {req.response_type==="company"?"Entreprise":"Bénéficiaire"} · <strong>Adaptation signalée :</strong> {req.adaptation_needed?"Oui":"Non"}</p>
        <h3>Réponses besoins / motivation / attentes</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.need_answers??{},null,2)}</pre><h3>Positionnement</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.positioning_answers??{},null,2)}</pre><h3>Participants</h3><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(req.participants??[],null,2)}</pre><h3>Prérequis et justificatifs</h3>
        {(evidenceWithUrls.length?evidenceWithUrls:[{id:"none",requirement_label:"Aucun justificatif requis",status:"verified",url:null,name:null}]).map((row:any)=><div key={row.id} style={{padding:"8px 0",borderTop:"1px solid var(--selen-border)"}}><strong>{row.requirement_label}</strong> · {row.status}{row.url?<><br/><a href={row.url} target="_blank" rel="noreferrer">Ouvrir le justificatif{row.name?" · "+row.name:""} →</a></>:null}{row.review_comment?<p>{row.review_comment}</p>:null}</div>)}
      </section>
      <section style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12}}><h2>Synthèse Selen</h2><p style={{color:"var(--selen-text2)"}}>Cette synthèse prépare la décision de l’OF. L’agent n’accepte ni ne refuse la candidature.</p>
        <form action={saveAnalysis} style={{display:"grid",gap:12}}><input type="hidden" name="id" value={req.id}/>{[["motivation_summary","Synthèse motivation"],["expectations_summary","Attentes"],["positioning_summary","Positionnement / niveau"],["needs_summary","Besoins spécifiques"],["adaptations_summary","Adaptations à prévoir"],["prerequisites_comment","Commentaire prérequis"],["observations","Observations / notes utiles"]].map(([name,label])=><label key={name} style={{display:"grid",gap:5}}><strong>{label}</strong><textarea name={name} defaultValue={String(summary[name]??"")} rows={name==="observations"?5:3} disabled={final}/></label>)}<p><strong>Prérequis :</strong> {req.prerequisites_validated?"Vérifiés":"À vérifier"} · <strong>État :</strong> {req.decision_status}</p>{!final?<button style={{padding:"10px 14px",fontWeight:800}}>Terminer l’analyse et transmettre à l’OF</button>:<p>Décision OF déjà enregistrée. L’analyse est conservée en lecture seule.</p>}</form>
        {req.agent_analysis_completed_at?<p style={{marginTop:12}}>Analyse terminée le {new Date(req.agent_analysis_completed_at).toLocaleString("fr-FR")} par {String(summary.evaluator_email??"Selen")}.</p>:null}
      </section>
    </div></main>;
}