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

  if (!id || action !== "review") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: current, error: readError } = await admin
    .from("daily_stakeholder_feedback")
    .select("id,status")
    .eq("id", id)
    .single();

  if (readError || !current) {
    return NextResponse.json({ error: "Réclamation ou suggestion introuvable." }, { status: 404 });
  }

  if (current.status !== "received") {
    return NextResponse.json(
      { error: "Cette demande a déjà quitté la file de revue initiale Selen." },
      { status: 409 }
    );
  }

  const reviewedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("daily_stakeholder_feedback")
    .update({
      status: "selen_reviewed",
      selen_review_note: note || null,
      selen_reviewed_at: reviewedAt,
      selen_reviewed_by: userId,
      updated_at: reviewedAt,
    })
    .eq("id", id)
    .eq("status", "received")
    .select("id,status,selen_review_note,selen_reviewed_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ feedback: data });
}
