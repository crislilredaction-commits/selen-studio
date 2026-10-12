import Link from "next/link";
import { dailyPrerequisiteContract } from "@/lib/server/dailyStudioPrerequisiteEvidence";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
export const dynamic = "force-dynamic";
export default async function DailyCandidaturesPage() {
  const auth = await requireSupportAgent();
  if (!auth.ok) return <main style={{padding:28}}>Accès refusé.</main>;
  const admin = createSupabaseAdminClient();
  const organisationIds = await getDailyOrganisationIdsForAgent(auth.email);
  const { data: formations, error: formationError } = organisationIds.length
    ? await admin.from("daily_formations").select("id,prerequisite_mode,prerequisite_requirements").in("organisation_id", organisationIds).neq("status", "archived")
    : { data: [], error: null };
  if (formationError) return <main style={{padding:28}}>Chargement impossible.</main>;
  const formationIds = (formations ?? []).map(row => row.id);
  const formationById = new Map((formations ?? []).map(row => [row.id, row]));
  const { data, error } = formationIds.length ? await admin.from("daily_formation_registration_requests")
    .select("id,formation_id,respondent_first_name,respondent_last_name,respondent_email,company_name,response_type,submitted_at,decision_status,prerequisite_contract,daily_formations(title)")
    .in("formation_id", formationIds).in("decision_status", ["pending","ready_for_of"]).order("submitted_at",{ascending:true}) : { data: [], error: null };
  if (error) return <main style={{padding:28}}>Chargement impossible : {error.message}</main>;
  const rows=(data??[]) as Array<any>;
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
  const prioritizedRows = [...rows].sort((a, b) => {
    const aReview = a.decision_status === "pending" && (evidenceByRequest.get(a.id)?.submitted ?? 0) > 0;
    const bReview = b.decision_status === "pending" && (evidenceByRequest.get(b.id)?.submitted ?? 0) > 0;
    if (aReview !== bReview) return aReview ? -1 : 1;
    if (a.decision_status !== b.decision_status) return a.decision_status === "pending" ? -1 : 1;
    return String(a.submitted_at ?? "").localeCompare(String(b.submitted_at ?? ""));
  });
  return <main style={{maxWidth:1080,margin:"0 auto",padding:"28px"}}>
    <p style={{fontSize:11,fontWeight:800,letterSpacing:".12em",textTransform:"uppercase",color:"var(--selen-gold2)"}}>Selen Daily · Candidatures</p>
    <h1>Analyse des dossiers</h1>
    <p style={{color:"var(--selen-text2)"}}>Selen analyse le dossier avant toute décision de l’organisme. Une analyse terminée devient ensuite visible côté OF pour acceptation ou refus.</p>
    <div style={{display:"grid",gap:10,marginTop:18}}>
      {prioritizedRows.map((row)=>{ const label=row.company_name || [row.respondent_first_name,row.respondent_last_name].filter(Boolean).join(" ") || row.respondent_email || "Candidat";
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
          <p style={{margin:"6px 0",color:"var(--selen-text2)"}}>{row.daily_formations?.title || "Formation"} · {row.submitted_at?new Date(row.submitted_at).toLocaleString("fr-FR"):"date inconnue"}</p>
          {prerequisiteLabel ? <p style={{margin:"6px 0",fontWeight:700,color:"var(--selen-gold2)"}}>Prérequis : {prerequisiteLabel}</p> : null}
          <Link href={`/agent/daily/candidatures/${row.id}${counts.submitted && row.decision_status === "pending" ? "#prerequis" : ""}`} style={{fontWeight:800,color:"var(--selen-gold2)"}}>{counts.submitted && row.decision_status === "pending" ? "Vérifier les justificatifs →" : row.decision_status === "ready_for_of" ? "Consulter l’analyse →" : "Analyser le dossier →"}</Link>
        </article>; })}
      {!rows.length?<p>Aucune candidature à analyser ou en attente de décision OF.</p>:null}
    </div>
  </main>;
}
