import Link from "next/link";
import { dailyPrerequisiteContract } from "@/lib/server/dailyStudioPrerequisiteEvidence";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { CANDIDATURE_VIEWS, countCandidatureQueueViews, filterCandidatureQueue, normalizeCandidatureSearch, normalizeCandidatureView, prioritizeCandidatureQueue } from "@/lib/daily/dailyCandidatureQueue.mjs";
export const dynamic = "force-dynamic";
type CandidatureRow = {
  id: string;
  formation_id: string;
  respondent_first_name: string | null;
  respondent_last_name: string | null;
  respondent_email: string | null;
  company_name: string | null;
  response_type: string | null;
  submitted_at: string | null;
  decision_status: string;
  prerequisite_contract: unknown;
  daily_formations: { title?: string | null } | Array<{ title?: string | null }> | null;
};
export default async function DailyCandidaturesPage({ searchParams }: { searchParams: Promise<{ organisation?: string; q?: string | string[]; vue?: string | string[] }> }) {
  const { organisation: requestedOrganisation, q: rawQuery, vue: rawView } = await searchParams;
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  let organisationIds: string[];
  try {
    organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  } catch {
    return <main role="alert" style={{ padding: 28 }}>Impossible de vérifier votre périmètre Daily. Réessayez plus tard.</main>;
  }
  const scopedOrganisationIds = requestedOrganisation && organisationIds.includes(requestedOrganisation) ? [requestedOrganisation] : organisationIds;
  if (requestedOrganisation && !organisationIds.includes(requestedOrganisation)) return <main style={{padding:28}}>Organisme inaccessible.</main>;
  const { data: formations, error: formationError } = scopedOrganisationIds.length
    ? await admin.from("daily_formations").select("id,prerequisite_mode,prerequisite_requirements").in("organisation_id", scopedOrganisationIds).neq("status", "archived")
    : { data: [], error: null };
  if (formationError) return <main style={{padding:28}}>Chargement impossible.</main>;
  const formationIds = (formations ?? []).map(row => row.id);
  const formationById = new Map((formations ?? []).map(row => [row.id, row]));
  const { data, error } = formationIds.length ? await admin.from("daily_formation_registration_requests")
    .select("id,formation_id,respondent_first_name,respondent_last_name,respondent_email,company_name,response_type,submitted_at,decision_status,prerequisite_contract,daily_formations(title)")
    .in("formation_id", formationIds).in("decision_status", ["pending","ready_for_of"]).order("submitted_at",{ascending:true}) : { data: [], error: null };
  if (error) return <main style={{padding:28}}>Chargement impossible : {error.message}</main>;
  const rows=(data??[]) as CandidatureRow[];
  const requestIds = rows.map((row) => row.id);
  const { data: evidence, error: evidenceError } = requestIds.length
    ? await admin.from("daily_prerequisite_evidence")
        .select("registration_request_id,status")
        .in("registration_request_id", requestIds)
    : { data: [], error: null };
  if (evidenceError) return <main style={{padding:28}}>Chargement des prérequis impossible.</main>;
  const evidenceByRequest = new Map<string, { submitted: number; rejected: number; verified: number }>();
  for (const item of evidence ?? []) {
    if (!item.registration_request_id) continue;
    const counts = evidenceByRequest.get(item.registration_request_id) ?? { submitted: 0, rejected: 0, verified: 0 };
    if (item.status === "submitted") counts.submitted++;
    if (item.status === "rejected") counts.rejected++;
    if (item.status === "verified") counts.verified++;
    evidenceByRequest.set(item.registration_request_id, counts);
  }
  const prioritizedRows = prioritizeCandidatureQueue(rows, evidenceByRequest) as CandidatureRow[];
  const query = normalizeCandidatureSearch(rawQuery);
  const view = normalizeCandidatureView(rawView);
  const viewCounts = countCandidatureQueueViews(rows, evidenceByRequest);
  // Tri et recherche uniquement après les lectures limitées aux organismes affectés.
  const visibleRows = filterCandidatureQueue(prioritizedRows, query, view, evidenceByRequest) as CandidatureRow[];
  return <main style={{maxWidth:1080,margin:"0 auto",padding:"28px"}}>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--selen-gold2)"}}>Selen Daily · Candidatures</p>
    <h1>Analyse des dossiers</h1>
    {requestedOrganisation ? <p><Link href="/agent/daily/candidatures">← Toutes les candidatures</Link></p> : null}
    <p style={{color:"var(--selen-text2)"}}>Selen analyse le dossier avant toute décision de l’organisme. Une analyse terminée devient ensuite visible côté OF pour acceptation ou refus.</p>
    <form action="/agent/daily/candidatures" method="get" role="search" aria-label="Filtrer les candidatures" style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end",marginTop:20,padding:16,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)"}}>
      {requestedOrganisation ? <input type="hidden" name="organisation" value={requestedOrganisation} /> : null}
      <label htmlFor="candidature-search" style={{display:"grid",gap:5,flex:"1 1 240px",fontSize:12,fontWeight:700}}>
        Candidat, entreprise ou formation
        <input id="candidature-search" type="search" name="q" maxLength={80} defaultValue={query} placeholder="Rechercher un dossier…" style={{minHeight:40,padding:"8px 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg)",color:"var(--selen-text)"}} />
      </label>
      <label htmlFor="candidature-view" style={{display:"grid",gap:5,flex:"1 1 210px",fontSize:12,fontWeight:700}}>
        Étape à traiter
        <select id="candidature-view" name="vue" defaultValue={view} style={{minHeight:40,padding:"8px 11px",border:"1px solid var(--selen-border)",borderRadius:9,background:"var(--selen-bg)",color:"var(--selen-text)"}}>
          {Object.entries(CANDIDATURE_VIEWS).map(([key,label]) => <option key={key} value={key}>{label} ({viewCounts[key as keyof typeof viewCounts]})</option>)}
        </select>
      </label>
      <button type="submit" style={{minHeight:40,padding:"8px 14px",border:0,borderRadius:9,background:"var(--selen-gold2)",color:"var(--selen-bg)",fontWeight:800,cursor:"pointer"}}>Filtrer</button>
      {(query || view !== "all") ? <Link href={requestedOrganisation ? `/agent/daily/candidatures?organisation=${encodeURIComponent(requestedOrganisation)}` : "/agent/daily/candidatures"} style={{fontSize:12,color:"var(--selen-text2)"}}>Réinitialiser</Link> : null}
    </form>
    <p role="status" style={{color:"var(--selen-text2)",fontSize:12,marginTop:12}}>{visibleRows.length} dossier{visibleRows.length > 1 ? "s" : ""} affiché{visibleRows.length > 1 ? "s" : ""} sur {rows.length}. Les justificatifs reçus et refusés sont traités en priorité.</p>
    <div style={{display:"grid",gap:10,marginTop:18}}>
      {visibleRows.map((row)=>{ const label=row.company_name || [row.respondent_first_name,row.respondent_last_name].filter(Boolean).join(" ") || row.respondent_email || "Candidat";
        const formation = Array.isArray(row.daily_formations) ? row.daily_formations[0] : row.daily_formations;
        const contract = dailyPrerequisiteContract(row.prerequisite_contract, formationById.get(row.formation_id) ?? {});
        const requiresEvidence = contract.mode === "required" && Array.isArray(contract.requirements) && contract.requirements.some((requirement) => requirement && typeof requirement === "object" && requirement.required !== false);
        const counts = evidenceByRequest.get(row.id) ?? { submitted: 0, rejected: 0, verified: 0 };
        const prerequisiteParts = [
          counts.submitted ? counts.submitted + " à vérifier" : "",
          counts.rejected ? counts.rejected + " refusé(s)" : "",
          counts.verified ? counts.verified + " vérifié(s)" : "",
        ].filter(Boolean);
        const prerequisiteLabel = !requiresEvidence ? null
          : prerequisiteParts.length ? prerequisiteParts.join(" · ") + " · Vérifier la couverture complète dans le dossier"
          : "Aucun justificatif reçu · Vérifier les pièces attendues dans le dossier";
        return <article key={row.id} style={{padding:16,border:"1px solid var(--selen-border)",borderRadius:12,background:"var(--selen-bg2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><strong>{label}</strong><span>{row.decision_status==="ready_for_of"?"Analyse terminée · décision OF attendue":"Analyse à réaliser"}</span></div>
          <p style={{margin:"6px 0",color:"var(--selen-text2)"}}>{formation?.title || "Formation"} · {row.submitted_at?new Date(row.submitted_at).toLocaleString("fr-FR"):"date inconnue"}</p>
          {prerequisiteLabel ? <p style={{margin:"6px 0",fontWeight:700,color:"var(--selen-gold2)"}}>Prérequis : {prerequisiteLabel}</p> : null}
          <Link href={`/agent/daily/candidatures/${row.id}${counts.submitted && row.decision_status === "pending" ? "#prerequis" : ""}`} style={{fontWeight:800,color:"var(--selen-gold2)"}}>{counts.submitted && row.decision_status === "pending" ? "Vérifier les justificatifs →" : row.decision_status === "ready_for_of" ? "Consulter l’analyse →" : "Analyser le dossier →"}</Link>
        </article>; })}
      {!visibleRows.length?<p>{rows.length ? "Aucune candidature ne correspond aux filtres sélectionnés." : "Aucune candidature à analyser ou en attente de décision OF."}</p>:null}
    </div>
  </main>;
}
