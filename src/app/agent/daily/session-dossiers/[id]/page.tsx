import { revalidatePath } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent, requireSupportAdmin } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

const statusLabels: Record<string,string> = { todo:"À faire", in_progress:"En cours", to_review:"À vérifier", validated:"Validé", blocked:"Bloqué", not_applicable:"Non applicable" };
const phaseLabels: Record<string,string> = { before:"Avant", during:"Pendant", after:"Après" };
const responsibilityLabels: Record<string,string> = { client:"Client", selen:"Selen", shared:"Partagée" };

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
  const [{data:dossier},{data:session},{data:items},{data:agents}]=await Promise.all([
    admin.from("daily_session_dossiers").select("*").eq("session_id",id).maybeSingle(),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,modality,status").eq("id",id).maybeSingle(),
    admin.from("daily_session_checklist_items").select("*").eq("session_id",id).order("position"),
    admin.from("agent_profiles").select("id,first_name,last_name,email").eq("is_active",true).order("first_name"),
  ]);
  if (!dossier || !session) return <main style={{padding:28}}>Dossier introuvable.</main>;
  const [{data:org},{data:formation}]=await Promise.all([admin.from("organisations").select("name").eq("id",session.organisation_id).maybeSingle(),admin.from("daily_formations").select("title").eq("id",session.formation_id).maybeSingle()]);
  const open=(items??[]).filter((i)=>!["validated","not_applicable"].includes(i.status)).length; const blocked=(items??[]).filter((i)=>i.status==="blocked").length;
  return <main style={{maxWidth:1180,margin:"0 auto",padding:28}}>
    <h1 style={{marginBottom:4}}>{formation?.title ?? "Dossier de session"}</h1><p style={{marginTop:0,color:"var(--selen-text2)"}}>{org?.name ?? "OF"} · {session.internal_reference || "Sans référence"} · {open} point(s) ouvert(s){blocked?` · ${blocked} bloqué(s)`:""}</p>
    <SelenCard><SelenCardTitle>Assignation</SelenCardTitle><form action={assignAgent} style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><input type="hidden" name="session_id" value={id}/><select name="agent_profile_id" defaultValue={dossier.assigned_agent_profile_id ?? ""}><option value="">Non assigné</option>{(agents??[]).map((a)=><option key={a.id} value={a.id}>{`${a.first_name??""} ${a.last_name??""}`.trim()||a.email}</option>)}</select><SelenButton type="submit">Enregistrer</SelenButton></form></SelenCard>
    {(["before","during","after"] as const).map((phase)=><section key={phase} style={{marginTop:18}}><h2>{phaseLabels[phase]}</h2><div style={{display:"grid",gap:10}}>{(items??[]).filter((i)=>i.phase===phase).map((item)=><SelenCard key={item.id}><SelenCardTitle>{item.label}</SelenCardTitle><p style={{fontSize:13,color:"var(--selen-text2)"}}>{item.description}</p><div style={{fontSize:12,marginBottom:8}}>Responsabilité : {responsibilityLabels[item.responsibility] ?? item.responsibility}{item.due_at?` · Échéance ${new Date(item.due_at).toLocaleDateString("fr-FR")}`:""}</div><form action={updateItem} style={{display:"grid",gridTemplateColumns:"minmax(140px,180px) 1fr auto",gap:8}}><input type="hidden" name="session_id" value={id}/><input type="hidden" name="item_id" value={item.id}/><select name="status" defaultValue={item.status}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name="note" defaultValue={item.note ?? ""} placeholder="Note interne ou de suivi"/><SelenButton type="submit">Mettre à jour</SelenButton></form></SelenCard>)}</div></section>)}
  </main>;
}