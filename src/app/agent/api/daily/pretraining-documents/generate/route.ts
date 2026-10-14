import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { getDailyOrganisationIdsForAgent } from "@/lib/server/dailyOrganisationScope";
import { createAgentAssistanceToken } from "@/lib/server/agentAssistanceTokens";
import { loadDailyPretrainingPreparation } from "@/lib/server/dailyPretrainingPreparation";
import { getVitrineBaseUrl } from "@/lib/vitrineLinks";

async function callDaily(req: Request, auth: {userId:string; email:string}, organisationId: string, path: string, method: "POST" | "PATCH", body: Record<string, unknown>) {
  const admin = createSupabaseAdminClient();
  let delegation: {tokenId:string;url:string} | undefined;
  try {
    delegation = await createAgentAssistanceToken({ agentUserId: auth.userId, agentEmail: auth.email, organisationId, headersList: req.headers });
    const target = new URL(path, getVitrineBaseUrl());
    const delegatedUrl = new URL(delegation.url);
    const token = delegatedUrl.searchParams.get("assistanceToken");
    if (delegatedUrl.origin !== target.origin || !token) throw new Error("Délégation indisponible.");
    const response = await fetch(target, { method, redirect:"error", cache:"no-store", signal:AbortSignal.timeout(25000), headers:{ "Content-Type":"application/json", "x-selen-agent-assistance":token }, body:JSON.stringify(body) });
    const result = await response.json().catch(() => null);
    if (!result) return NextResponse.json({ error:"Réponse documentaire Daily indisponible. Rechargez le dossier avant de réessayer." }, {status:502});
    return NextResponse.json(result, {status:response.status});
  } catch (cause) {
    console.error("Studio : échange documentaire Daily impossible", { path, error: cause instanceof Error ? cause.name : "UnknownError" });
    return NextResponse.json({error:"Connexion au service documentaire Daily impossible. Aucun résultat confirmé : rechargez le dossier avant de réessayer."}, {status:502});
  } finally {
    if (delegation) {
      const {error} = await admin.from("selen_agent_assistance_tokens").update({status:"revoked"}).eq("id",delegation.tokenId).eq("agent_user_id",auth.userId);
      if (error) return NextResponse.json({error:"La délégation n’a pas pu être clôturée. Rechargez le dossier et contactez Selen avant une nouvelle tentative."}, {status:502});
    }
  }
}

export async function GET(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({error:auth.error}, {status:auth.status});
  const sessionId = new URL(req.url).searchParams.get("session_id")?.trim();
  if (!sessionId) return NextResponse.json({error:"Session requise."}, {status:400});
  try {
    const preparation = await loadDailyPretrainingPreparation(createSupabaseAdminClient(), sessionId, await getDailyOrganisationIdsForAgent(auth.email));
    if (!preparation) return NextResponse.json({error:"Session inaccessible."}, {status:404});
    return NextResponse.json({preparation}, {headers:{"Cache-Control":"private, no-store"}});
  } catch (cause) { return NextResponse.json({error:cause instanceof Error ? cause.message : "Préparation indisponible."}, {status:500}); }
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({error:auth.error}, {status:auth.status});
  const body = await req.json().catch(() => ({}));
  if (body.confirm_prepare !== true || typeof body.session_id !== "string") return NextResponse.json({error:"Session et confirmation de préparation requises."}, {status:400});
  try {
    const preparation = await loadDailyPretrainingPreparation(createSupabaseAdminClient(), body.session_id, await getDailyOrganisationIdsForAgent(auth.email));
    if (!preparation) return NextResponse.json({error:"Session inaccessible."}, {status:404});
    if (!preparation.ready) return NextResponse.json({error:preparation.enrolments.length ? "Complétez les parties contractantes ci-dessous avant de générer les documents." : "Aucune inscription active dans cette session.", preparation}, {status:400});
    return await callDaily(req, auth, preparation.organisation_id, "/api/client/daily/pretraining-documents", "POST", {session_id:preparation.session_id, only_missing:true, confirm_delegated:true});
  } catch (cause) { return NextResponse.json({error:cause instanceof Error ? cause.message : "Préparation indisponible."}, {status:500}); }
}

export async function PATCH(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({error:auth.error}, {status:auth.status});
  const body = await req.json().catch(() => ({}));
  if (body.confirm_contracting_party !== true || typeof body.session_id !== "string" || typeof body.enrolment_id !== "string" || typeof body.expected_updated_at !== "string" || !body.expected_updated_at || !["individual", "company"].includes(body.contracting_party_type)) return NextResponse.json({error:"Inscription, choix explicite et version ouverte requis."}, {status:400});
  try {
    const preparation = await loadDailyPretrainingPreparation(createSupabaseAdminClient(), body.session_id, await getDailyOrganisationIdsForAgent(auth.email));
    const enrolment = preparation?.enrolments.find((row: {id:string}) => row.id === body.enrolment_id);
    if (!preparation || !enrolment) return NextResponse.json({error:"Inscription inaccessible."}, {status:404});
    if (enrolment.updated_at !== body.expected_updated_at) return NextResponse.json({error:"L’inscription a changé. Rechargez et vérifiez le choix actuel."}, {status:409});
    const companyName = body.contracting_party_type === "company" && typeof body.company_name === "string" ? body.company_name.trim() : null;
    if (body.contracting_party_type === "company" && !preparation.companies.includes(companyName ?? "")) return NextResponse.json({error:"Choisissez une entreprise commanditaire enregistrée dans la session."}, {status:400});
    return await callDaily(req, auth, preparation.organisation_id, "/api/client/daily/learners", "PATCH", {action:"contracting_party", id:enrolment.id, session_id:preparation.session_id, expected_updated_at:body.expected_updated_at, contracting_party_type:body.contracting_party_type, company_name:companyName, confirm_delegated:true});
  } catch (cause) { return NextResponse.json({error:cause instanceof Error ? cause.message : "Enregistrement indisponible."}, {status:500}); }
}
