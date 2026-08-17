import { NextResponse } from "next/server";
import { requireSupportAgent } from "@/app/agent/api/support/_utils";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const auth = await requireSupportAgent();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const action = typeof body.action === "string" ? body.action : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!id || !["review", "forward", "resolve"].includes(action)) {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin
    .from("daily_stakeholder_feedback")
    .select("id,status,organisation_response")
    .eq("id", id)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: "Réclamation ou suggestion introuvable." }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (action === "review") {
    if (current.status !== "received") {
      return NextResponse.json(
        { error: "Cette demande a déjà quitté la file de revue initiale Selen." },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from("daily_stakeholder_feedback")
      .update({
        status: "selen_reviewed",
        selen_review_note: note || null,
        selen_reviewed_at: now,
        selen_reviewed_by: userId,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "received")
      .select("id,status,selen_review_note,selen_reviewed_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ feedback: data });
  }

  if (action === "forward") {
    if (current.status !== "selen_reviewed") {
      return NextResponse.json(
        { error: "La demande doit être revue par Selen avant d’être transmise à l’organisme." },
        { status: 409 }
      );
    }

    const { data, error } = await admin
      .from("daily_stakeholder_feedback")
      .update({
        status: "forwarded_to_organisation",
        forwarded_at: now,
        forwarded_by: userId,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "selen_reviewed")
      .select("id,status,forwarded_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ feedback: data });
  }

  if (current.status !== "forwarded_to_organisation") {
    return NextResponse.json(
      { error: "Seule une demande transmise à l’organisme peut être clôturée." },
      { status: 409 }
    );
  }
  if (!String(current.organisation_response ?? "").trim()) {
    return NextResponse.json(
      { error: "La réponse de l’organisme doit être enregistrée avant la clôture Selen." },
      { status: 409 }
    );
  }

  const { data, error } = await admin
    .from("daily_stakeholder_feedback")
    .update({
      status: "resolved",
      resolved_at: now,
      resolved_by: userId,
      updated_at: now,
    })
    .eq("id", id)
    .eq("status", "forwarded_to_organisation")
    .select("id,status,resolved_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ feedback: data });
}
