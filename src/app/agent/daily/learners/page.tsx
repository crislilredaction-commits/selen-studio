import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";

function badge(value: string) {
  const labels: Record<string,string> = { pending:"En attente", invited:"Invité", confirmed:"Confirmé", declined:"Refusé", cancelled:"Annulé", completed:"Terminé", not_started:"Non démarré", sent:"Envoyé", submitted:"Répondu", reviewed:"Relu", not_reviewed:"Non vérifiés", met:"Validés", not_met:"Non remplis", to_clarify:"À clarifier" };
  return labels[value] ?? value;
}

export default async function DailyLearnersStudioPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const [{ data: learners }, { data: enrolments }, { data: supportNeeds }] = await Promise.all([
    admin.from("daily_learners").select("*,organisations(name)").order("last_name"),
    admin.from("daily_session_enrolments").select("*,daily_learners(first_name,last_name,email),daily_sessions(id,internal_reference,start_date,end_date,daily_formations(title)),organisations(name)").order("created_at", { ascending: false }),
    admin.from("daily_enrolment_support_needs").select("*").eq("has_specific_needs", true),
  ]);
  const needsMap = new Map((supportNeeds ?? []).map((item) => [item.enrolment_id, item]));
  const confirmed = (enrolments ?? []).filter((e) => e.status === "confirmed").length;
  const adaptations = (supportNeeds ?? []).length;
  const pendingPositioning = (enrolments ?? []).filter((e) => ["not_started","sent","submitted"].includes(e.positioning_status)).length;

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: 28 }}>
    <div style={{ marginBottom: 22 }}><p style={{ fontSize: 12, fontWeight: 700, color: "var(--selen-text2)" }}>SELEN DAILY</p><h1>Apprenants & inscriptions</h1><p style={{ color: "var(--selen-text2)" }}>Vue transverse des apprenants, inscriptions, positionnements et adaptations.</p></div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:20 }}>
      {[["Apprenants",learners?.length ?? 0],["Inscriptions confirmées",confirmed],["Positionnements à suivre",pendingPositioning],["Adaptations signalées",adaptations]].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)"}}><div style={{fontSize:26,fontWeight:800}}>{value}</div><div style={{fontSize:12,color:"var(--selen-text2)"}}>{label}</div></div>)}
    </div>
    <section style={{ display:"grid", gap:12 }}>
      {(enrolments ?? []).length === 0 ? <div style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:18}}>Aucune inscription pour le moment.</div> : (enrolments ?? []).map((e) => {
        const need = needsMap.get(e.id);
        const session = e.daily_sessions as { id?: string; internal_reference?: string | null; start_date?: string | null; daily_formations?: { title?: string | null } | null } | null;
        const learner = e.daily_learners as { first_name?: string; last_name?: string; email?: string | null } | null;
        const org = e.organisations as { name?: string } | null;
        return <article key={e.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><strong>{learner?.first_name} {learner?.last_name}</strong>{learner?.email ? ` · ${learner.email}` : ""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4}}>{org?.name ?? "Organisme"} · {session?.daily_formations?.title ?? "Session"} · {session?.internal_reference ?? session?.start_date ?? ""}</div></div><Link href={`/agent/daily/session-dossiers/${e.session_id}`} style={{fontSize:12}}>Ouvrir le dossier</Link></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10,fontSize:12}}><span>Inscription : <b>{badge(e.status)}</b></span><span>Positionnement : <b>{badge(e.positioning_status)}</b></span><span>Prérequis : <b>{badge(e.prerequisites_status)}</b></span><span>Financement : <b>{e.funding_type}</b></span></div>
          {need && <div style={{marginTop:10,padding:10,borderRadius:8,background:"rgba(210,145,65,.10)"}}><strong>Adaptation à prévoir</strong>{need.needs_description ? <p style={{margin:"4px 0"}}>{need.needs_description}</p> : null}{need.planned_accommodations ? <p style={{margin:"4px 0"}}>Prévu : {need.planned_accommodations}</p> : null}{need.contact_requested ? <p style={{margin:"4px 0"}}>Un échange complémentaire est demandé.</p> : null}</div>}
        </article>;
      })}
    </section>
  </main>;
}
