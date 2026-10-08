import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { isDailyOrganisationInAgentScope } from "@/lib/server/dailyOrganisationScope";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

type Props = { params: Promise<{ id: string }> };

function cleanText(value: unknown, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength) || null;
}

export async function POST(request: Request, { params }: Props) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const { id: sessionId } = await params;
  const payload = await request.json().catch(() => null);
  const enrolmentId = String(payload?.enrolment_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(enrolmentId)) {
    return NextResponse.json({ ok: false, error: "Session ou inscription invalide." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: session, error: sessionError } = await admin
    .from("daily_sessions")
    .select("id,organisation_id,status,end_date")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return NextResponse.json({ ok: false, error: sessionError.message }, { status: 500 });
  if (!session?.organisation_id || ["archived", "cancelled"].includes(String(session.status))) {
    return NextResponse.json({ ok: false, error: "Session introuvable ou inactive." }, { status: 404 });
  }
  if (!(await isDailyOrganisationInAgentScope(auth.email, session.organisation_id))) {
    return NextResponse.json({ ok: false, error: "Organisme hors du périmètre Daily de cet agent." }, { status: 403 });
  }

  const [{ data: enrolment, error: enrolmentError }, { data: assessment }, { data: feedback }] = await Promise.all([
    admin.from("daily_session_enrolments").select("id,status").eq("id", enrolmentId).eq("organisation_id", session.organisation_id).eq("session_id", sessionId).maybeSingle(),
    admin.from("daily_learning_assessments").select("id").eq("organisation_id", session.organisation_id).eq("session_id", sessionId).eq("enrolment_id", enrolmentId).neq("outcome", "pending").limit(1).maybeSingle(),
    admin.from("daily_learner_feedback_responses").select("id").eq("organisation_id", session.organisation_id).eq("session_id", sessionId).eq("enrolment_id", enrolmentId).limit(1).maybeSingle(),
  ]);
  if (enrolmentError) return NextResponse.json({ ok: false, error: enrolmentError.message }, { status: 500 });
  if (!enrolment || ["declined", "cancelled", "abandoned"].includes(String(enrolment.status))) {
    return NextResponse.json({ ok: false, error: "Inscription introuvable ou inactive." }, { status: 404 });
  }
  if (!assessment && !feedback) {
    return NextResponse.json({ ok: false, error: "Aucune évaluation ni satisfaction ne permet encore cette analyse." }, { status: 409 });
  }

  const row = {
    organisation_id: session.organisation_id,
    session_id: sessionId,
    enrolment_id: enrolmentId,
    strengths: cleanText(payload?.strengths),
    weaknesses: cleanText(payload?.weaknesses),
    vigilance: cleanText(payload?.vigilance),
    summary: cleanText(payload?.summary),
    action_required: Boolean(payload?.action_required),
    updated_by: auth.userId,
  };
  if (!row.strengths && !row.weaknesses && !row.vigilance && !row.summary && !row.action_required) {
    return NextResponse.json({ ok: false, error: "Renseignez au moins un élément d’analyse." }, { status: 400 });
  }

  const { data, error } = await admin
    .from("daily_posttraining_analyses")
    .upsert({ ...row, created_by: auth.userId }, { onConflict: "organisation_id,session_id,enrolment_id" })
    .select("id,updated_at")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, analysis: data }, { headers: { "Cache-Control": "private, no-store" } });
}
