import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { LEARNER_VIEWS, countLearnerViews, filterLearnerEnrolments, learnerNeedsAttention, normalizeLearnerSearch, normalizeLearnerView, prioritizeLearnerEnrolments } from "@/lib/daily/dailyLearnerTriage.mjs";
import { filterLearnerOrganisation, learnerOrganisationOptions, resolveLearnerOrganisation } from "@/lib/daily/learnerOrganisationScope.mjs";

export const dynamic = "force-dynamic";
type Props = { searchParams?: Promise<{ q?: string | string[]; vue?: string | string[]; organisme?: string | string[] }> };

function badge(value: string) {
  const labels: Record<string,string> = { pending:"En attente", invited:"Invité", confirmed:"Confirmé", declined:"Refusé", cancelled:"Annulé", completed:"Terminé", not_started:"Non démarré", sent:"Envoyé", submitted:"Répondu", reviewed:"Relu", not_reviewed:"Non vérifiés", met:"Validés", not_met:"Non remplis", to_clarify:"À clarifier" };
  return labels[value] ?? value;
}

const INACTIVE_ENROLMENT_STATUSES = new Set(["declined", "cancelled", "canceled", "abandoned"]);

function isActiveEnrolment(status: unknown) {
  return !INACTIVE_ENROLMENT_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export default async function DailyLearnersStudioPage({ searchParams }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{ padding: 28 }}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  let organisationIds: string[];
  try {
    organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main role="alert" style={{ padding: 28 }}>Impossible de vérifier votre périmètre Daily. Réessayez plus tard.</main>;
  }

  const { data: enrolments, error: enrolmentsError } = organisationIds.length
    ? await admin.from("daily_session_enrolments").select("*,daily_learners(id,first_name,last_name,email),daily_sessions(id,internal_reference,start_date,end_date,daily_formations(title)),organisations(name)").in("organisation_id", organisationIds).order("created_at", { ascending: false })
    : { data: [], error: null };
  if (enrolmentsError) return <main role="alert" style={{ padding: 28 }}>Chargement des inscriptions impossible. Réessayez plus tard.</main>;

  const allEnrolments = enrolments ?? [];
  const activeEnrolments = allEnrolments.filter((item) => isActiveEnrolment(item.status));
  const historicalEnrolments = allEnrolments.filter((item) => !isActiveEnrolment(item.status));
  const enrolmentIds = activeEnrolments.map((item) => item.id);
  const { data: supportNeeds, error: needsError } = enrolmentIds.length
    ? await admin.from("daily_enrolment_support_needs").select("*").in("organisation_id", organisationIds).in("enrolment_id", enrolmentIds).eq("has_specific_needs", true)
    : { data: [], error: null };
  if (needsError) return <main role="alert" style={{ padding: 28 }}>Chargement des adaptations impossible. Réessayez plus tard.</main>;

  const needsMap = new Map((supportNeeds ?? []).map((item) => [item.enrolment_id, item]));
  const params = await searchParams;
  const query = normalizeLearnerSearch(params?.q);
  const view = normalizeLearnerView(params?.vue);
  // Les choix proviennent uniquement des inscriptions déjà bornées aux OF affectés.
  const organisationOptions = learnerOrganisationOptions(allEnrolments);
  const selectedOrganisation = resolveLearnerOrganisation(params?.organisme, organisationOptions);
  if (!selectedOrganisation.valid) return <main role="alert" style={{ padding: 28 }}>Organisme inaccessible.</main>;
  const scopedActiveEnrolments = filterLearnerOrganisation(activeEnrolments, selectedOrganisation.id) as typeof activeEnrolments;
  const scopedHistoricalEnrolments = filterLearnerOrganisation(historicalEnrolments, selectedOrganisation.id) as typeof historicalEnrolments;
  const scopedEnrolmentIds = new Set(scopedActiveEnrolments.map((item) => item.id));
  const activeLearners = new Set(scopedActiveEnrolments.map((item) => item.learner_id).filter(Boolean)).size;
  const confirmed = scopedActiveEnrolments.filter((e) => e.status === "confirmed").length;
  const adaptations = (supportNeeds ?? []).filter((item) => scopedEnrolmentIds.has(item.enrolment_id)).length;
  const pendingPositioning = scopedActiveEnrolments.filter((e) => ["not_started","sent","submitted"].includes(e.positioning_status)).length;
  // Les compteurs, priorités et historiques suivent tous le même filtre d'organisme.
  const counts = countLearnerViews(scopedActiveEnrolments, needsMap);
  const prioritizedActiveEnrolments = prioritizeLearnerEnrolments(scopedActiveEnrolments, needsMap);
  const visibleActiveEnrolments = filterLearnerEnrolments(prioritizedActiveEnrolments, query, view, needsMap) as typeof activeEnrolments;
  const visibleHistoricalEnrolments = filterLearnerEnrolments(scopedHistoricalEnrolments, query, "all") as typeof historicalEnrolments;

  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "clamp(16px, 4vw, 28px)", minWidth: 0 }}>
    <div style={{ marginBottom: 22, minWidth: 0 }}><p style={{ fontSize: 12, fontWeight: 700, color: "var(--selen-text2)" }}>SELEN DAILY</p><h1 style={{ overflowWrap: "anywhere" }}>Apprenants & inscriptions</h1><p style={{ color: "var(--selen-text2)", overflowWrap: "anywhere" }}>Vue transverse des apprenants, inscriptions, positionnements et adaptations.</p></div>
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(160px,100%),1fr))", gap:12, marginBottom:20 }}>
      {[["Participants actifs",activeLearners],["Inscriptions confirmées",confirmed],["Positionnements à suivre",pendingPositioning],["Adaptations actives",adaptations]].map(([label,value])=><div key={String(label)} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:16,background:"var(--selen-bg2)",minWidth:0}}><div style={{fontSize:26,fontWeight:800}}>{value}</div><div style={{fontSize:12,color:"var(--selen-text2)",overflowWrap:"anywhere"}}>{label}</div></div>)}
    </div>
    <form action="/agent/daily/learners" method="get" role="search" aria-label="Filtrer les inscriptions" style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end",padding:16,marginBottom:12,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)"}}>
      <label htmlFor="learner-organisation" style={{display:"grid",gap:5,flex:"1 1 220px",fontSize:12,fontWeight:700}}>
        Organisme de formation
        <select id="learner-organisation" name="organisme" defaultValue={selectedOrganisation.id ?? ""} style={{minHeight:44,padding:"8px 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg)",color:"var(--selen-text)",minWidth:0}}>
          <option value="">Tous les organismes affectés</option>
          {organisationOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <label htmlFor="learner-search" style={{display:"grid",gap:5,flex:"1 1 230px",fontSize:12,fontWeight:700}}>
        Apprenant, organisme, formation ou session
        <input id="learner-search" type="search" name="q" maxLength={80} defaultValue={query} placeholder="Rechercher une inscription…" style={{minHeight:44,padding:"8px 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg)",color:"var(--selen-text)",minWidth:0}} />
      </label>
      <label htmlFor="learner-view" style={{display:"grid",gap:5,flex:"1 1 220px",fontSize:12,fontWeight:700}}>
        Priorité de traitement
        <select id="learner-view" name="vue" defaultValue={view} style={{minHeight:44,padding:"8px 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg)",color:"var(--selen-text)",minWidth:0}}>
          {Object.entries(LEARNER_VIEWS).map(([key,label]) => <option key={key} value={key}>{label} ({counts[key as keyof typeof counts]})</option>)}
        </select>
      </label>
      <button type="submit" style={{minHeight:44,padding:"8px 14px",border:0,borderRadius:9,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:800,cursor:"pointer"}}>Filtrer</button>
      {(query || view !== "all" || selectedOrganisation.id) ? <Link href="/agent/daily/learners" style={{fontSize:12,minHeight:44,display:"inline-flex",alignItems:"center"}}>Réinitialiser</Link> : null}
    </form>
    <p role="status" style={{fontSize:12,color:"var(--selen-text2)",margin:"0 0 14px"}}>{visibleActiveEnrolments.length} inscription{visibleActiveEnrolments.length > 1 ? "s" : ""} active{visibleActiveEnrolments.length > 1 ? "s" : ""} affichée{visibleActiveEnrolments.length > 1 ? "s" : ""} sur {scopedActiveEnrolments.length}. Adaptations, prérequis et positionnements sont traités en priorité.</p>
    <section style={{ display:"grid", gap:12, minWidth: 0 }}>
      {visibleActiveEnrolments.length === 0 ? <div style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:18}}>{scopedActiveEnrolments.length ? "Aucune inscription ne correspond aux filtres sélectionnés." : "Aucune inscription active pour cet organisme ou ce périmètre."}</div> : visibleActiveEnrolments.map((e) => {
        const need = needsMap.get(e.id);
        const attention = learnerNeedsAttention(e, needsMap);
        const session = e.daily_sessions as { id?: string; internal_reference?: string | null; start_date?: string | null; daily_formations?: { title?: string | null } | null } | null;
        const learner = e.daily_learners as { id?: string; first_name?: string; last_name?: string; email?: string | null } | null;
        const org = e.organisations as { name?: string } | null;
        return <article key={e.id} style={{border:"1px solid var(--selen-border)",borderRadius:12,padding:"clamp(12px, 3vw, 16px)",background:"var(--selen-bg2)",minWidth:0,overflow:"hidden"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",minWidth:0}}><div style={{minWidth:0,flex:"1 1 240px",overflowWrap:"anywhere"}}><strong>{learner?.first_name} {learner?.last_name}</strong>{learner?.email ? ` · ${learner.email}` : ""}<div style={{fontSize:12,color:"var(--selen-text2)",marginTop:4,overflowWrap:"anywhere"}}>{org?.name ?? "Organisme"} · {session?.daily_formations?.title ?? "Session"} · {session?.internal_reference ?? session?.start_date ?? ""}</div></div><div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{learner?.id ? <Link href={`/agent/daily/learners/${learner.id}?session=${encodeURIComponent(e.session_id)}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Ouvrir la fiche apprenant</Link> : null}<Link href={`/agent/daily/session-dossiers/${e.session_id}`} style={{fontSize:12,display:"inline-flex",alignItems:"center",minHeight:32}}>Ouvrir le dossier</Link></div></div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10,fontSize:12,minWidth:0}}>{attention.adaptations || attention.prerequisites || attention.positioning ? <span style={{fontWeight:800,color:"var(--selen-gold2)"}}>À traiter : {attention.adaptations ? "adaptation" : attention.prerequisites ? "prérequis" : "positionnement"}</span> : null}<span style={{overflowWrap:"anywhere"}}>Inscription : <b>{badge(e.status)}</b></span><span style={{overflowWrap:"anywhere"}}>Positionnement : <b>{badge(e.positioning_status)}</b></span><span style={{overflowWrap:"anywhere"}}>Prérequis : <b>{badge(e.prerequisites_status)}</b></span><span style={{overflowWrap:"anywhere"}}>Financement : <b>{e.funding_type}</b></span></div>
          {need && <div style={{marginTop:10,padding:10,borderRadius:8,background:"rgba(210,145,65,.10)",overflowWrap:"anywhere"}}><strong>Adaptation à prévoir</strong>{need.needs_description ? <p style={{margin:"4px 0"}}>{need.needs_description}</p> : null}{need.planned_accommodations ? <p style={{margin:"4px 0"}}>Prévu : {need.planned_accommodations}</p> : null}{need.contact_requested ? <p style={{margin:"4px 0"}}>Un échange complémentaire est demandé.</p> : null}</div>}
        </article>;
      })}
    </section>
    {view === "all" && visibleHistoricalEnrolments.length ? <details style={{marginTop:20,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)",overflow:"hidden"}}>
      <summary style={{cursor:"pointer",padding:16,fontWeight:800}}>Historique des inscriptions closes ({visibleHistoricalEnrolments.length})</summary>
      <div style={{display:"grid",gap:10,padding:"0 16px 16px"}}>{visibleHistoricalEnrolments.map((e) => {
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
