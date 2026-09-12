import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyPilotageTasks, canTreatDailyPilotageTask } from "@/lib/server/dailyPilotageVisibility";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const labels: Record<string,string> = { open:"Ouverte", in_progress:"Prise en charge", returned:"Retournée à l’agent", resolved:"Résolue" };
function one(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }
function formatDate(value: string) { return new Intl.DateTimeFormat("fr-FR", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)); }

export default async function EscalationsPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={s.page}>Accès refusé.</main>;
  const params = await searchParams;
  const taskKey = one(params.task_key);
  const sessionId = one(params.session_id);
  const errorMessage = one(params.error);
  const admin = createSupabaseAdminClient();
  const [{ data: profile }, { data: adminUser }] = await Promise.all([
    admin.from("agent_profiles").select("id,role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
    admin.from("selen_admin_users").select("role").eq("email", auth.email).eq("is_active", true).maybeSingle(),
  ]);
  if (!profile?.id) return <main style={s.page}>Profil agent actif introuvable.</main>;
  const isAdmin = adminUser?.role === "admin" || profile.role === "admin";

  let query = admin.from("daily_work_escalations").select("id,organisation_id,session_id,target_type,task_key,task_title,target_href,reason,status,escalated_by,handled_by,resolution_note,created_at,updated_at,resolved_at").order("created_at", { ascending:false }).limit(60);
  if (!isAdmin) query = query.eq("escalated_by", profile.id);
  const { data: rows, error } = await query;
  if (error) return <main style={s.page}>Impossible de charger les escalades : {error.message}</main>;
  const escalations = rows ?? [];
  const ids = escalations.map((row) => row.id);
  const { data: events } = ids.length ? await admin.from("daily_work_escalation_events").select("id,escalation_id,event_type,actor_id,message,created_at").in("escalation_id", ids).order("created_at", { ascending:true }) : { data: [] };
  const profileIds = [...new Set(escalations.flatMap((row) => [row.escalated_by, row.handled_by]).concat((events ?? []).map((event) => event.actor_id)).filter(Boolean))];
  const { data: people } = profileIds.length ? await admin.from("agent_profiles").select("id,email").in("id", profileIds) : { data: [] };
  const emailById = new Map((people ?? []).map((person) => [person.id, person.email]));
  const eventsByEscalation = new Map<string, typeof events>();
  for (const event of events ?? []) eventsByEscalation.set(event.escalation_id, [...(eventsByEscalation.get(event.escalation_id) ?? []), event]);

  const activeTaskEscalation = taskKey ? escalations.find((row) => row.task_key === taskKey && ["open","in_progress"].includes(row.status)) : null;
  const tasks = taskKey ? await getDailyPilotageTasks() : [];
  const selectedTask = tasks.find((item) => item.id === taskKey && canTreatDailyPilotageTask(item, { id: profile.id, role: isAdmin ? "admin" : "agent" }));

  let dossier: { sessionId:string; organisationId:string; title:string } | null = null;
  let activeDossierEscalation = null as (typeof escalations)[number] | null;
  if (sessionId) {
    const { data: session } = await admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,status").eq("id", sessionId).neq("status","archived").maybeSingle();
    if (session) {
      const [{ data: formation }, { data: dossierRow }] = await Promise.all([
        admin.from("daily_formations").select("title").eq("id", session.formation_id).maybeSingle(),
        admin.from("daily_session_dossiers").select("session_id,assigned_agent_profile_id").eq("session_id", sessionId).maybeSingle(),
      ]);
      if (dossierRow && (isAdmin || !dossierRow.assigned_agent_profile_id || dossierRow.assigned_agent_profile_id === profile.id)) dossier = { sessionId, organisationId:session.organisation_id, title:formation?.title || session.internal_reference || "Dossier de session" };
      activeDossierEscalation = escalations.find((row) => row.target_type === "dossier" && row.session_id === sessionId && ["open","in_progress"].includes(row.status)) ?? null;
    }
  }

  const ordered = [...escalations].sort((a,b) => Number(["open","in_progress"].includes(b.status)) - Number(["open","in_progress"].includes(a.status)) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return <main style={s.page}>
    <header style={s.header}><div><p style={s.eyebrow}>Selen Daily</p><h1 style={s.h1}>Escalades vers un administrateur</h1><p style={s.lead}>Une escalade conserve la tâche ou le dossier d’origine, son assignation et son historique. Elle sert uniquement à demander un arbitrage ou une intervention admin.</p></div><Link href="/agent/daily" style={s.secondary}>← Pilotage Daily</Link></header>
    {errorMessage ? <p style={s.error}>{errorMessage}</p> : null}

    {selectedTask ? <section style={s.compose}><h2 style={s.h2}>{selectedTask.title}</h2><p style={s.muted}>{selectedTask.organisation} · {selectedTask.reason}</p>{activeTaskEscalation ? <p style={s.notice}>Cette tâche est déjà escaladée. Son suivi apparaît ci-dessous.</p> : <form method="post" action="/agent/api/daily/escalations" style={s.form}><input type="hidden" name="action" value="create"/><input type="hidden" name="target_type" value="task"/><input type="hidden" name="task_key" value={selectedTask.id}/><label style={s.label}>Motif de l’escalade<textarea name="reason" required rows={4} style={s.textarea} placeholder="Explique ce qui bloque et l’arbitrage attendu."/></label><button type="submit" style={s.primary}>Escalader cette tâche</button></form>}</section> : taskKey ? <p style={s.notice}>Cette tâche n’est plus disponible ou n’est pas traitable par ton profil.</p> : null}

    {dossier ? <section style={s.compose}><h2 style={s.h2}>{dossier.title}</h2><p style={s.muted}>Escalade du dossier complet</p>{activeDossierEscalation ? <p style={s.notice}>Ce dossier est déjà escaladé. Son suivi apparaît ci-dessous.</p> : <form method="post" action="/agent/api/daily/escalations" style={s.form}><input type="hidden" name="action" value="create"/><input type="hidden" name="target_type" value="dossier"/><input type="hidden" name="session_id" value={dossier.sessionId}/><label style={s.label}>Motif de l’escalade<textarea name="reason" required rows={4} style={s.textarea} placeholder="Explique pourquoi l’ensemble du dossier nécessite l’intervention d’un admin."/></label><button type="submit" style={s.primary}>Escalader le dossier complet</button></form>}</section> : sessionId ? <p style={s.notice}>Ce dossier n’est pas disponible pour une escalade avec ton profil.</p> : null}

    <section><div style={s.sectionHead}><h2 style={s.h2}>{isAdmin ? "File admin et historique" : "Mes escalades"}</h2><span style={s.pill}>{ordered.length}</span></div>{ordered.length === 0 ? <p style={s.empty}>Aucune escalade enregistrée.</p> : <div style={s.list}>{ordered.map((row) => {
      const history = eventsByEscalation.get(row.id) ?? [];
      return <article key={row.id} style={s.card}><div style={s.cardHead}><div><span style={s.status}>{labels[row.status] ?? row.status}</span><h3 style={s.h3}>{row.task_title || (row.target_type === "dossier" ? "Dossier complet" : "Tâche")}</h3></div><span style={s.date}>{formatDate(row.created_at)}</span></div><p style={s.reason}>{row.reason}</p><p style={s.small}>Escaladé par {emailById.get(row.escalated_by) || row.escalated_by}{row.handled_by ? ` · Admin : ${emailById.get(row.handled_by) || row.handled_by}` : ""}</p>{row.resolution_note ? <p style={s.instruction}><strong>Décision / instruction :</strong> {row.resolution_note}</p> : null}<div style={s.actions}><Link href={row.target_href} style={s.secondary}>Ouvrir le contexte →</Link>{isAdmin && row.status === "open" ? <form method="post" action="/agent/api/daily/escalations"><input type="hidden" name="action" value="take"/><input type="hidden" name="escalation_id" value={row.id}/><button style={s.primaryButton}>Prendre en charge</button></form> : null}</div>{isAdmin && ["open","in_progress"].includes(row.status) ? <div style={s.adminGrid}><form method="post" action="/agent/api/daily/escalations" style={s.form}><input type="hidden" name="action" value="return"/><input type="hidden" name="escalation_id" value={row.id}/><textarea name="message" required rows={3} style={s.textarea} placeholder="Instruction ou réponse à transmettre à l’agent"/><button style={s.secondaryButton}>Retourner à l’agent</button></form><form method="post" action="/agent/api/daily/escalations" style={s.form}><input type="hidden" name="action" value="resolve"/><input type="hidden" name="escalation_id" value={row.id}/><textarea name="message" required rows={3} style={s.textarea} placeholder="Résolution apportée"/><button style={s.primaryButton}>Résoudre</button></form></div> : null}<details style={s.history}><summary>Historique ({history.length})</summary><div style={s.historyList}>{history.map((event) => <div key={event.id} style={s.historyRow}><strong>{event.event_type}</strong><span>{event.message || "Sans commentaire"}</span><small>{emailById.get(event.actor_id) || "Système"} · {formatDate(event.created_at)}</small></div>)}</div></details></article>;
    })}</div>}</section>
  </main>;
}

const s: Record<string,React.CSSProperties> = {page:{maxWidth:1050,margin:"0 auto",padding:"28px 28px 70px",color:"var(--selen-text)"},header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:20,flexWrap:"wrap",marginBottom:18},eyebrow:{margin:0,color:"var(--selen-gold2)",fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:".16em"},h1:{margin:"5px 0",fontFamily:"var(--font-display)",fontSize:30},h2:{margin:"0 0 8px",fontSize:20},h3:{margin:"8px 0 0",fontSize:17},lead:{margin:0,maxWidth:760,color:"var(--selen-text2)",fontSize:13,lineHeight:1.6},compose:{padding:18,border:"1px solid var(--selen-border2)",borderRadius:14,background:"var(--selen-bg2)",marginBottom:16},form:{display:"grid",gap:10},label:{display:"grid",gap:6,fontSize:12,fontWeight:700},textarea:{width:"100%",boxSizing:"border-box",border:"1px solid var(--selen-border)",borderRadius:9,padding:10,background:"var(--selen-bg)",color:"var(--selen-text)",font:"inherit"},primary:{display:"inline-flex",alignItems:"center",justifyContent:"center",minHeight:38,padding:"0 12px",borderRadius:9,background:"var(--selen-gold2)",color:"var(--selen-bg)",textDecoration:"none",fontWeight:800,fontSize:12,border:0},secondary:{display:"inline-flex",alignItems:"center",minHeight:36,padding:"0 11px",border:"1px solid var(--selen-border)",borderRadius:9,color:"var(--selen-text)",textDecoration:"none",fontWeight:700,fontSize:12},primaryButton:{minHeight:36,padding:"0 11px",border:0,borderRadius:9,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:800,cursor:"pointer"},secondaryButton:{minHeight:36,padding:"0 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg2)",color:"var(--selen-text)",fontWeight:700,cursor:"pointer"},notice:{padding:12,border:"1px solid var(--selen-border)",borderRadius:10,color:"var(--selen-text2)",fontSize:12},error:{padding:12,border:"1px solid var(--selen-danger)",borderRadius:10,color:"var(--selen-danger)"},muted:{color:"var(--selen-text2)",fontSize:12},sectionHead:{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"22px 0 10px"},pill:{minWidth:28,height:28,border:"1px solid var(--selen-border)",borderRadius:999,display:"grid",placeItems:"center"},list:{display:"grid",gap:12},card:{border:"1px solid var(--selen-border)",borderRadius:14,padding:16,background:"var(--selen-bg2)"},cardHead:{display:"flex",justifyContent:"space-between",gap:14},status:{fontSize:10,fontWeight:800,color:"var(--selen-gold2)",textTransform:"uppercase"},date:{fontSize:10,color:"var(--selen-text3)",whiteSpace:"nowrap"},reason:{fontSize:13,lineHeight:1.55},small:{fontSize:11,color:"var(--selen-text3)"},instruction:{padding:10,borderRadius:9,background:"var(--selen-bg3)",fontSize:12,lineHeight:1.5},actions:{display:"flex",gap:8,flexWrap:"wrap",marginTop:10},adminGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:10,marginTop:12},history:{marginTop:12,fontSize:12},historyList:{display:"grid",gap:7,marginTop:8},historyRow:{display:"grid",gap:3,padding:8,borderLeft:"2px solid var(--selen-border2)"},empty:{padding:20,border:"1px dashed var(--selen-border)",borderRadius:12,color:"var(--selen-text2)"}};
