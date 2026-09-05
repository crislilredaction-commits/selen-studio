import { revalidatePath } from "next/cache";
import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import SelenButton from "@/components/ui/SelenButton";

type Props = { params: Promise<{ id: string }> };

async function addEntry(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent(); if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  const entryType = String(formData.get("entry_type") ?? "incident");
  const level = String(formData.get("level") ?? "info");
  if (!sessionId || !summary || !["incident","adaptation"].includes(entryType) || !["info","attention","critical"].includes(level)) throw new Error("Suivi invalide.");
  const admin = createSupabaseAdminClient();
  const { data: session } = await admin.from("daily_sessions").select("organisation_id").eq("id", sessionId).maybeSingle();
  if (!session) throw new Error("Session introuvable.");
  const { error } = await admin.from("daily_session_followup_entries").insert({ organisation_id: session.organisation_id, session_id: sessionId, enrolment_id: String(formData.get("enrolment_id") ?? "") || null, entry_type: entryType, level, summary, description: String(formData.get("description") ?? "").trim() || null, action_taken: String(formData.get("action_taken") ?? "").trim() || null, status: "open" });
  if (error) throw new Error(error.message); revalidatePath(`/agent/daily/session-dossiers/${sessionId}/followup`); revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
}

async function resolveEntry(formData: FormData) {
  "use server";
  const auth = await requireSupportAgent(); if (!auth.ok) throw new Error(auth.error);
  const sessionId = String(formData.get("session_id") ?? ""); const id = String(formData.get("id") ?? "");
  if (!sessionId || !id) throw new Error("Suivi invalide.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("daily_session_followup_entries").update({ action_taken: String(formData.get("action_taken") ?? "").trim() || null, status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id).eq("session_id", sessionId);
  if (error) throw new Error(error.message); revalidatePath(`/agent/daily/session-dossiers/${sessionId}/followup`); revalidatePath(`/agent/daily/session-dossiers/${sessionId}`);
}

export default async function DailySessionFollowupPage({ params }: Props) {
  const auth = await requireSupportAgent(); if (!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const { id } = await params; const admin = createSupabaseAdminClient();
  const [{ data: session }, { data: entries }, { data: enrolments }] = await Promise.all([
    admin.from("daily_sessions").select("id,internal_reference,daily_formations(title)").eq("id", id).maybeSingle(),
    admin.from("daily_session_followup_entries").select("id,enrolment_id,entry_type,level,occurred_at,summary,description,action_taken,status,resolved_at").eq("session_id", id).order("occurred_at", { ascending: false }),
    admin.from("daily_session_enrolments").select("id,daily_learners(first_name,last_name,email)").eq("session_id", id),
  ]);
  if (!session) return <main style={{padding:28}}>Session introuvable.</main>;
  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  return <main style={{maxWidth:980,margin:"0 auto",padding:28}}><Link href={`/agent/daily/session-dossiers/${id}`}>← Retour au dossier</Link><h1>Fiche de suivi de session</h1><p style={{color:"var(--selen-text2)"}}>{formation?.title ?? "Session Daily"} · {session.internal_reference || "Sans référence"}. Cette fiche est partagée avec l’espace formateur.</p><p><Link href={`/agent/daily/session-dossiers/${id}/followup/pdf`} style={{display:"inline-flex",alignItems:"center",minHeight:38,padding:"0 13px",borderRadius:9,border:"1px solid var(--selen-border)",color:"var(--selen-text)",textDecoration:"none",fontWeight:700,fontSize:13}}>Télécharger la fiche PDF</Link></p><SelenCard><SelenCardTitle>Ajouter un suivi</SelenCardTitle><form action={addEntry} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}><input type="hidden" name="session_id" value={id}/><select name="entry_type" defaultValue="incident"><option value="incident">Incident / difficulté</option><option value="adaptation">Adaptation</option></select><select name="level" defaultValue="info"><option value="info">Information</option><option value="attention">À suivre</option><option value="critical">Critique</option></select><select name="enrolment_id" defaultValue=""><option value="">Toute la session</option>{(enrolments??[]).map((enrolment)=>{const learner=Array.isArray(enrolment.daily_learners)?enrolment.daily_learners[0]:enrolment.daily_learners;return <option key={enrolment.id} value={enrolment.id}>{`${learner?.first_name??""} ${learner?.last_name??""}`.trim()||learner?.email||"Apprenant"}</option>})}</select><input name="summary" required placeholder="Constat"/><textarea name="description" placeholder="Détails utiles"/><textarea name="action_taken" placeholder="Action engagée"/><SelenButton type="submit">Ajouter au suivi</SelenButton></form></SelenCard><section style={{display:"grid",gap:10,marginTop:18}}>{(entries??[]).map((entry)=><SelenCard key={entry.id}><SelenCardTitle>{entry.summary}</SelenCardTitle><p style={{fontSize:12,color:"var(--selen-text2)"}}>{entry.entry_type} · {entry.level} · {entry.status === "resolved" ? "Traité" : "Ouvert"} · {new Date(entry.occurred_at).toLocaleString("fr-FR")}</p>{entry.description?<p>{entry.description}</p>:null}{entry.action_taken?<p><strong>Action :</strong> {entry.action_taken}</p>:null}{entry.status !== "resolved" ? <form action={resolveEntry} style={{display:"flex",gap:8,flexWrap:"wrap"}}><input type="hidden" name="session_id" value={id}/><input type="hidden" name="id" value={entry.id}/><input name="action_taken" defaultValue={entry.action_taken ?? ""} placeholder="Suite / résolution" style={{minWidth:260}}/><SelenButton type="submit">Marquer traité</SelenButton></form>:null}</SelenCard>)}{(entries??[]).length===0?<SelenCard>Aucun suivi saisi pour le moment.</SelenCard>:null}</section></main>;
}
