import Link from "next/link";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
export const dynamic = "force-dynamic";
export default async function DailyCandidaturesPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("daily_formation_registration_requests")
    .select("id,formation_id,respondent_first_name,respondent_last_name,respondent_email,company_name,response_type,submitted_at,decision_status,daily_formations(title)")
    .in("decision_status", ["pending","ready_for_of"]).order("submitted_at",{ascending:true});
  if (error) return <main style={{padding:28}}>Chargement impossible : {error.message}</main>;
  const rows=(data??[]) as Array<any>;
  return <main style={{maxWidth:1080,margin:"0 auto",padding:"28px"}}>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--selen-gold2)"}}>Selen Daily · Candidatures</p>
    <h1>Analyse des dossiers</h1>
    <p style={{color:"var(--selen-text2)"}}>Selen analyse le dossier avant toute décision de l’organisme. Une analyse terminée devient ensuite visible côté OF pour acceptation ou refus.</p>
    <div style={{display:"grid",gap:10,marginTop:18}}>
      {rows.map((row)=>{ const label=row.company_name || [row.respondent_first_name,row.respondent_last_name].filter(Boolean).join(" ") || row.respondent_email || "Candidat";
        return <article key={row.id} style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{label}</strong><span>{row.decision_status==="ready_for_of"?"Analyse terminée · décision OF attendue":"Analyse à réaliser"}</span></div>
          <p style={{margin:"6px 0",color:"var(--selen-text2)"}}>{row.daily_formations?.title || "Formation"} · {row.submitted_at?new Date(row.submitted_at).toLocaleString("fr-FR"):"date inconnue"}</p>
          <Link href={`/agent/daily/candidatures/${row.id}`} style={{fontWeight:800,color:"var(--selen-gold2)"}}>{row.decision_status==="ready_for_of"?"Consulter l’analyse →":"Analyser le dossier →"}</Link>
        </article>; })}
      {!rows.length?<p>Aucune candidature à analyser ou en attente de décision OF.</p>:null}
    </div>
  </main>;
}