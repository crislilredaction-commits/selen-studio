import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent, requireSupportAdmin } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

const statusLabels: Record<string,string> = { todo:"À faire", in_progress:"En cours", to_review:"À vérifier", validated:"Validé", blocked:"Bloqué", not_applicable:"Non applicable" };
const phaseLabels: Record<string,string> = { before:"Avant", during:"Pendant", after:"Après" };
const responsibilityLabels: Record<string,string> = { client:"Client", selen:"Selen", shared:"Partagée" };
const attendanceLabels: Record<string,string> = { pending:"À émarger", present:"Présent", absent:"Absent", excused:"Absence justifiée" };
const followupTypeLabels: Record<string,string> = { incident:"Incident / difficulté", adaptation:"Adaptation" };
const followupLevelLabels: Record<string,string> = { info:"Information", attention:"À suivre", critical:"Critique" };

type Props = { params: Promise<{ id: string }> };

async function updateItem(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent(); if (!auth.ok) throw new Error(auth.error);
  const sessionId=String(formData.get("session_id")??""); const itemId=String(formData.get("item_id")??""); const status=String(formData.get("status")??""); const note=String(formData.get("note")??"").trim();
  if (!sessionId || !itemId || !Object.keys(statusLabels).includes(status)) throw new Error("Mise à jour invalide.");
  const admin=createSupabaseAdminClient();
  const { error }=await admin.from("daily_session_checklist_items").update({status,note:note||null}).eq("id",itemId).eq("session_id",sessionId);
  if (error) throw new Error(error.message); revalidatePath(`/agent/daily/session-dossiers/${sessionId}`); revalidatePath("/agent/daily");
}

async function assignAgent(formData: FormData) {
  "use server";
  const auth=await requireSupportAdmin(); if (!auth.ok) throw new Error(auth.error);
  const sessionId=String(formData.get("session_id")??""); const agent=String(formData.get("agent_profile_id")??"");
  if (!sessionId) throw new Error("Session invalide."); const admin=createSupabaseAdminClient();
  const { error }=await admin.from("daily_session_dossiers").update({assigned_agent_profile_id:agent||null}).eq("session_id",sessionId);
  if (error) throw new Error(error.message); revalidatePath(`/agent/daily/session-dossiers/${sessionId}`); revalidatePath("/agent/daily");
}

export default async function SessionDossierPage({ params }: Props) {
  const auth=await requireSupportAgent(); if (!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const { id }=await params; const admin=createSupabaseAdminClient();
  const [{data:dossier},{data:session},{data:items},{data:agents},{data:attendanceSlots},{data:enrolments},{data:followupEntries}]=await Promise.all([
    admin.from("daily_session_dossiers").select("*").eq("session_id",id).maybeSingle(),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,modality,status").eq("id",id).maybeSingle(),
    admin.from("daily_session_checklist_items").select("*").eq("session_id",id).order("position"),
    admin.from("agent_profiles").select("id,first_name,last_name,email").eq("is_active",true).order("first_name"),
    admin.from("daily_attendance_slots").select("id,slot_date,starts_at,ends_at,mode,status,daily_attendance_records(id,enrolment_id,status,signed_at,signature_sha256,proof_sha256,validated_at)").eq("session_id",id).order("slot_date").order("starts_at"),
    admin.from("daily_session_enrolments").select("id,learner_id,status,daily_learners(first_name,last_name,email)").eq("session_id",id),
    admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at").eq("session_id",id).order("occurred_at",{ascending:false}),
  ]);
  if (!dossier || !session) return <main style={{padding:28}}>Dossier introuvable.</main>;
  const [{data:org},{data:formation}]=await Promise.all([admin.from("organisations").select("name").eq("id",session.organisation_id).maybeSingle(),admin.from("daily_formations").select("title").eq("id",session.formation_id).maybeSingle()]);
  const open=(items??[]).filter((i)=>!["validated","not_applicable"].includes(i.status)).length; const blocked=(items??[]).filter((i)=>i.status==="blocked").length;
  const activeEnrolments=(enrolments??[]).filter((enrolment)=>!["declined","cancelled"].includes(enrolment.status));
  const attendanceRecords=(attendanceSlots??[]).flatMap((slot)=>slot.daily_attendance_records??[]);
  const presentCount=attendanceRecords.filter((record)=>record.status==="present").length;
  const expectedCount=(attendanceSlots??[]).length*activeEnrolments.length;
  const openFollowup=(followupEntries??[]).filter((entry)=>entry.status==="open");
  const criticalFollowup=openFollowup.filter((entry)=>entry.level==="critical");

  function enrolmentName(enrolmentId?: string|null) {
    if (!enrolmentId) return null;
    const enrolment=activeEnrolments.find((item)=>item.id===enrolmentId);
    const learner=Array.isArray(enrolment?.daily_learners)?enrolment?.daily_learners[0]:enrolment?.daily_learners;
    return `${learner?.first_name??""} ${learner?.last_name??""}`.trim()||learner?.email||"Apprenant";
  }

  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}>
    <h1 style={{marginBottom:4}}>{formation?.title ?? "Dossier de session"}</h1><p style={{marginTop:0,color:"var(--selen-text2)"}}>{org?.name ?? "OF"} · {session.internal_reference || "Sans référence"} · {open} point(s) ouvert(s){blocked?` · ${blocked} bloqué(s)`:""}{openFollowup.length?` · ${openFollowup.length} suivi(s) pendant session ouvert(s)`:""}</p>
    <SelenCard><SelenCardTitle>Assignation</SelenCardTitle><form action={assignAgent} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><input type="hidden" name="session_id" value={id}/><select name="agent_profile_id" defaultValue={dossier.assigned_agent_profile_id ?? ""}><option value="">Non assigné</option>{(agents??[]).map((a)=><option key={a.id} value={a.id}>{`${a.first_name??""} ${a.last_name??""}`.trim()||a.email}</option>)}</select><SelenButton type="submit">Enregistrer</SelenButton></form></SelenCard>

    {(attendanceSlots??[]).length>0?<section style={{marginTop:18}}><h2>Preuves de présence</h2><SelenCard><SelenCardTitle>Émargements collectés</SelenCardTitle><p style={{fontSize:13,color:"var(--selen-text2)"}}>{presentCount} présence(s) signée(s) sur {expectedCount} émargement(s) attendu(s). Les preuves signées conservent horodatage et empreintes SHA-256.</p><div style={{display:"grid",gap:10}}>{(attendanceSlots??[]).map((slot)=><div key={slot.id} style={{borderTop:"1px solid var(--selen-border)",paddingTop:10}}><strong>{new Date(`${slot.slot_date}T12:00:00`).toLocaleDateString("fr-FR")} · {String(slot.starts_at).slice(0,5)}–{String(slot.ends_at).slice(0,5)}</strong><div style={{fontSize:12,color:"var(--selen-text2)",margin:"4px 0 8px"}}>{slot.mode.replaceAll("_"," ")} · {slot.status}</div><div style={{display:"grid",gap:5}}>{activeEnrolments.map((enrolment)=>{const learner=Array.isArray(enrolment.daily_learners)?enrolment.daily_learners[0]:enrolment.daily_learners;const record=(slot.daily_attendance_records??[]).find((row)=>row.enrolment_id===enrolment.id);return <div key={enrolment.id} style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:13}}><span>{`${learner?.first_name??""} ${learner?.last_name??""}`.trim()||learner?.email||"Apprenant"}</span><span>{attendanceLabels[record?.status??"pending"]??record?.status}{record?.status==="present"&&record?.proof_sha256?" · preuve hashée":""}</span></div>})}</div></div>)}</div></SelenCard></section>:null}

    {(followupEntries??[]).length>0?<section style={{marginTop:18}}><h2>Déroulement de la session</h2>{criticalFollowup.length?<p style={{padding:10,border:"1px solid var(--selen-danger)",color:"var(--selen-danger)"}}>{criticalFollowup.length} situation(s) critique(s) encore ouverte(s).</p>:null}<div style={{display:"grid",gap:10}}>{(followupEntries??[]).map((entry)=><SelenCard key={entry.id}><SelenCardTitle>{followupTypeLabels[entry.entry_type]??entry.entry_type} · {entry.summary}</SelenCardTitle><div style={{fontSize:12,color:"var(--selen-text2)",marginBottom:8}}>{new Date(entry.occurred_at).toLocaleString("fr-FR")} · {followupLevelLabels[entry.level]??entry.level} · {entry.status==="resolved"?"Traité":"Ouvert"}{enrolmentName(entry.enrolment_id)?` · ${enrolmentName(entry.enrolment_id)}`:""}</div>{entry.description?<p style={{fontSize:13}}>{entry.description}</p>:null}{entry.action_taken?<p style={{fontSize:13}}><strong>Action :</strong> {entry.action_taken}</p>:null}</SelenCard>)}</div></section>:null}

    {(["before","during","after"] as const).map((phase)=><section key={phase} style={{marginTop:18}}><h2>{phaseLabels[phase]}</h2><div style={{display:"grid",gap:10}}>{(items??[]).filter((i)=>i.phase===phase).map((item)=><SelenCard key={item.id}><SelenCardTitle>{item.label}</SelenCardTitle><p style={{fontSize:13,color:"var(--selen-text2)"}}>{item.description}</p><div style={{fontSize:12,marginBottom:8}}>Responsabilité : {responsibilityLabels[item.responsibility] ?? item.responsibility}{item.due_at?` · Échéance ${new Date(item.due_at).toLocaleDateString("fr-FR")}`:""}</div><form action={updateItem} style={{display:"grid",gridTemplateColumns:"minmax(140px,180px) 1fr auto",gap:8}}><input type="hidden" name="session_id" value={id}/><input type="hidden" name="item_id" value={item.id}/><select name="status" defaultValue={item.status}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name="note" defaultValue={item.note ?? ""} placeholder="Note interne ou de suivi"/><SelenButton type="submit">Mettre à jour</SelenButton></form></SelenCard>)}</div></section>)}
  </main>;
}
