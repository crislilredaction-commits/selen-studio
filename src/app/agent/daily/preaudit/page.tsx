import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getActiveDailyOrganisationIds } from "@/lib/server/dailyOrganisationScope";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import SelenCard, { SelenCardTitle } from "@/components/ui/SelenCard";

type Session = { id:string; organisation_id:string; formation_id:string; internal_reference:string|null; start_date:string|null; end_date:string|null; status:string|null; trainer_ids:unknown };
type Organisation = { id:string; name:string|null; legal_name:string|null; created_at:string|null };
type Formation = { id:string; title:string|null; status:string|null };
type Enrolment = { id:string; session_id:string; learner_id:string; status:string|null };
type DocumentRow = { id:string; organisation_id:string; session_id:string|null; learner_id:string|null; linked_object_type:string|null; linked_object_id:string|null; document_type:string; status:string; is_current:boolean };
type TrainerProfile = { id:string; organisation_id:string; display_name:string; engagement_type:string|null; active:boolean; cv_updated_at:string|null };
type TrainerCertification = { id:string; trainer_profile_id:string; title:string; valid_until:string|null };
type Procedure = { id:string; organisation_id:string; status:string; procedure_type:string };
type Watch = { id:string; organisation_id:string; watch_date:string };

type Check = { label:string; ok:boolean; detail:string };

type SessionReadiness = {
  session: Session;
  formationTitle: string;
  checks: Check[];
  score: number;
  status: "ok"|"attention"|"critical";
};

type OrganisationReadiness = {
  organisation: Organisation;
  sessions: SessionReadiness[];
  organisationChecks: Check[];
  score: number;
  status: "ok"|"attention"|"critical";
};

function monthKey(value:string){return value.slice(0,7)}
function lastMonths(count=12){const now=new Date();const values:string[]=[];for(let i=0;i<count;i++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));values.push(d.toISOString().slice(0,7));}return values.reverse()}
function pct(checks:Check[]){if(!checks.length)return 100;return Math.round((checks.filter(c=>c.ok).length/checks.length)*100)}
function readinessStatus(score:number){return score===100?"ok":score>=70?"attention":"critical" as const}
function labelStatus(status:string){return status==="ok"?"Prêt":status==="attention"?"À vérifier":"Incomplet"}
function styleStatus(status:string){if(status==="ok")return {color:"var(--selen-success)",borderColor:"rgba(74,150,104,.45)",background:"rgba(74,150,104,.08)"};if(status==="attention")return {color:"var(--selen-gold2)",borderColor:"rgba(201,148,58,.45)",background:"rgba(201,148,58,.08)"};return {color:"var(--selen-danger)",borderColor:"rgba(180,78,70,.45)",background:"rgba(180,78,70,.08)"}}
function formatDate(value?:string|null){return value?new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"}).format(new Date(`${value}T12:00:00Z`)):"Non renseignée"}
function relevantDocument(doc:DocumentRow){return doc.is_current && ["validated","published","signed","active"].includes(doc.status)}
function hasDocument(docs:DocumentRow[], types:string[]){return docs.some(doc=>types.some(type=>doc.document_type.toLowerCase().includes(type)))}

export default async function DailyPreauditPage(){
  const auth=await requireSupportAgent();
  if(!auth.ok)return <main style={s.page}>Accès refusé.</main>;
  const admin=createSupabaseAdminClient();
  const organisationIds=await getActiveDailyOrganisationIds();
  if(!organisationIds.length)return <main style={s.page}><h1>Pré-audit Daily</h1><p style={s.muted}>Aucun organisme Daily actif.</p></main>;

  const [orgRes,sessionRes,trainerRes,procedureRes,watchRes]=await Promise.all([
    admin.from("organisations").select("id,name,legal_name,created_at").in("id",organisationIds).order("name"),
    admin.from("daily_sessions").select("id,organisation_id,formation_id,internal_reference,start_date,end_date,status,trainer_ids").in("organisation_id",organisationIds).neq("status","archived").order("start_date",{ascending:false}),
    admin.from("daily_trainer_profiles").select("id,organisation_id,display_name,engagement_type,active,cv_updated_at").in("organisation_id",organisationIds).eq("active",true),
    admin.from("daily_internal_procedures").select("id,organisation_id,status,procedure_type").in("organisation_id",organisationIds),
    admin.from("daily_business_watch_entries").select("id,organisation_id,watch_date").in("organisation_id",organisationIds).order("watch_date",{ascending:false}),
  ]);
  const baseError=orgRes.error??sessionRes.error??trainerRes.error??procedureRes.error??watchRes.error;
  if(baseError)return <main style={s.page}><p style={s.error}>Pré-audit indisponible : {baseError.message}</p></main>;

  const organisations=(orgRes.data??[]) as Organisation[];
  const sessions=(sessionRes.data??[]) as Session[];
  const trainers=(trainerRes.data??[]) as TrainerProfile[];
  const procedures=(procedureRes.data??[]) as Procedure[];
  const watches=(watchRes.data??[]) as Watch[];
  const sessionIds=sessions.map(x=>x.id);
  const formationIds=[...new Set(sessions.map(x=>x.formation_id).filter(Boolean))];
  const trainerIds=trainers.map(x=>x.id);

  const [formationRes,enrolmentRes,documentRes,certRes,attendanceSlotRes,assessmentRes,feedbackRes]=await Promise.all([
    formationIds.length?admin.from("daily_formations").select("id,title,status").in("id",formationIds):Promise.resolve({data:[],error:null}),
    sessionIds.length?admin.from("daily_session_enrolments").select("id,session_id,learner_id,status").in("session_id",sessionIds):Promise.resolve({data:[],error:null}),
    admin.from("daily_documents").select("id,organisation_id,session_id,learner_id,linked_object_type,linked_object_id,document_type,status,is_current").in("organisation_id",organisationIds).eq("is_current",true),
    trainerIds.length?admin.from("daily_trainer_certifications").select("id,trainer_profile_id,title,valid_until").in("trainer_profile_id",trainerIds):Promise.resolve({data:[],error:null}),
    sessionIds.length?admin.from("daily_attendance_slots").select("id,session_id,daily_attendance_records(id,status)").in("session_id",sessionIds):Promise.resolve({data:[],error:null}),
    sessionIds.length?admin.from("daily_learning_assessments").select("id,session_id,outcome").in("session_id",sessionIds):Promise.resolve({data:[],error:null}),
    sessionIds.length?admin.from("daily_learner_feedback_responses").select("id,session_id,submitted_at").in("session_id",sessionIds):Promise.resolve({data:[],error:null}),
  ]);
  const secondaryError=formationRes.error??enrolmentRes.error??documentRes.error??certRes.error??attendanceSlotRes.error??assessmentRes.error??feedbackRes.error;
  if(secondaryError)return <main style={s.page}><p style={s.error}>Pré-audit indisponible : {secondaryError.message}</p></main>;

  const formations=new Map(((formationRes.data??[]) as Formation[]).map(x=>[x.id,x]));
  const enrolments=(enrolmentRes.data??[]) as Enrolment[];
  const docs=((documentRes.data??[]) as DocumentRow[]).filter(relevantDocument);
  const certs=(certRes.data??[]) as TrainerCertification[];
  const attendanceSlots=(attendanceSlotRes.data??[]) as Array<{id:string;session_id:string;daily_attendance_records:Array<{id:string;status:string}>|null}>;
  const assessments=(assessmentRes.data??[]) as Array<{id:string;session_id:string;outcome:string|null}>;
  const feedbacks=(feedbackRes.data??[]) as Array<{id:string;session_id:string;submitted_at:string|null}>;
  const months=lastMonths(12);
  const today=new Date().toISOString().slice(0,10);

  const readiness:OrganisationReadiness[]=organisations.map(organisation=>{
    const orgTrainers=trainers.filter(x=>x.organisation_id===organisation.id);
    const orgProcedures=procedures.filter(x=>x.organisation_id===organisation.id);
    const orgWatchMonths=new Set(watches.filter(x=>x.organisation_id===organisation.id).map(x=>monthKey(x.watch_date)));
    const watchStart=organisation.created_at?monthKey(organisation.created_at):months[0];
    const expectedMonths=months.filter(month=>month>=watchStart);
    const missingMonths=expectedMonths.filter(month=>!orgWatchMonths.has(month));
    const trainerDocs=docs.filter(x=>x.organisation_id===organisation.id && ["trainer","trainer_profile"].includes(String(x.linked_object_type)));
    const trainerChecks=orgTrainers.map(trainer=>{
      const trainerCerts=certs.filter(c=>c.trainer_profile_id===trainer.id);
      const activeCert=trainerCerts.some(c=>!c.valid_until||c.valid_until>=today);
      const hasCv=Boolean(trainer.cv_updated_at)||trainerDocs.some(d=>d.linked_object_id===trainer.id&&d.document_type.toLowerCase().includes("cv"));
      return {trainer,hasCv,activeCert};
    });
    const organisationChecks:Check[]=[
      {label:"Procédures internes actives",ok:orgProcedures.length>=4&&orgProcedures.filter(p=>p.status==="active").length>=4,detail:`${orgProcedures.filter(p=>p.status==="active").length}/4 procédure(s) active(s)`},
      {label:"Veille mensuelle",ok:missingMonths.length===0,detail:missingMonths.length?`Mois sans veille : ${missingMonths.join(", ")}`:"Au moins une veille tracée chaque mois contrôlé"},
      {label:"CV formateurs",ok:trainerChecks.every(x=>x.hasCv),detail:orgTrainers.length?`${trainerChecks.filter(x=>x.hasCv).length}/${orgTrainers.length} CV présent(s)`:"Aucun formateur actif"},
      {label:"Certifications / compétences formateurs",ok:trainerChecks.every(x=>x.activeCert),detail:orgTrainers.length?`${trainerChecks.filter(x=>x.activeCert).length}/${orgTrainers.length} formateur(s) avec certification renseignée et non expirée`:"Aucun formateur actif"},
    ];

    const sessionReadiness=sessions.filter(x=>x.organisation_id===organisation.id).map(session=>{
      const formation=formations.get(session.formation_id);
      const sessionEnrolments=enrolments.filter(x=>x.session_id===session.id&&!['declined','cancelled','abandoned'].includes(String(x.status)));
      const sessionDocs=docs.filter(x=>x.session_id===session.id);
      const learners=sessionEnrolments.map(x=>x.learner_id);
      const learnerDocs=docs.filter(x=>learners.includes(String(x.learner_id))||(x.linked_object_type==="learner"&&learners.includes(String(x.linked_object_id))));
      const slots=attendanceSlots.filter(x=>x.session_id===session.id);
      const attendanceRecords=slots.flatMap(x=>x.daily_attendance_records??[]);
      const assessmentRows=assessments.filter(x=>x.session_id===session.id);
      const feedbackRows=feedbacks.filter(x=>x.session_id===session.id);
      const ended=Boolean(session.end_date&&session.end_date<today);
      const started=Boolean(session.start_date&&session.start_date<=today);
      const checks:Check[]=[
        {label:"Programme validé",ok:formation?.status==="validated",detail:formation?.status?`État : ${formation.status}`:"Programme introuvable"},
        {label:"Dossiers d'inscription",ok:sessionEnrolments.length>0,detail:`${sessionEnrolments.length} inscription(s) active(s)`},
        {label:"Documents contractuels / convocation",ok:hasDocument(sessionDocs,["convention","contrat","convocation"]),detail:hasDocument(sessionDocs,["convention","contrat","convocation"])?"Au moins un document contractuel ou convocation validé(e)":"Aucun document contractuel/convocation validé(e) détecté(e)"},
        {label:"Documents apprenants",ok:sessionEnrolments.length===0||learnerDocs.length>=sessionEnrolments.length,detail:`${learnerDocs.length} document(s) apprenant pour ${sessionEnrolments.length} inscription(s)`},
        {label:"Émargements / présences",ok:!started||attendanceRecords.length>0,detail:!started?"Session non démarrée":`${attendanceRecords.length} enregistrement(s) de présence`},
        {label:"Évaluations des acquis",ok:!ended||assessmentRows.some(x=>x.outcome&&x.outcome!=="pending"),detail:!ended?"Contrôle exigible à la fin de session":`${assessmentRows.filter(x=>x.outcome&&x.outcome!=="pending").length} évaluation(s) renseignée(s)`},
        {label:"Satisfaction apprenants",ok:!ended||feedbackRows.length>0,detail:!ended?"Contrôle exigible à la fin de session":`${feedbackRows.length} retour(s) reçu(s)`},
        {label:"Documents de fin de formation",ok:!ended||hasDocument(sessionDocs,["attestation","certificat","realisation","réalisation"]),detail:!ended?"Contrôle exigible à la fin de session":hasDocument(sessionDocs,["attestation","certificat","realisation","réalisation"])?"Document(s) de fin validé(s)":"Attestation/certificat de réalisation manquant"},
      ];
      const score=pct(checks);
      return {session,formationTitle:formation?.title||session.internal_reference||"Session Daily",checks,score,status:readinessStatus(score)};
    });
    const allChecks=[...organisationChecks,...sessionReadiness.flatMap(x=>x.checks)];
    const score=pct(allChecks);
    return {organisation,sessions:sessionReadiness,organisationChecks,score,status:readinessStatus(score)};
  });

  const readyCount=readiness.filter(x=>x.status==="ok").length;
  return <main style={s.page}>
    <header style={s.header}><div><p style={s.kicker}>Selen Studio · Daily</p><h1 style={s.h1}>Pré-audit</h1><p style={s.lead}>Vue « audit demain » : organismes, sessions et preuves essentielles. Un point manquant reste visible même si la session est déjà passée.</p></div><div style={s.counter}><strong>{readyCount}/{readiness.length}</strong><span>organisme(s) prêts</span></div></header>
    <section style={s.legend}><span><b style={{...s.dot,background:"var(--selen-success)"}}/>Prêt</span><span><b style={{...s.dot,background:"var(--selen-gold2)"}}/>À vérifier</span><span><b style={{...s.dot,background:"var(--selen-danger)"}}/>Incomplet</span></section>
    <section style={s.list}>{readiness.map(org=>{
      const name=org.organisation.legal_name||org.organisation.name||"Organisme Daily";
      return <SelenCard key={org.organisation.id} style={s.card}>
        <div style={s.orgHead}><div><SelenCardTitle>{name}</SelenCardTitle><p style={s.muted}>{org.sessions.length} session(s) contrôlée(s)</p></div><div style={s.scoreBox}><strong>{org.score}%</strong><span style={{...s.status,...styleStatus(org.status)}}>{labelStatus(org.status)}</span></div></div>
        <details style={s.details} open={org.status!=="ok"}><summary style={s.summary}>Contrôles organisme</summary><div style={s.checkGrid}>{org.organisationChecks.map(check=><CheckRow key={check.label} check={check}/>)}</div></details>
        <div style={s.sessions}>{org.sessions.length===0?<p style={s.muted}>Aucune session à contrôler.</p>:org.sessions.map(row=><article key={row.session.id} style={s.sessionCard}><div style={s.sessionHead}><div><strong>{row.formationTitle}</strong><p style={s.muted}>{row.session.internal_reference||"Sans référence"} · {formatDate(row.session.start_date)} → {formatDate(row.session.end_date)}</p></div><div style={s.sessionScore}><strong>{row.score}%</strong><span style={{...s.status,...styleStatus(row.status)}}>{labelStatus(row.status)}</span></div></div><div style={s.progress}><span style={{width:`${row.score}%`}}/></div><details style={s.details}><summary style={s.summary}>Voir les preuves contrôlées</summary><div style={s.checkGrid}>{row.checks.map(check=><CheckRow key={check.label} check={check}/>)}</div></details><div style={s.actions}><Link href={`/agent/daily/session-dossiers/${row.session.id}/full`} style={s.link}>Ouvrir le dossier de session →</Link></div></article>)}</div>
      </SelenCard>})}</section>
  </main>;
}

function CheckRow({check}:{check:Check}){return <div style={s.check}><span style={{...s.checkIcon,color:check.ok?"var(--selen-success)":"var(--selen-danger)"}}>{check.ok?"✓":"!"}</span><div><strong>{check.label}</strong><p style={s.muted}>{check.detail}</p></div></div>}

const s:Record<string,React.CSSProperties>={page:{maxWidth:1180,margin:"0 auto",padding:"28px 28px 70px",color:"var(--selen-text)"},header:{display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",marginBottom:16,flexWrap:"wrap"},kicker:{margin:0,fontSize:10,textTransform:"uppercase",letterSpacing:".18em",fontWeight:800,color:"var(--selen-gold2)"},h1:{fontFamily:"var(--font-display)",fontSize:32,margin:"6px 0"},lead:{maxWidth:760,color:"var(--selen-text2)",fontSize:13,lineHeight:1.6},counter:{display:"grid",justifyItems:"center",gap:3,border:"1px solid var(--selen-border)",borderRadius:12,padding:"10px 14px",background:"var(--selen-bg2)",fontSize:12},legend:{display:"flex",gap:16,flexWrap:"wrap",fontSize:11,color:"var(--selen-text2)",marginBottom:16},dot:{display:"inline-block",width:8,height:8,borderRadius:999,marginRight:6},list:{display:"grid",gap:14},card:{padding:18},orgHead:{display:"flex",justifyContent:"space-between",gap:16,alignItems:"start",marginBottom:12},scoreBox:{display:"grid",justifyItems:"end",gap:5,fontSize:22},status:{fontSize:10,fontWeight:800,border:"1px solid",borderRadius:999,padding:"4px 8px"},details:{borderTop:"1px solid var(--selen-border)",marginTop:10},summary:{cursor:"pointer",fontWeight:800,fontSize:12,padding:"10px 0"},checkGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:8,paddingBottom:10},check:{display:"grid",gridTemplateColumns:"24px 1fr",gap:8,padding:10,border:"1px solid var(--selen-border)",borderRadius:8,background:"var(--selen-bg3)"},checkIcon:{fontWeight:900,fontSize:16},muted:{margin:"4px 0 0",fontSize:11,color:"var(--selen-text3)",lineHeight:1.45},sessions:{display:"grid",gap:10,marginTop:12},sessionCard:{border:"1px solid var(--selen-border)",borderRadius:10,padding:13,background:"var(--selen-bg3)"},sessionHead:{display:"flex",justifyContent:"space-between",gap:14,alignItems:"start"},sessionScore:{display:"grid",justifyItems:"end",gap:4},progress:{height:5,background:"var(--selen-bg)",borderRadius:999,overflow:"hidden",margin:"10px 0"},actions:{display:"flex",justifyContent:"flex-end",marginTop:8},link:{color:"var(--selen-gold2)",fontWeight:800,fontSize:12,textDecoration:"none"},error:{color:"var(--selen-danger)"}};