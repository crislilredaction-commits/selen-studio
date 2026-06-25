import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/server/supabaseAdmin";

async function requireAgent() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email?.trim().toLowerCase();

  if (!email)
    return { ok: false as const, error: "Non authentifié.", status: 401 };

  const { data: profile, error } = await supabase
    .from("agent_profiles")
    .select("role, is_active")
    .eq("email", email)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message, status: 500 };
  if (!profile || !["agent", "admin"].includes(profile.role)) {
    return { ok: false as const, error: "Accès agent requis.", status: 403 };
  }

  return { ok: true as const, email };
}

export async function POST(req: Request) {
  const auth = await requireAgent();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const reminderId = String(body.reminderId ?? "").trim();
    const action = String(body.action ?? "").trim();

    if (!reminderId) {
      return NextResponse.json(
        { error: "reminderId manquant." },
        { status: 400 },
      );
    }

    const admin = createSupabaseAdminClient();
    const now = new Date();
    const update: Record<string, unknown> = {
      updated_at: now.toISOString(),
    };

    if (action === "save") {
      update.status = body.status === "draft" ? "draft" : "ready";
      update.subject = String(body.subject ?? "").trim();
      update.body_html = String(body.bodyHtml ?? "").trim();
      update.body_text = String(body.bodyText ?? "").trim();
    } else if (action === "ignore") {
      update.status = "ignored";
    } else if (action === "postpone") {
      update.status = "postponed";
      update.due_at = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
    } else {
      return NextResponse.json({ error: "Action invalide." }, { status: 400 });
    }

    const { error } = await admin
      .from("client_reminders")
      .update(update)
      .eq("id", reminderId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from("client_reminder_events").insert({
      reminder_id: reminderId,
      event_type:
        action === "save"
          ? "edited"
          : action === "ignore"
            ? "ignored"
            : "postponed",
      agent_email: auth.email,
      subject: String(body.subject ?? "").trim(),
      body_html: String(body.bodyHtml ?? "").trim(),
      body_text: String(body.bodyText ?? "").trim(),
      metadata: { action },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Mise à jour relance échouée.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
