import { NextResponse } from "next/server";

import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type RegistrationSummaryInput = {
  response_type: string | null;
  respondent_first_name?: string | null;
  respondent_last_name?: string | null;
  company_name?: string | null;
  need_answers?: Record<string, unknown> | null;
  positioning_answers?: Record<string, unknown> | null;
  adaptation_needed?: boolean | null;
};

function buildRegistrationSummary(responses: RegistrationSummaryInput[]) {
  const collect = (key: string) =>
    responses
      .map((response) => String(response.need_answers?.[key] ?? "").trim())
      .filter(Boolean);
  const collectType = (type: string, key: string) =>
    responses
      .filter((response) => response.response_type === type)
      .map((response) => String(response.need_answers?.[key] ?? "").trim())
      .filter(Boolean);

  return {
    synthese_beneficiaire: {
      adresses_postales: collectType("beneficiary", "postal_address"),
      situations_professionnelles: collectType("beneficiary", "professional_situation"),
      diplomes_plus_eleves: collectType("beneficiary", "highest_diploma"),
      niveaux_connaissance_initiaux: collectType("beneficiary", "current_knowledge_level"),
      attentes: collectType("beneficiary", "expectations"),
      besoin_exprime: collectType("beneficiary", "expressed_need"),
      objectif: collectType("beneficiary", "objective"),
      motivations: collectType("beneficiary", "motivations"),
    },
    synthese_entreprise: {
      besoin_exprime: collectType("company", "expressed_need"),
      objectifs_salaries: collectType("company", "employee_objectives"),
      contexte: collectType("company", "request_context"),
    },
    points_communs: collect("details"),
    attentes: collect("expectations"),
    motivations: collect("motivations"),
    contraintes: collect("constraints"),
    demandes_specifiques: collect("specific_requests"),
    besoins_adaptation: [
      ...collect("adaptation_details"),
      ...collect("company_adaptation_details"),
    ],
    points_formateur: collect("specific_requests"),
    positionnement: responses
      .filter((response) => response.response_type === "beneficiary")
      .map((response) => response.positioning_answers)
      .filter((answers) => answers && Object.keys(answers).length > 0),
    adaptation_needed: responses.some((response) => Boolean(response.adaptation_needed)),
    response_count: responses.length,
    generated_at: new Date().toISOString(),
  };
}

function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const requestId = typeof body.request_id === "string" ? body.request_id.trim() : "";
  if (!requestId) {
    return NextResponse.json({ error: "Candidature invalide." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: application, error: applicationError } = await admin
    .from("daily_formation_registration_requests")
    .select(
      "id,formation_id,user_id,response_type,respondent_first_name,respondent_last_name,respondent_email,company_name,participants,need_answers,positioning_answers,adaptation_needed,status,submitted_at,attached_session_id,signature_consent_text,signature_data,signature_proof_hash,signature_signed_at,signature_ip_address,signature_user_agent",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (applicationError || !application) {
    return NextResponse.json({ error: "Candidature introuvable." }, { status: 404 });
  }

  if (application.status === "attached") {
    const { data: existing } = await admin
      .from("daily_registration_responses")
      .select("id,session_id,status")
      .eq("id", application.id)
      .maybeSingle();
    if (existing) return NextResponse.json({ response: existing, already_attached: true });
  }

  if (application.status !== "to_attach") {
    return NextResponse.json(
      { error: "Cette candidature n'est plus dans la file de rattachement." },
      { status: 409 },
    );
  }

  if (!application.attached_session_id) {
    return NextResponse.json(
      { error: "Aucune session n'a été choisie pour cette candidature." },
      { status: 409 },
    );
  }

  if (
    !application.signature_consent_text ||
    !application.signature_data ||
    !application.signature_proof_hash ||
    !application.signature_signed_at
  ) {
    return NextResponse.json(
      { error: "Le dossier doit être signé et horodaté avant son rattachement." },
      { status: 409 },
    );
  }

  const { data: formation, error: formationError } = await admin
    .from("daily_formations")
    .select("id,organisation_id")
    .eq("id", application.formation_id)
    .maybeSingle();
  if (formationError || !formation) {
    return NextResponse.json({ error: "Formation introuvable." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,user_id,formation_id,organisation_id,status,end_date,max_participants,adaptation_needed")
    .eq("id", application.attached_session_id)
    .maybeSingle();
  if (sessionError || !session) {
    return NextResponse.json({ error: "Session introuvable." }, { status: 404 });
  }

  if (
    session.formation_id !== application.formation_id ||
    session.organisation_id !== formation.organisation_id
  ) {
    return NextResponse.json(
      { error: "La session choisie ne correspond pas à la formation de la candidature." },
      { status: 409 },
    );
  }
  if (session.status !== "ready" || !session.max_participants) {
    return NextResponse.json(
      { error: "La session choisie n'est plus disponible." },
      { status: 409 },
    );
  }
  if (session.end_date && session.end_date < todayIsoDate()) {
    return NextResponse.json(
      { error: "La session choisie est déjà terminée." },
      { status: 409 },
    );
  }

  const { count, error: capacityError } = await admin
    .from("daily_session_enrolments")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id)
    .in("status", ["invited", "pending", "confirmed"]);
  if (capacityError) {
    return NextResponse.json({ error: capacityError.message }, { status: 500 });
  }
  if ((count ?? 0) >= Number(session.max_participants)) {
    return NextResponse.json(
      { error: "La session est désormais complète. Le dossier reste à traiter sans rattachement." },
      { status: 409 },
    );
  }

  const responsePayload = {
    id: application.id,
    session_id: session.id,
    user_id: session.user_id,
    response_type: application.response_type,
    respondent_first_name: application.respondent_first_name,
    respondent_last_name: application.respondent_last_name,
    respondent_email: application.respondent_email,
    company_name: application.company_name,
    participants: application.participants ?? [],
    need_answers: application.need_answers ?? {},
    positioning_answers: application.positioning_answers ?? {},
    adaptation_needed: Boolean(application.adaptation_needed),
    status: "submitted",
    submitted_at: application.submitted_at ?? application.signature_signed_at,
    signature_consent_text: application.signature_consent_text,
    signature_data: application.signature_data,
    signature_proof_hash: application.signature_proof_hash,
    signature_signed_at: application.signature_signed_at,
    signature_ip_address: application.signature_ip_address,
    signature_user_agent: application.signature_user_agent,
  };

  const { data: existingResponse, error: existingError } = await admin
    .from("daily_registration_responses")
    .select("id,session_id,status")
    .eq("id", application.id)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  if (existingResponse && existingResponse.session_id !== session.id) {
    return NextResponse.json(
      { error: "Cette candidature a déjà été convertie vers une autre session." },
      { status: 409 },
    );
  }

  if (!existingResponse) {
    const { error: insertError } = await admin
      .from("daily_registration_responses")
      .insert(responsePayload);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 });
    }
  }

  const { data: responses, error: responsesError } = await admin
    .from("daily_registration_responses")
    .select(
      "response_type,respondent_first_name,respondent_last_name,company_name,need_answers,positioning_answers,adaptation_needed",
    )
    .eq("session_id", session.id)
    .eq("status", "submitted");
  if (responsesError) {
    return NextResponse.json({ error: responsesError.message }, { status: 500 });
  }

  const summary = buildRegistrationSummary((responses ?? []) as RegistrationSummaryInput[]);
  const now = new Date().toISOString();
  const { error: sessionUpdateError } = await admin
    .from("daily_sessions")
    .update({
      registration_status: "summary_to_review",
      registration_summary: summary,
      adaptation_needed: Boolean(session.adaptation_needed) || summary.adaptation_needed,
      registration_responses_received_at: application.submitted_at ?? application.signature_signed_at,
      registration_summary_validated_at: null,
      updated_at: now,
    })
    .eq("id", session.id);
  if (sessionUpdateError) {
    return NextResponse.json({ error: sessionUpdateError.message }, { status: 500 });
  }

  const { data: attached, error: attachError } = await admin
    .from("daily_formation_registration_requests")
    .update({ status: "attached", updated_at: now })
    .eq("id", application.id)
    .eq("status", "to_attach")
    .select("id,status,attached_session_id")
    .single();
  if (attachError) {
    return NextResponse.json({ error: attachError.message }, { status: 400 });
  }

  const { count: remaining, error: remainingError } = await admin
    .from("daily_formation_registration_requests")
    .select("id", { count: "exact", head: true })
    .eq("formation_id", application.formation_id)
    .eq("status", "to_attach");
  if (!remainingError && (remaining ?? 0) === 0) {
    await admin
      .from("daily_formations")
      .update({ spontaneous_registration_task_status: "attached", updated_at: now })
      .eq("id", application.formation_id);
  }

  return NextResponse.json({
    response: attached,
    session_id: session.id,
    next_step: "summary_to_review",
  });
}
