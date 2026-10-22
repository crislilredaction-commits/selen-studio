import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

function badge(value: string) {
  const labels: Record<string,string> = { pending:"En attente", invited:"Invité", confirmed:"Confirmé", declined:"Refusé", cancelled:"Annulé", completed:"Terminé", not_started:"Non démarré", sent:"Envoyé", submitted:"Répondu", reviewed:"Relu", not_reviewed:"Non vérifiés", met:"Validés", not_met:"Non remplis", to_clarify:"À clarifier" };
  return labels[value] ?? value;
}

const INACTIVE_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "canceled", "abandoned"]);

function isActiveEnrolment(status: unknown) {
  return !INACTIVE_ENROLMENT_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export default async function DailyLearnersStudioPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);

  const { data: enrolments } = organisationIds.length
    ? await admin.from("daily_session_enrolments").select("*,daily_learners(id,first_name,last_name,email),daily_sessions(id,internal_reference,start_date,end_date,daily_formations(title)),organisations(name)").in("organisation_id", organisationIds).order("created_at", { ascending: false })
    : { data: [] };

  const allEnrolments = enrolments ?? [];
  const activeEnrolments = allEnrolments.filter((item) => isActiveEnrolment(item.status));
  const historicalEnrolments = allEnrolments.filter((item) => !isActiveEnrolment(item.status));
  const enrolmentIds = activeEnrolments.map((item) => item.id);
  const { data: supportNeeds } = enrolmentIds.length
    ? await admin.from("daily_enrolment_support_needs").select("*").in("organisation_id", organisationIds).in("enrolment_id", enrolmentIds).eq("has_specific_needs", true)
    : { data: [] };

  const needsMap = new Map((supportNeeds ?? []).map((item) => [item.enrolment_id, item]));
  const activeLearners = new Set(activeEnrolments.map((item) => item.learner_id).filter(Boolean)).size;
  const confirmed = activeEnrolments.filter((e) => e.status === "confirmed").length;
  const adaptations = (supportNeeds ?? []).length;
  const pendingPositioning = activeEnrolments.filter((e) => ["not_started","sent","submitted"].includes(e.positioning_status)).length;

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(16px, 4vw, 28px)", minWidth: 0 }}>
    <div style={{ marginBottom: 22, minWidth: 0 }}><p style={{ fontSize: 12, fontWeight: 700, color: "var(--selen-text2)" }}>SELEN DAILY</p><h1 style={{ overflowWrap: "anywhere" }}>Apprenants & inscriptions</h1><p style={{ color: "var(--selen-text2)", overflowWrap: "anywhere" }}>Vue transverse des apprenants, inscriptions, positionnements et adaptations.</p></div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(160px,100%),1fr))", gap:12, marginBottom:20 }}>
      {[["Participants actifs",activeLearners],["Inscriptions confirmées",confirmed],["Positionnements à suivre",pendingPositioning],["Adaptations actives",adaptations]].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)",minWidth:0}}><div style={{fontSize:26,fontWeight:800}}>{value}</div><div style={{fontSize:12,color:"var(--selen-text2)",overflowWrap:"anywhere"}}>{label}</div></div>)}
    </div>
    <section style={{ display:"grid", gap:12, minWidth: 0 }}>
      {activeEnrolments.length === 0 ? <div style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:18}}>Aucune inscription active pour le moment.</div> : activeEnrolments.map((e) => {
        const need = needsMap.get(e.id);
        const session = e.daily_sessions as { id?: string; internal_reference?: string | null; start_date?: string | null; daily_formations?: { title?: string | null } | null } | null;
        const learner = e.daily_learners as { id?: string; first_name?: string; last_name?: string; email?: string | null } | null;
        const org = e.organisations as { name?: string } | null;
        return <article key={e.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:"clamp(12px, 3vw, 16px)",background:"var(--selen-bg2)",minWidth:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",minWidth:0}}><div style={{minWidth:0,flex:"1 1 240px",overflowWrap:"anywhere"}}><strong>{learner?.first_name} {learner?.last_name}</strong>{learner?.email ? ` · ${learner.email}` : ""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4,overflowWrap:"anywhere"}}>{org?.name ?? "Organisme"} · {session?.daily_formations?.title ?? "Session"} · {session?.internal_reference ?? session?.start_date ?? ""}</div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{learner?.id ? <Link href={`/agent/daily/learners/${learner.id}?session=${encodeURIComponent(e.session_id)}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Ouvrir la fiche apprenant</Link> : null}<Link href={`/agent/daily/session-dossiers/${e.session_id}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Ouvrir le dossier</Link></div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10,fontSize:12,minWidth:0}}><span style={{overflowWrap:"anywhere"}}>Inscription : <b>{badge(e.status)}</b></span><span style={{overflowWrap:"anywhere"}}>Positionnement : <b>{badge(e.positioning_status)}</b></span><span style={{overflowWrap:"anywhere"}}>Prérequis : <b>{badge(e.prerequisites_status)}</b></span><span style={{overflowWrap:"anywhere"}}>Financement : <b>{e.funding_type}</b></span></div>
          {need && <div style={{marginTop:10,padding:10,borderRadius:8,background:"rgba(210,145,65,.10)",overflowWrap:"anywhere"}}><strong>Adaptation à prévoir</strong>{need.needs_description ? <p style={{margin:"4px 0"}}>{need.needs_description}</p> : null}{need.planned_accommodations ? <p style={{margin:"4px 0"}}>Prévu : {need.planned_accommodations}</p> : null}{need.contact_requested ? <p style={{margin:"4px 0"}}>Un échange complémentaire est demandé.</p> : null}</div>}
        </article>;
      })}
    </section>
    {historicalEnrolments.length ? <details style={{marginTop:20,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)",overflow:"hidden"}}>
      <summary style={{cursor:"pointer",padding:16,fontWeight:800}}>Historique des inscriptions closes ({historicalEnrolments.length})</summary>
      <div style={{display:"grid",gap:10,padding:"0 16px 16px"}}>{historicalEnrolments.map((e) => {
        const session = e.daily_sessions as { id?: string; internal_reference?: string | null; start_date?: string | null; daily_formations?: { title?: string | null } | null } | null;
        const learner = e.daily_learners as { id?: string; first_name?: string; last_name?: string; email?: string | null } | null;
        const org = e.organisations as { name?: string } | null;
        return <article key={e.id} style={{border:"1px solid var(--selen-border)",borderRadius:10,padding:12,background:"var(--selen-bg3)",minWidth:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",minWidth:0}}><div style={{minWidth:0,flex:"1 1 240px",overflowWrap:"anywhere"}}><strong>{learner?.first_name} {learner?.last_name}</strong>{learner?.email ? ` · ${learner.email}` : ""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4,overflowWrap:"anywhere"}}>{org?.name ?? "Organisme"} · {session?.daily_formations?.title ?? "Session"} · {session?.internal_reference ?? session?.start_date ?? ""}</div><div style={{fontSize:12,marginTop:6}}>Inscription : <b>{badge(e.status)}</b></div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{learner?.id ? <Link href={`/agent/daily/learners/${learner.id}?session=${encodeURIComponent(e.session_id)}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Consulter l’historique</Link> : null}<Link href={`/agent/daily/session-dossiers/${e.session_id}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Ouvrir le dossier</Link></div></div>
        </article>;
      })}</div>
    </details> : null}
  </main>;
}
