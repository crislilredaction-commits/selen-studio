import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { getDailySessionPhase, phaseLabel } from "@/lib/daily/sessionPhase";

const dossierStatusLabels: Record<string, string> = { active: "Actif", completed: "Clôturé", archived: "Archivé" };
const phaseOrder = { during: 0, before: 1, after: 2 } as const;

export default async function SessionDossiersPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const { data: dossiers } = await admin.from("daily_session_dossiers").select("session_id,organisation_id,status,assigned_agent_profile_id,completed_at,updated_at").neq("status", "archived").order("updated_at", { ascending: false });
  const sessionIds = (dossiers ?? []).map((d) => d.session_id);
  const orgIds = [...new Set((dossiers ?? []).map((d) => d.organisation_id))];
  const [{ data: sessions }, { data: organisations }, { data: items }, { data: agents }] = await Promise.all([
    sessionIds.length ? admin.from("daily_sessions").select("id,formation_id,internal_reference,start_date,end_date,status").in("id", sessionIds) : Promise.resolve({ data: [] }),
    orgIds.length ? admin.from("organisations").select("id,name").in("id", orgIds) : Promise.resolve({ data: [] }),
    sessionIds.length ? admin.from("daily_session_checklist_items").select("session_id,item_key,phase,status").in("session_id", sessionIds) : Promise.resolve({ data: [] }),
    admin.from("agent_profiles").select("id,first_name,last_name,email").eq("is_active", true),
  ]);
  const formationIds = [...new Set((sessions ?? []).map((s) => s.formation_id).filter(Boolean))];
  const { data: formations } = formationIds.length ? await admin.from("daily_formations").select("id,title").in("id", formationIds) : { data: [] };
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));
  const sessionMap = byId((sessions ?? []) as Array<{id:string;formation_id:string;internal_reference:string|null;start_date:string|null;end_date:string|null;status:string}>);
  const orgMap = byId((organisations ?? []) as Array<{id:string;name:string}>);
  const formationMap = byId((formations ?? []) as Array<{id:string;title:string}>);
  const agentMap = byId((agents ?? []) as Array<{id:string;first_name:string|null;last_name:string|null;email:string}>);

  const rows = (dossiers ?? []).map((d) => {
    const session = sessionMap.get(d.session_id); const currentPhase = getDailySessionPhase(session ?? {});
    const checklist = (items ?? []).filter((item) => item.session_id === d.session_id);
    const currentItems = checklist.filter((item) => item.phase === currentPhase);
    const currentOpen = currentItems.filter((item) => !["validated", "not_applicable"].includes(item.status)).length;
    const otherOpen = checklist.filter((item) => item.phase !== currentPhase && !["validated", "not_applicable"].includes(item.status)).length;
    return { dossier: d, session, currentPhase, currentOpen, otherOpen, checklist };
  }).sort((a, b) => { const phaseDiff = phaseOrder[a.currentPhase] - phaseOrder[b.currentPhase]; if (phaseDiff) return phaseDiff; const aDate = a.currentPhase === "after" ? a.session?.end_date : a.session?.start_date; const bDate = b.currentPhase === "after" ? b.session?.end_date : b.session?.start_date; return String(aDate ?? "9999-12-31").localeCompare(String(bDate ?? "9999-12-31")); });

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}><h1 style={{ marginBottom: 4 }}>Dossiers de session</h1><p style={{ color: "var(--selen-text2)", marginTop: 0 }}>Tu vois d'abord ce qui est utile maintenant. Les étapes passées et à venir restent dans le dossier sans encombrer le pilotage.</p><div style={{ display: "grid", gap: 12 }}>{rows.map(({ dossier: d, session, currentPhase, currentOpen, otherOpen, checklist }) => { const org = orgMap.get(d.organisation_id); const formation = session ? formationMap.get(session.formation_id) : null; const agent = d.assigned_agent_profile_id ? agentMap.get(d.assigned_agent_profile_id) : null; const upstreamOpen = checklist.filter((i) => i.item_key !== "selen_closure_review" && !["validated", "not_applicable"].includes(i.status)).length; const readyForClosure = d.status === "active" && upstreamOpen === 0; return <SelenCard key={d.session_id}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}><div><SelenCardTitle>{formation?.title ?? "Session Daily"}</SelenCardTitle><div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>{org?.name ?? "OF"} · {session?.internal_reference || "Sans référence"}</div></div><span style={{fontSize:11,fontWeight:800,border:"1px solid var(--selen-border)",borderRadius:999,padding:"6px 9px"}}>{phaseLabel(currentPhase)}</span></div><div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, marginTop: 10 }}><span>{dossierStatusLabels[d.status] ?? d.status}</span><span><strong>Tâches du moment : {currentOpen}</strong></span>{otherOpen > 0 ? <span style={{color:"var(--selen-text2)"}}>{otherOpen} autre(s) étape(s) conservée(s) dans le dossier</span> : null}<span>Agent : {agent ? `${agent.first_name ?? ""} ${agent.last_name ?? ""}`.trim() || agent.email : "Non assigné"}</span>{d.completed_at ? <span>Clôturé le {new Date(d.completed_at).toLocaleDateString("fr-FR")}</span> : null}</div><div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}><Link href={`/agent/daily/session-dossiers/${d.session_id}`}>{currentOpen > 0 ? "Traiter les tâches du moment →" : "Ouvrir le dossier →"}</Link><Link href={`/agent/daily/session-dossiers/${d.session_id}/followup`}>Compléter la fiche de suivi →</Link><Link href={`/agent/daily/session-dossiers/${d.session_id}/closure`}>{readyForClosure ? "Clôturer le dossier →" : d.status === "completed" ? "Voir la clôture →" : "Préparer la clôture →"}</Link></div></SelenCard>; })}{rows.length === 0 ? <SelenCard>Aucun dossier de session pour le moment.</SelenCard> : null}</div></main>;
}
