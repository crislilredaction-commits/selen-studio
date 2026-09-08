import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";
import { getQualiopiPreauditOrganisations } from "@/lib/server/dailyQualiopiPreaudit";
import { getCommunicationEvidenceCheck } from "@/lib/server/dailyCommunicationEvidence";

type Session={id:string;organisation_id:string;formation_id:string;internal_reference:string|null;start_date:string|null;end_date:string|null;status:string|null};
type Check={label:string;ok:boolean;detail:string};
const pct=(checks:Check[])=>checks.length?Math.round(checks.filter(x=>x.ok).length/checks.length*100):100;
const date=(v:string|null)=>v?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(`${v}T12:00:00Z`)):"—";
export default async function DailyPreauditPage(){
 const auth=await requireSupportAgent();if(!auth.ok)return <main style={s.page}>Accès refusé.</main>;
 const targets=await getQualiopiPreauditOrganisations();
 if(!targets.length)return <main style={s.page}><p style={s.kicker}>Selen Studio · Daily</p><h1>Pré-audit Qualiopi</h1><p style={s.muted}>Aucun organisme certifié Qualiopi n'a d'audit de surveillance ou de renouvellement dans les trois prochains mois.</p></main>;
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
 return <main style={s.page}><header style={s.header}><div><p style={s.kicker}>Selen Studio · Daily</p><h1>Pré-audit Qualiopi</h1><p style={s.muted}>Uniquement les organismes certifiés dont la surveillance ou le renouvellement tombe dans les trois prochains mois. Les écarts servent aussi à alimenter le Pilotage Daily et le tableau de bord Studio.</p></div><strong>{cards.length} organisme(s) à préparer</strong></header>{cards.map(card=><SelenCard key={card.target.id} style={s.card}><div style={s.head}><div><SelenCardTitle>{card.target.name}</SelenCardTitle><p style={s.muted}>{card.target.deadlineKind==="surveillance"?"Surveillance":"Renouvellement"} : {date(card.target.deadline)}</p></div><b>{card.score}%</b></div><div style={s.checks}>{card.orgChecks.map(c=><CheckRow key={c.label} c={c}/>)}</div>{card.sessionCards.map(row=><details key={row.session.id} style={s.session} open={row.score<100}><summary><strong>{row.session.internal_reference||"Session Daily"}</strong> · {row.score}% · {date(row.session.start_date)} → {date(row.session.end_date)}</summary><div style={s.checks}>{row.checks.map(c=><CheckRow key={c.label} c={c}/>)}</div><Link href={`/agent/daily/session-dossiers/${row.session.id}`} style={s.link}>Ouvrir le dossier de session →</Link></details>)}</SelenCard>)}</main>;
}
function CheckRow({c}:{c:Check}){return <div style={s.check}><b>{c.ok?"✓":"!"}</b><div><strong>{c.label}</strong><p style={s.muted}>{c.detail}</p></div></div>}
const s:Record<string,React.CSSProperties>={page:{maxWidth:1180,margin:"0 auto",padding:"24px 28px 60px",color:"var(--selen-text)"},header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"end",marginBottom:20},kicker:{fontSize:10,textTransform:"uppercase",letterSpacing:".2em",color:"var(--selen-gold)"},muted:{color:"var(--selen-text2)",fontSize:12,lineHeight:1.55,margin:"4px 0"},card:{marginBottom:14},head:{display:"flex",justifyContent:"space-between",gap:12},checks:{display:"grid",gap:7,marginTop:10},check:{display:"grid",gridTemplateColumns:"24px 1fr",gap:8,padding:9,border:"1px solid var(--selen-border)",borderRadius:6,background:"var(--selen-bg3)"},session:{marginTop:10,padding:10,border:"1px solid var(--selen-border)",borderRadius:7},link:{display:"inline-block",marginTop:8,color:"var(--selen-gold2)",textDecoration:"none",fontWeight:700}};