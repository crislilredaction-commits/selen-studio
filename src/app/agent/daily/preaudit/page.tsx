import Link from "next/link";
import { filterPreauditCards, normalizePreauditQuery, normalizePreauditView, preauditNeedsReview, preauditSummary } from "@/lib/daily/qualiopiPreauditTriage.mjs";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { getQualiopiPreauditOrganisations } from "@/lib/server/dailyQualiopiPreaudit";
import { getCommunicationEvidenceCheck } from "@/lib/server/dailyCommunicationEvidence";

type Session={id:string;organisation_id:string;formation_id:string;internal_reference:string|null;start_date:string|null;end_date:string|null;status:string|null};
type Check={label:string;ok:boolean;detail:string};
const pct=(checks:Check[])=>checks.length?Math.round(checks.filter(x=>x.ok).length/checks.length*100):100;
const date=(v:string|null)=>v?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(`${v}T12:00:00Z`)):"—";
export default async function DailyPreauditPage({ searchParams }: { searchParams?: Promise<{ q?: string | string[]; vue?: string | string[] }> }){
 const auth=await requireSupportAgent();if(!auth.ok)return <main style={s.page}>Accès refusé.</main>;
 // Ne jamais interroger les données de pré-audit d'un organisme hors affectation.
 let dailyOrganisationIds: string[];
 try {
  dailyOrganisationIds = await getDailyOrganisationIdsForAgent(auth.email);
 } catch {
  return <main role="alert" style={s.page}>Impossible de vérifier votre périmètre Daily. Réessayez plus tard.</main>;
 }
 if (!dailyOrganisationIds.length) return <main style={s.page}><h1>Pré-audit Qualiopi</h1><p>Aucun organisme Daily affecté.</p></main>;
 let targets: Awaited<ReturnType<typeof getQualiopiPreauditOrganisations>>;
 try {
  targets = await getQualiopiPreauditOrganisations(dailyOrganisationIds);
 } catch {
  return <main role="alert" style={s.page}>Impossible de charger les organismes du pré-audit.</main>;
 }
 if(!targets.length)return <main style={s.page}><p style={s.kicker}>Selen Studio · Daily</p><h1>Pré-audit Qualiopi</h1><p style={s.muted}>Aucun organisme certifié Qualiopi n’a d’audit de surveillance ou de renouvellement dans les trois prochains mois.</p></main>;
 const admin=createSupabaseAdminClient();const ids=targets.map(x=>x.id);
 const [{data:sessions,error:se},{data:docs,error:de},{data:procedures,error:pe},{data:watches,error:we},{data:trainers,error:te}]=await Promise.all([
  admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status").in("organisation_id",ids).neq("status","archived").order("start_date",{ascending:false}),
  admin.from("daily_documents").select("id,organisation_id,session_id,document_type,status,is_current").in("organisation_id",ids).eq("is_current",true),
  admin.from("daily_internal_procedures").select("id,organisation_id,status").in("organisation_id",ids),
  admin.from("daily_business_watch_entries").select("id,organisation_id,watch_date").in("organisation_id",ids),
  admin.from("daily_trainer_profiles").select("id,organisation_id,active,cv_updated_at").in("organisation_id",ids).eq("active",true),
 ]);if(se||de||pe||we||te)return <main style={s.page}><p>Pré-audit indisponible : {(se??de??pe??we??te)?.message}</p></main>;
 const rows=(sessions??[]) as Session[];const currentDocs=(docs??[]).filter(d=>["validated","published","signed","active"].includes(String(d.status)));const now=new Date();const currentMonth=now.toISOString().slice(0,7);
 const cards=await Promise.all(targets.map(async target=>{
  const orgSessions=rows.filter(x=>x.organisation_id===target.id);const orgProcedures=(procedures??[]).filter(x=>x.organisation_id===target.id&&x.status==="active");const orgTrainers=(trainers??[]).filter(x=>x.organisation_id===target.id);const watchThisMonth=(watches??[]).some(x=>x.organisation_id===target.id&&String(x.watch_date).startsWith(currentMonth));
  const orgChecks:Check[]=[{label:"Procédures internes",ok:orgProcedures.length>=4,detail:`${orgProcedures.length}/4 actives`},{label:"Veille du mois",ok:watchThisMonth,detail:watchThisMonth?"Veille tracée ce mois-ci":"Aucune veille tracée ce mois-ci"},{label:"CV formateurs",ok:orgTrainers.every(x=>Boolean(x.cv_updated_at)),detail:`${orgTrainers.filter(x=>x.cv_updated_at).length}/${orgTrainers.length} CV renseigné(s)`}];
  const sessionCards=await Promise.all(orgSessions.map(async session=>{const sd=currentDocs.filter(x=>x.session_id===session.id);const communication=await getCommunicationEvidenceCheck(target.id,session.id);const checks:Check[]=[{label:"Documents du dossier",ok:sd.length>0,detail:`${sd.length} document(s) courant(s) validé(s/publié(s)/signé(s)`},{label:"Traçabilité des envois",ok:communication.ok,detail:communication.detail}];return{session,checks,score:pct(checks)}}));
  const checks=[...orgChecks,...sessionCards.flatMap(x=>x.checks)];return{target,orgChecks,sessionCards,score:pct(checks)};
 }));
 const params = await searchParams;
 const query = normalizePreauditQuery(params?.q);
 const view = normalizePreauditView(params?.vue);
 const summary = preauditSummary(cards);
 const visibleCards = filterPreauditCards(cards, { query, view });
 return <main style={s.page}>
  <header style={s.header}><div><p style={s.kicker}>Selen Studio · Daily</p><h1>Pré-audit Qualiopi</h1><p style={s.muted}>Organismes certifiés avec surveillance ou renouvellement dans les trois prochains mois. Les contrôles sont des signaux de préparation, pas une décision de conformité.</p></div><strong>{cards.length} organisme(s) à préparer</strong></header>
  <section aria-label="Synthèse des pré-audits" style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:16}}>
   <strong>{summary.review} dossier(s) à vérifier</strong><span>{summary.soon} échéance(s) sous 30 jours</span><span>{summary.complete} dossier(s) sans alerte détectée</span>
  </section>
  <form method="get" action="/agent/daily/preaudit" style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",marginBottom:16}}>
   <label style={{display:"grid",gap:5,flex:"1 1 240px",fontSize:12}}>Rechercher
    <input aria-label="Rechercher un organisme ou une session" type="search" name="q" maxLength={80} defaultValue={query} placeholder="Organisme ou référence de session" style={{padding:10,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg)",color:"var(--selen-text)"}}/>
   </label>
   <label style={{display:"grid",gap:5,fontSize:12}}>Afficher
    <select name="vue" defaultValue={view} aria-label="Filtrer les pré-audits" style={{padding:10,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg)",color:"var(--selen-text)"}}>
     <option value="all">Tous</option><option value="review">À vérifier</option><option value="soon">Échéance sous 30 jours</option><option value="complete">Sans alerte détectée</option>
    </select>
   </label>
   <button type="submit" style={{padding:10,borderRadius:8,border:0,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:700,cursor:"pointer"}}>Filtrer</button>
   <Link href="/agent/daily/preaudit" style={s.link}>Réinitialiser les filtres</Link>
  </form>
  <p aria-live="polite" style={s.muted}>{visibleCards.length} dossier(s) affiché(s) sur {cards.length}. Les échéances proches avec points à vérifier sont prioritaires.</p>
  {visibleCards.length===0 && <p role="status" style={s.muted}>Aucun dossier ne correspond à ces filtres.</p>}
  {visibleCards.map(card=><SelenCard key={card.target.id} style={s.card}><div style={s.head}><div><SelenCardTitle>{card.target.name}</SelenCardTitle><p style={s.muted}>{card.target.deadlineKind==="surveillance"?"Surveillance":"Renouvellement"} : {date(card.target.deadline)}</p><Link href={`/agent/daily/organisations/${card.target.id}/qualiopi-cycle`} style={s.link}>Consulter le cycle Qualiopi →</Link></div><div style={{textAlign:"right"}}><b>{card.score}%</b><p style={s.muted}>{preauditNeedsReview(card)?"Points à vérifier":"Sans alerte détectée"}</p></div></div><div style={s.checks}>{card.orgChecks.map(c=><CheckRow key={c.label} c={c}/>)}</div>{card.sessionCards.map(row=><details key={row.session.id} style={s.session} open={row.score<100}><summary><strong>{row.session.internal_reference||"Session Daily"}</strong> · {row.score}% · {date(row.session.start_date)} → {date(row.session.end_date)}</summary><div style={s.checks}>{row.checks.map(c=><CheckRow key={c.label} c={c}/>)}</div><Link href={`/agent/daily/session-dossiers/${row.session.id}`} style={s.link}>Ouvrir le dossier de session →</Link></details>)}</SelenCard>)}
 </main>;
}
function CheckRow({c}:{c:Check}){return <div style={s.check}><b>{c.ok?"✓":"!"}</b><div><strong>{c.label}</strong><p style={s.muted}>{c.detail}</p></div></div>}
const s:Record<string,React.CSSProperties>={page:{maxWidth:1180,margin:"0 auto",padding:"24px 28px 60px",color:"var(--selen-text)"},header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"end",marginBottom:20},kicker:{fontSize:10,textTransform:"uppercase",letterSpacing:".2em",color:"var(--selen-gold)"},muted:{color:"var(--selen-text2)",fontSize:12,lineHeight:1.55,margin:"4px 0"},card:{marginBottom:14},head:{display:"flex",justifyContent:"space-between",gap:12},checks:{display:"grid",gap:7,marginTop:10},check:{display:"grid",gridTemplateColumns:"24px 1fr",gap:8,padding:9,border:"1px solid var(--selen-border)",borderRadius:6,background:"var(--selen-bg3)"},session:{marginTop:10,padding:10,border:"1px solid var(--selen-border)",borderRadius:7},link:{display:"inline-block",marginTop:8,color:"var(--selen-gold2)",textDecoration:"none",fontWeight:700}};
