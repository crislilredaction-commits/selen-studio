import Link from "next/link";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { sendClientEmailWithSilence } from "@/lib/server/clientNotificationSilence";
import { loadScopedDailyCandidature, loadCandidaturePositioning, candidatureRecord, type CandidaturePositioning } from "@/lib/server/dailyStudioCandidature";
import { downloadPrivateDailySource } from "@/lib/server/dailyStudioFormationSources";
import { hasExactVerifiedPrerequisiteCoverage, loadDailyPrerequisiteEvidence, reviewDailyPrerequisiteEvidence } from "@/lib/server/dailyStudioPrerequisiteEvidence";
import { candidatureNeedAnswers, candidaturePositioningAnswers, candidatureParticipants, candidatureDecisionLabel, candidatureEvidenceLabel, type CandidatureAnswer } from "@/lib/dailyCandidaturePresentation";
import styles from "./analysis.module.css";

type Props={params:Promise<{id:string}>};

const analysisGroups = [
  { title: "Motivation et attentes", fields: [
    { name: "motivation_summary", label: "Motivation", required: true, placeholder: "Le projet et ce qui motive le bénéficiaire." },
    { name: "expectations_summary", label: "Attentes", required: false, placeholder: "Les résultats attendus de la formation." },
  ] },
  { title: "Positionnement et prérequis", fields: [
    { name: "positioning_summary", label: "Positionnement / niveau", required: true, placeholder: "Le niveau de départ et les éléments observés." },
    { name: "prerequisites_comment", label: "Commentaire prérequis", required: false, placeholder: "Les vérifications réalisées et les points à préciser." },
  ] },
  { title: "Besoins et adaptations", fields: [
    { name: "needs_summary", label: "Besoins spécifiques", required: true, placeholder: "Les besoins identifiés, ou leur absence." },
    { name: "adaptations_summary", label: "Adaptations à prévoir", required: false, placeholder: "Les aménagements utiles pour cette formation." },
  ] },
  { title: "Notes de suivi", fields: [
    { name: "observations", label: "Observations / notes utiles", required: false, placeholder: "Les autres informations à conserver dans la fiche de suivi." },
  ] },
];

function renderAnswers(rows: CandidatureAnswer[], empty = "Aucune réponse renseignée.") {
  return rows.length ? <dl className={styles.answers}>{rows.map(row => <div key={row.key} className={styles.answer}>
    <dt>{row.label}</dt>{row.lines.map((line, index) => <dd key={index}>{line}</dd>)}
  </div>)}</dl> : <p className={styles.empty}>{empty}</p>;
}
function displayDate(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });
}
function documentIcon() {
  return <span className={styles.documentIcon} aria-hidden="true"><svg width="18" height="21" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M5 2h9l5 5v19H5zM14 2v6h5M8 13h8M8 18h8" /></svg></span>;
}
function text(fd:FormData,key:string){return String(fd.get(key)??"").trim();}
async function reviewEvidence(formData:FormData){
  "use server";
  const auth=await requireSupportAgent(); if(!auth.ok) throw new Error(auth.error);
  const id=text(formData,"id"); if(!id) throw new Error("Candidature introuvable.");
  const admin=createSupabaseAdminClient();
  const scoped=await loadScopedDailyCandidature(admin,auth.email,id);
  if(!scoped) throw new Error("Candidature introuvable.");
  await reviewDailyPrerequisiteEvidence({
    admin,
    owner:{kind:"formation",id,organisationId:scoped.formation.organisation_id,formationId:scoped.formation.id,sessionId:scoped.request.attached_session_id??null},
    evidenceId:text(formData,"evidence_id"),expectedUpdatedAt:text(formData,"evidence_updated_at"),decision:text(formData,"decision"),comment:text(formData,"comment"),reviewerId:auth.userId,
  });
  revalidatePath(`/agent/daily/candidatures/${id}`);
}
async function saveAnalysis(formData:FormData){
  "use server";
  const auth=await requireSupportAgent(); if(!auth.ok) throw new Error(auth.error);
  const id=text(formData,"id"); if(!id) throw new Error("Candidature introuvable.");
  const admin=createSupabaseAdminClient();
  const scoped=await loadScopedDailyCandidature(admin,auth.email,id);
  if(!scoped) throw new Error("Candidature introuvable.");
  const req={...scoped.request,daily_formations:scoped.formation};
  if(req.decision_status!=="pending"&&req.decision_status!=="ready_for_of") throw new Error("Cette candidature a déjà reçu une décision finale.");
  const expectedUpdatedAt=text(formData,"candidature_updated_at");
  if(!expectedUpdatedAt||!Number.isFinite(new Date(expectedUpdatedAt).getTime())) throw new Error("Rechargez le dossier pour relire la version courante de l’analyse.");
  const conflictMessage="Le dossier a changé depuis son ouverture. Rechargez-le avant de transmettre l’analyse à l’OF.";
  if(req.updated_at!==expectedUpdatedAt) throw new Error(conflictMessage);
  if(scoped.formation.status==="archived") throw new Error("Cette version de formation est archivée. Le dossier est conservé en lecture seule.");
  if(candidatureRecord(req.positioning_answers).mode==="off_platform"){
    const positioning=await loadCandidaturePositioning(admin,scoped.request,scoped.formation);
    if(!positioning?.filled.length) throw new Error("Vérifie les copies de positionnement avant de terminer l’analyse.");
    if(!positioning.current) throw new Error("Le questionnaire a changé. Un positionnement courant est nécessaire avant transmission à l’OF.");
    for(const document of positioning.filled) await downloadPrivateDailySource(admin,document);
  }
  const prerequisiteMode=(req.daily_formations as any)?.prerequisite_mode??"none";
  const evidence=prerequisiteMode==="required"?await loadDailyPrerequisiteEvidence(admin,{kind:"formation",id,organisationId:scoped.formation.organisation_id,formationId:scoped.formation.id,sessionId:scoped.request.attached_session_id??null}):[];
  const participantCount=req.response_type==="company"?Math.max(Array.isArray(req.participants)?req.participants.length:0,1):1;
  const prerequisitesValidated=prerequisiteMode!=="required" || hasExactVerifiedPrerequisiteCoverage(evidence,(req.daily_formations as any)?.prerequisite_requirements,participantCount);
  if(!prerequisitesValidated) throw new Error("Tous les prérequis obligatoires doivent être vérifiés humainement avant transmission à l’OF.");
  const summary={motivation_summary:text(formData,"motivation_summary"),expectations_summary:text(formData,"expectations_summary"),positioning_summary:text(formData,"positioning_summary"),needs_summary:text(formData,"needs_summary"),adaptations_summary:text(formData,"adaptations_summary"),prerequisites_comment:text(formData,"prerequisites_comment"),observations:text(formData,"observations"),evaluator_email:auth.email};
  if(!summary.motivation_summary||!summary.positioning_summary||!summary.needs_summary) throw new Error("Motivation, positionnement et besoins doivent être synthétisés avant transmission.");
  const now=new Date().toISOString();
  const {data:updated,error}=await admin.from("daily_formation_registration_requests").update({agent_analysis_summary:summary,agent_analysis_completed_at:now,agent_analysis_completed_by:auth.userId,prerequisites_validated:true,decision_status:"ready_for_of",updated_at:now}).eq("id",id).eq("formation_id",scoped.formation.id).in("decision_status",["pending","ready_for_of"]).eq("decision_status",req.decision_status).eq("updated_at",expectedUpdatedAt).select("id").maybeSingle();
  if(error) throw new Error(error.message);
  if(!updated) throw new Error(conflictMessage);
  const formation=(req.daily_formations as any);
  const organisationId=String(formation?.organisation_id??"").trim();
  if(organisationId){
    const {data:organisation}=await admin.from("organisations").select("email,name,legal_name").eq("id",organisationId).maybeSingle();
    const recipient=String(organisation?.email??"").trim().toLowerCase();
    if(recipient){
      const organisationName=String(organisation?.legal_name||organisation?.name||"votre organisme");
      const formationTitle=String(formation?.title||"la formation");
      const subject=`Selen Daily · synthèse de candidature prête pour ${formationTitle}`;
      const bodyText=`Bonjour,\n\nL’analyse Selen du dossier de candidature pour ${formationTitle} est terminée.\n\nLa synthèse est disponible dans votre espace Selen Daily. Vous pouvez la consulter avec le dossier de candidature puis accepter ou refuser l’inscription.\n\nAucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription.\n\nSelen Editions`;
      const html=`<div style="font-family:Arial,sans-serif;line-height:1.6"><p>Bonjour,</p><p>L’analyse Selen du dossier de candidature pour <strong>${formationTitle}</strong> est terminée.</p><p>La synthèse est disponible dans votre espace Selen Daily. Vous pouvez la consulter avec le dossier de candidature puis <strong>accepter ou refuser l’inscription</strong>.</p><p>Aucune préparation préformation ne démarre tant que vous n’avez pas validé l’inscription.</p><p>Selen Editions</p></div>`;
      const notification=await sendClientEmailWithSilence({supabase:admin,organisationId,email:recipient,to:recipient,subject,html,text:bodyText});
      if(!notification.sent) console.warn("Daily candidature : synthèse enregistrée mais notification OF non envoyée.",notification.error);
    }
  }
  revalidatePath(`/agent/daily/candidatures/${id}`); revalidatePath("/agent/daily/candidatures"); revalidatePath("/agent/daily");
}
export default async function DailyCandidatureAnalysisPage({params}:Props){
  const {id}=await params; const auth=await requireSupportAgent(); if(!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin=createSupabaseAdminClient();
  const scoped=await loadScopedDailyCandidature(admin,auth.email,id);
  if(!scoped) notFound();
  const req={...scoped.request,daily_formations:scoped.formation};
  let positioning:CandidaturePositioning|null=null;
  let positioningError=false;
  try{positioning=await loadCandidaturePositioning(admin,scoped.request,scoped.formation);}catch{positioningError=true;}
  const hasPrerequisites=(scoped.formation.prerequisite_mode??"none")==="required";
  const evidenceWithUrls=hasPrerequisites?await loadDailyPrerequisiteEvidence(admin,{kind:"formation",id,organisationId:scoped.formation.organisation_id,formationId:scoped.formation.id,sessionId:scoped.request.attached_session_id??null}):[];
  const summary=(req.agent_analysis_summary??{}) as Record<string,unknown>;
  const label=req.company_name || [req.respondent_first_name,req.respondent_last_name].filter(Boolean).join(" ") || req.respondent_email || "Candidat";
  const final=req.decision_status==="accepted"||req.decision_status==="refused";
  const readOnly=final||scoped.formation.status==="archived";
  const needs=candidatureNeedAnswers(req.need_answers);
  const positioningRows=candidaturePositioningAnswers(req.positioning_answers);
  const participants=candidatureParticipants(req.participants);
  const participantCount=req.response_type==="company"?Math.max(participants.length,1):1;
  const allPrerequisitesVerified=!hasPrerequisites||hasExactVerifiedPrerequisiteCoverage(evidenceWithUrls,scoped.formation.prerequisite_requirements,participantCount);
  const offPlatform=candidatureRecord(req.positioning_answers).mode==="off_platform";
  const transmissionBlock=!allPrerequisitesVerified
    ? "Les prérequis obligatoires doivent être vérifiés avant la transmission à l’OF."
    : offPlatform&&(!positioning?.current||!positioning.filled.length||positioningError)
      ? "Un positionnement courant et ses copies remplies doivent être vérifiés avant la transmission à l’OF."
      : null;
  const completedAt=displayDate(req.agent_analysis_completed_at);

  return <main className={styles.page}>
    <Link className={styles.back} href="/agent/daily/candidatures"><span aria-hidden="true">←</span> Candidatures</Link>
    <header className={styles.hero}>
      <div>
        <p className={styles.eyebrow}>Analyse du dossier de candidature</p>
        <h1 className={styles.title}>{label}</h1>
        <p className={styles.subtitle}>{scoped.formation.title||"Formation"}</p>
      </div>
      <div className={styles.heroMeta}>
        <span className={styles.status}>{scoped.formation.status==="archived"?"Formation archivée · lecture seule":candidatureDecisionLabel(req.decision_status)}</span>
        {displayDate(req.submitted_at)?<span className={styles.date}>Reçu le {displayDate(req.submitted_at)}</span>:null}
      </div>
    </header>
    <nav className={styles.sectionNav} aria-label="Rubriques de la candidature">
      <a href="#dossier-original">Dossier original</a>
      <a href="#positionnement">Positionnement</a>
      <a href="#prerequis">Prérequis et pièces</a>
      <a href="#synthese-selen">Synthèse Selen</a>
    </nav>
    <div className={styles.workspace}>
      <div className={styles.column}>
        <div className={styles.columnHeader}><h2>Dossier original</h2><span>Réponses du bénéficiaire</span></div>
        <section id="dossier-original" className={styles.paper} aria-labelledby="identite-title">
          <h3 id="identite-title">{req.response_type==="company"?"Entreprise et contact":"Bénéficiaire"}</h3>
          <p className={styles.identityName}>{req.response_type==="company"?req.company_name||label:[req.respondent_first_name,req.respondent_last_name].filter(Boolean).join(" ")||label}</p>
          {req.response_type==="company"&&[req.respondent_first_name,req.respondent_last_name].filter(Boolean).length?<p className={styles.email}>Contact : {[req.respondent_first_name,req.respondent_last_name].filter(Boolean).join(" ")}</p>:null}
          <p className={styles.email}>{req.respondent_email||"Email non renseigné"}</p>
          <div className={styles.identityMeta}>
            <span>{req.response_type==="company"?"Candidature entreprise":"Candidature individuelle"}</span>
            <span>Adaptation signalée : {req.adaptation_needed?"oui":"non"}</span>
          </div>
          {needs.details.length?<details className={styles.details}><summary>Coordonnées et informations pratiques</summary>{renderAnswers(needs.details)}</details>:null}
        </section>
        <section className={styles.paper} aria-labelledby="besoins-title">
          <h3 id="besoins-title">Besoins, motivation et attentes</h3>
          {renderAnswers(needs.main)}
        </section>
        {req.response_type==="company"||participants.length?<section className={styles.paper} aria-labelledby="participants-title">
          <h3 id="participants-title">Participants{participants.length?" · "+participants.length:""}</h3>
          {participants.length?<ul className={styles.participantList}>{participants.map((person,index)=><li key={index} className={styles.participant}>
            <strong>{person.name}</strong><p className={styles.email}>{person.email||"Email non renseigné"}</p>
            {person.details.length?<details className={styles.details}><summary>Informations du participant</summary>{renderAnswers(person.details)}</details>:null}
          </li>)}</ul>:<p className={styles.empty}>Aucun participant renseigné.</p>}
        </section>:null}
        <section id="positionnement" className={styles.paper} aria-labelledby="positionnement-title">
          <h3 id="positionnement-title">Positionnement</h3>
          {positioning ? <>
            {!positioning.current?<div className={styles.alert}><p>Une nouvelle version du questionnaire existe. Ces copies sont conservées comme historique de cette candidature.</p></div>:null}
            <ul className={styles.documents}>
              <li className={styles.document}>{documentIcon()}<div>
                <a className={styles.documentLink} href={"/agent/api/daily/candidatures/"+req.id+"/positioning-document?document=original"}>Télécharger le questionnaire original de cette candidature →</a>
                <p className={styles.documentName}>{positioning.original.name}</p>
              </div></li>
              {positioning.filled.map(document=><li key={document.id} className={styles.document}>{documentIcon()}<div>
                <a className={styles.documentLink} href={"/agent/api/daily/candidatures/"+req.id+"/positioning-document?document="+document.id}>Télécharger le positionnement rempli · {document.participant} →</a>
                <p className={styles.documentName}>{document.name}</p>
              </div></li>)}
            </ul>
            <p className={styles.note}>Le dépôt d’une copie ne vaut pas validation humaine du niveau ou des prérequis.</p>
          </> : offPlatform||positioningError ? <div className={styles.alert}><p>Les documents de positionnement ne peuvent pas être vérifiés. Contrôle le dossier avant de terminer l’analyse.</p></div> : <>
            <p className={styles.intro}>Réponses au questionnaire Selen</p>
            {renderAnswers(positioningRows,"Aucune réponse de positionnement renseignée.")}
          </>}
        </section>
        <section id="prerequis" className={styles.paper} aria-labelledby="prerequis-title">
          <h3 id="prerequis-title">Prérequis et justificatifs</h3>
          {evidenceWithUrls.length?<ul className={styles.evidenceList}>{evidenceWithUrls.map(row=><li key={row.id} className={styles.evidence}>
            <div className={styles.evidenceHead}><strong>{row.requirement_label}</strong><span className={styles.evidenceStatus+" "+(row.status==="verified"?styles.verified:"")}>{candidatureEvidenceLabel(row.status)}</span></div>
            {req.response_type==="company"&&Number.isInteger(row.participant_index)?<p className={styles.documentName}>{participants[row.participant_index]?.name||"Participant "+(row.participant_index+1)}</p>:null}
            <a className={styles.documentLink} href={row.url} target="_blank" rel="noreferrer">Ouvrir le justificatif · {row.document.name} →</a>
            {row.review_comment?<p className={styles.reviewComment}>{row.review_comment}</p>:null}
            {row.reviewed_at?<p className={styles.documentName}>Revu par {row.reviewer_label||"agent identifié"} le {displayDate(row.reviewed_at)}</p>:null}
            {!readOnly&&row.status==="submitted"?<form action={reviewEvidence} className={styles.reviewForm}>
              <input type="hidden" name="id" value={req.id}/><input type="hidden" name="evidence_id" value={row.id}/><input type="hidden" name="evidence_updated_at" value={row.updated_at}/>
              <label htmlFor={`review-comment-${row.id}`}>Commentaire de revue <span>(obligatoire en cas de refus)</span></label>
              <textarea id={`review-comment-${row.id}`} name="comment" rows={2}/>
              <div className={styles.reviewActions}><button type="submit" name="decision" value="verified">Valider la preuve</button><button type="submit" name="decision" value="rejected">Refuser la preuve</button></div>
            </form>:null}
          </li>)}</ul>:<p className={styles.empty}>{hasPrerequisites?"Les justificatifs requis restent à vérifier.":"Aucun justificatif requis."}</p>}
        </section>
      </div>
      <div className={styles.column}>
        <div className={styles.columnHeader}><h2>Synthèse Selen</h2><span>Analyse de l’agent</span></div>
        <section id="synthese-selen" className={styles.paper+" "+styles.analysis} aria-labelledby="analyse-title">
          <h3 id="analyse-title">Ton analyse</h3>
          <p className={styles.intro}>Cette synthèse alimente la fiche de suivi et prépare la décision de l’OF. L’agent n’accepte ni ne refuse la candidature.</p>
          {readOnly?<div className={styles.alert}><p>{final?"Décision OF déjà enregistrée. L’analyse est conservée en lecture seule.":"Cette version de formation est archivée. L’analyse est conservée en lecture seule."}</p></div>:null}
          <form action={saveAnalysis} className={styles.analysisForm}>
            <input type="hidden" name="id" value={req.id}/>
            <input type="hidden" name="candidature_updated_at" value={String(req.updated_at??"")}/>
            {analysisGroups.map(group=><div key={group.title} className={styles.analysisGroup}>
              <h3>{group.title}</h3>
              {group.fields.map(field=><div key={field.name} className={styles.field}>
                <label htmlFor={field.name}>{field.label}{field.required?<span className={styles.required} aria-hidden="true"> *</span>:null}</label>
                <textarea id={field.name} name={field.name} defaultValue={String(summary[field.name]??"")} rows={field.name==="observations"?5:3} required={field.required} disabled={readOnly} placeholder={field.placeholder}/>
              </div>)}
            </div>)}
            {!readOnly?<div className={styles.formFooter}>
              {transmissionBlock?<div id="transmission-block" className={styles.alert}><p>{transmissionBlock}</p></div>:null}
              <button type="submit" className={styles.submit} disabled={Boolean(transmissionBlock)} aria-describedby={transmissionBlock?"transmission-block":"transmission-hint"}>Terminer l’analyse et transmettre à l’OF</button>
              <p id="transmission-hint" className={styles.formHint}>Les champs marqués * sont obligatoires. L’OF prendra ensuite la décision d’accepter ou de refuser la candidature.</p>
            </div>:null}
          </form>
          {completedAt?<p className={styles.completion}>Analyse terminée le {completedAt} par {String(summary.evaluator_email??"Selen")}.</p>:null}
        </section>
      </div>
    </div>
  </main>;
}
