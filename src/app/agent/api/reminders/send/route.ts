import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClientReminder } from "@/lib/server/clientReminders";

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

    if (!reminderId) {
      return NextResponse.json(
        { error: "reminderId manquant." },
        { status: 400 },
      );
    }

    const result = await sendClientReminder({
      reminderId,
      agentEmail: auth.email,
      subject: String(body.subject ?? "").trim(),
      bodyHtml: String(body.bodyHtml ?? "").trim(),
      bodyText: String(body.bodyText ?? "").trim(),
    });

    const { createSupabaseAdminClient } =
      await import("@/lib/server/supabaseAdmin");
    const admin = createSupabaseAdminClient();

    await admin.from("client_reminder_events").insert({
      reminder_id: reminderId,
      event_type: result.sent ? "sent" : "failed",
      agent_email: auth.email,
      subject: String(body.subject ?? "").trim(),
      body_html: String(body.bodyHtml ?? "").trim(),
      body_text: String(body.bodyText ?? "").trim(),
      metadata: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Envoi relance client échoué.", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
